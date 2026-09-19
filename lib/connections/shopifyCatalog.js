// Shopify Admin catalog reader. Only merchant-installed stores reach this
// module, and only products explicitly tagged `asilum:resale` are publishable.

import { createHash, randomUUID } from "node:crypto";
import { normalizeSourceProduct } from "../ingest/adapters/normalize.js";
import { amountToMinor } from "../catalog/contract.js";
import { persistListings } from "../ingest/persistence.js";
import {
  claimCatalogJobs, enqueueCatalogJob, finishCatalogJob, getMerchantConnection,
  markConnectionListingRemoved, reconcileCatalogSnapshot, setConnectionStatus,
  withActiveMerchantConnection, purgeExpiredCatalogOperationalData,
} from "../db/production.js";
import { accessTokenForConnection, shopifyGraphql } from "./shopify.js";

const PAGE_SIZE = 20;
const RESALE_TAG = "asilum:resale";

const PRODUCTS_QUERY = `query AsilumCatalog($first: Int!, $after: String) {
  products(first: $first, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title description vendor productType tags status onlineStoreUrl updatedAt
      media(first: 12) { nodes { preview { image { url altText } } } }
      variants(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes { id title price availableForSale inventoryPolicy updatedAt selectedOptions { name value } }
      }
    }
  }
}`;

const VARIANTS_QUERY = `query AsilumVariants($id: ID!, $after: String) {
  product(id: $id) {
    variants(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id title price availableForSale inventoryPolicy updatedAt selectedOptions { name value } }
    }
  }
}`;

function variantId(connectionId, sourceVariantId) {
  return `shopify-v-${createHash("sha256").update(`${connectionId}:${sourceVariantId}`).digest("hex").slice(0, 48)}`;
}

async function allVariants(product, request) {
  const variants = [...(product.variants?.nodes || [])];
  let page = product.variants?.pageInfo;
  while (page?.hasNextPage) {
    const data = await request(VARIANTS_QUERY, { id: product.id, after: page.endCursor });
    const next = data?.product?.variants;
    if (!next) throw new Error("Shopify omitted a variant page");
    variants.push(...(next.nodes || []));
    page = next.pageInfo;
  }
  return variants;
}

export async function mapShopifyProduct(product, connection, request) {
  const tags = Array.isArray(product?.tags) ? product.tags.map((tag) => String(tag).toLowerCase()) : [];
  if (product?.status !== "ACTIVE" || !product.onlineStoreUrl || !tags.includes(RESALE_TAG)) {
    return { item: null, reason: !tags.includes(RESALE_TAG) ? "not_explicitly_resale" : "not_published" };
  }
  const currency = connection.publicationSelection?.currency || null;
  const variants = await allVariants(product, request);
  const available = variants.filter((variant) => variant?.availableForSale === true);
  const priced = (available.length ? available : variants)
    .map((variant) => String(variant?.price ?? ""))
    .filter((price) => amountToMinor(price, currency) !== null)
    .sort((a, b) => BigInt(amountToMinor(a, currency)) < BigInt(amountToMinor(b, currency)) ? -1 : 1);
  const sourceProductId = String(product.id);
  const checkedAt = new Date().toISOString();
  const item = normalizeSourceProduct({
    title: product.title,
    description: product.description || null,
    brand: product.vendor || null,
    category: product.productType || null,
    source_product_id: sourceProductId,
    source_product_url: product.onlineStoreUrl,
    clickout_url: product.onlineStoreUrl,
    price: priced[0] ?? null,
    currency,
    images: (product.media?.nodes || []).map((node) => node?.preview?.image?.url).filter(Boolean),
    connection_id: connection.id,
    availability_status: available.length ? "available" : "sold",
    is_available: available.length > 0,
    resale_status: "resale",
    policy_id: connection.policyId,
    policy_version: connection.policyVersion,
    environment: "production",
    source_updated_at: product.updatedAt || null,
    availability_checked_at: checkedAt,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
    allow_inferred_tags: false,
  }, "shopify");
  item.variants = variants.map((variant) => ({
    id: variantId(connection.id, variant.id),
    source_variant_id: String(variant.id),
    title: variant.title || null,
    options: (variant.selectedOptions || []).map(({ name, value }) => ({ name, value })),
    amount_minor: amountToMinor(String(variant.price ?? ""), currency),
    currency,
    availability: variant.availableForSale === true ? "available" : "sold",
    inventory_policy: variant.inventoryPolicy || null,
    source_updated_at: variant.updatedAt || product.updatedAt || null,
    availability_checked_at: checkedAt,
  }));
  return { item, reason: null };
}

export async function fetchShopifyCatalogPage(connection, cursor = null, fetchImpl = fetch) {
  const accessToken = await accessTokenForConnection(connection, fetchImpl);
  const request = (query, variables) => shopifyGraphql({
    shopDomain: connection.canonicalDomain, accessToken, query, variables, fetchImpl,
  });
  const data = await request(PRODUCTS_QUERY, { first: PAGE_SIZE, after: cursor });
  const products = data?.products;
  if (!products) throw new Error("Shopify omitted the products page");
  const items = [], skipped = [];
  for (const product of products.nodes || []) {
    const mapped = await mapShopifyProduct(product, connection, request);
    if (mapped.item) items.push(mapped.item);
    else skipped.push({ sourceProductId: product?.id || null, reason: mapped.reason });
  }
  return {
    items, skipped,
    nextCursor: products.pageInfo?.hasNextPage ? products.pageInfo.endCursor : null,
  };
}

