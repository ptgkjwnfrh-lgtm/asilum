import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeShopDomain, verifyShopifyWebhookHmac } from "../../../../lib/connections/shopify.js";
import { readBytes } from "../../../../lib/security/http.js";
import {
  enqueueCatalogJob, getMerchantConnectionByDomain, recordWebhookDelivery,
  purgeMerchantConnectionFromProvider, revokeMerchantConnectionFromProvider,
  updateConnectionScopesFromProvider,
} from "../../../../lib/db/production.js";

export const dynamic = "force-dynamic";

const COMPLIANCE_TOPICS = new Set(["customers/data_request", "customers/redact", "shop/redact"]);

function productGid(payload) {
  if (typeof payload?.admin_graphql_api_id === "string") return payload.admin_graphql_api_id;
  return /^\d+$/.test(String(payload?.id || "")) ? `gid://shopify/Product/${payload.id}` : null;
}

export async function POST(req) {
  let bytes;
  try { bytes = await readBytes(req, 512 * 1024); }
  catch { return NextResponse.json({ error: "webhook body too large" }, { status: 413 }); }
  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";
  if (!verifyShopifyWebhookHmac(bytes, hmac)) return NextResponse.json({ error: "invalid webhook signature" }, { status: 401 });
  const topic = String(req.headers.get("x-shopify-topic") || "").toLowerCase();
  const shopDomain = normalizeShopDomain(req.headers.get("x-shopify-shop-domain"));
  const deliveryId = String(req.headers.get("x-shopify-webhook-id") || "");
  if (!topic || !shopDomain || !deliveryId) return NextResponse.json({ error: "missing webhook identity" }, { status: 400 });
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return NextResponse.json({ error: "invalid webhook JSON" }, { status: 400 }); }
  const connection = await getMerchantConnectionByDomain("shopify", shopDomain, {
    secrets: false, includeRevoked: topic === "shop/redact",
  });
  const sourceProductId = productGid(payload);
  const fresh = await recordWebhookDelivery({
    deliveryId, connectionId: connection?.id || null, shopDomain, topic,
    sourceObjectId: sourceProductId, sourceUpdatedAt: payload?.updated_at || null,
    safePayload: { kind: COMPLIANCE_TOPICS.has(topic) ? "privacy_request_no_customer_data_retained" : "catalog_event" },
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
  });
  if (!fresh) return NextResponse.json({ accepted: true, duplicate: true });

  if (topic === "app/uninstalled" || topic === "shop/redact") {
    if (connection) {
      if (topic === "shop/redact") await purgeMerchantConnectionFromProvider(connection.id);
      else await revokeMerchantConnectionFromProvider(connection.id);
    }
    return NextResponse.json({ accepted: true, catalogWithdrawn: Boolean(connection) });
  }
  // ASILUM stores no Shopify customer or order records. These mandatory
  // topics therefore require no customer lookup and intentionally retain no
  // customer identifiers from the payload.
  if (topic === "customers/data_request" || topic === "customers/redact") {
    return NextResponse.json({ accepted: true, customerDataRetained: false });
  }
  if (!connection) return NextResponse.json({ accepted: true, ignored: "store is not connected" });
  if (topic === "app/scopes_update") {
    const scopes = Array.isArray(payload?.current) ? payload.current.map(String) : [];
    await updateConnectionScopesFromProvider(connection.id, scopes);
    if (scopes.includes("read_products")) {
      await enqueueCatalogJob({
        connectionId:connection.id,kind:"shopify_reconcile",idempotencyKey:`shopify:webhook:${deliveryId}`,
        payload:{syncRunId:randomUUID(),cursor:null},
      });
    }
    return NextResponse.json({ accepted:true, status:scopes.includes("read_products") ? "syncing" : "permission_changed" });
  }
  if (topic === "products/delete" && sourceProductId) {
    await enqueueCatalogJob({
      connectionId: connection.id, kind: "shopify_product_remove",
      idempotencyKey: `shopify:webhook:${deliveryId}`,
      payload: { sourceProductId, sourceUpdatedAt: payload?.updated_at || null },
    });
  } else if (["products/create", "products/update", "inventory_levels/update"].includes(topic)) {
    await enqueueCatalogJob({
      connectionId: connection.id, kind: "shopify_reconcile",
      idempotencyKey: `shopify:webhook:${deliveryId}`,
      payload: { syncRunId: randomUUID(), cursor: null },
    });
  }
  return NextResponse.json({ accepted: true });
}