function field(row, snake, camel) { return row?.[camel] ?? row?.[snake]; }

async function processCatalogJob(job, workerId, fetchImpl) {
  const connectionId = field(job, "connection_id", "connectionId");
  const payload = field(job, "payload", "payload") || {};
  const connection = await getMerchantConnection(connectionId, { secrets: true });
  if (!connection || !["syncing","connected","partially_synced","rate_limited"].includes(connection.status)) {
    await finishCatalogJob(job.id, workerId, { status: "canceled", error: "connection is not active" });
    return { id: job.id, status: "canceled" };
  }
  if (job.kind === "shopify_product_remove") {
    await markConnectionListingRemoved(connection.id, String(payload.sourceProductId || ""), payload.sourceUpdatedAt || null);
    await finishCatalogJob(job.id, workerId, { status: "completed" });
    return { id: job.id, status: "completed" };
  }
  const syncRunId = payload.syncRunId || randomUUID();
  const page = await fetchShopifyCatalogPage(connection, payload.cursor || null, fetchImpl);
  const { persisted, imported, skipped } = await withActiveMerchantConnection(connection.id, async () => {
    const persisted = await persistListings({
      connectionId: connection.id, policyId: connection.policyId, syncRunId, products: page.items,
    });
    const imported = Number(payload.imported || 0) + persisted.upserted;
    const skipped = Number(payload.skipped || 0) + page.skipped.length + persisted.rejected.length;
    if (page.nextCursor) {
      await enqueueCatalogJob({
        connectionId: connection.id,
        kind: job.kind,
        idempotencyKey: `shopify:page:${connection.id}:${syncRunId}:${page.nextCursor}`,
        payload: { syncRunId, cursor: page.nextCursor, imported, skipped },
      });
      await setConnectionStatus(connection.id, { status: "syncing", syncCursor: { syncRunId, cursor: page.nextCursor }, importedCount: imported, skippedCount: skipped });
    } else {
      await reconcileCatalogSnapshot(connection.id, syncRunId);
      await setConnectionStatus(connection.id, { status: "connected", syncCursor: {}, importedCount: imported, skippedCount: skipped, lastSyncedAt: new Date().toISOString() });
    }
    return { persisted, imported, skipped };
  });
  await finishCatalogJob(job.id, workerId, { status: "completed", checkpoint: { syncRunId, imported, skipped, nextCursor: page.nextCursor } });
  return { id: job.id, status: "completed", imported, skipped, nextCursor: page.nextCursor };
}

export async function runCatalogWorker({ workerId = `catalog-${randomUUID()}`, limit = 5, fetchImpl = fetch } = {}) {
  if (process.env.SHOPIFY_CATALOG_SYNC_ENABLED === "0") return { claimed: 0, results: [], disabled: true };
  await purgeExpiredCatalogOperationalData();
  const jobs = await claimCatalogJobs(workerId, { limit, leaseMs: 55_000 });
  const results = [];
  for (const job of jobs) {
    try {
      results.push(await processCatalogJob(job, workerId, fetchImpl));
    } catch (error) {
      const connectionId = field(job, "connection_id", "connectionId");
      const latest = connectionId ? await getMerchantConnection(connectionId) : null;
      if (!latest || !["syncing","connected","partially_synced","rate_limited"].includes(latest.status)) {
        await finishCatalogJob(job.id, workerId, { status:"canceled",error:"connection became inactive" }).catch(() => {});
        results.push({ id:job.id,status:"canceled" });
        continue;
      }
      const statusCode = Number(error?.status);
      const attempts = Number(field(job, "attempts", "attempts") || 1);
      const maxAttempts = Number(field(job, "max_attempts", "maxAttempts") || 8);
      const terminal = attempts >= maxAttempts || statusCode === 401 || statusCode === 403;
      const state = statusCode === 401 || statusCode === 403 ? "permission_changed" : statusCode === 429 ? "rate_limited" : "partially_synced";
      await setConnectionStatus(connectionId, { status: state, lastError: String(error?.message || error).slice(0, 400) }).catch(() => {});
      const retryAfterSeconds = Number(error?.retryAfter);
      const baseDelay = statusCode === 429 && Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000 : Math.min(60 * 60_000, 2 ** attempts * 15_000);
      const retryAt = terminal ? null : new Date(Date.now() + Math.max(1_000, baseDelay * (0.75 + Math.random() * 0.5))).toISOString();
      await finishCatalogJob(job.id, workerId, { status: terminal ? "failed" : "retry", error: String(error?.message || error).slice(0, 400), retryAt });
      results.push({ id: job.id, status: terminal ? "failed" : "retry", error: String(error?.message || error).slice(0, 200) });
    }
  }
  return { claimed: jobs.length, results };
}
