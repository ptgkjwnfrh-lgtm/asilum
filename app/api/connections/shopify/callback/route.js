import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { SITE_ORIGIN } from "../../../../../lib/site.js";
import {
  consumeOAuthState, enqueueCatalogJob, upsertMerchantConnection,
} from "../../../../../lib/db/production.js";
import {
  exchangeShopifyCode, hashOAuthState, normalizeShopDomain, readShopifyIdentity,
  verifyShopifyQueryHmac, encryptedShopifyTokens,
} from "../../../../../lib/connections/shopify.js";

export const dynamic = "force-dynamic";

function destination(path, state) {
  const url = new URL(path || "/board?tab=studio", SITE_ORIGIN);
  url.searchParams.set("shopify", state);
  return url;
}

export async function GET(req) {
  const url = new URL(req.url);
  const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!shopDomain || !state || !code || !verifyShopifyQueryHmac(url.searchParams)) {
    return NextResponse.redirect(destination("/board?tab=studio", "authorization_failed"), 303);
  }
  const binding = await consumeOAuthState({ stateHash:hashOAuthState(state),shopDomain });
  if (!binding) return NextResponse.redirect(destination("/board?tab=studio", "state_expired"), 303);
  try {
    const tokens = await exchangeShopifyCode(shopDomain, code);
    const identity = await readShopifyIdentity(shopDomain, tokens.access_token);
    const scopes = String(tokens.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean);
    if (!scopes.includes("read_products")) throw new Error("Shopify did not grant read_products");
    const encrypted = encryptedShopifyTokens(tokens, identity.providerAccountId);
    const connection = await upsertMerchantConnection({
      accountId:binding.accountId,provider:"shopify",providerAccountId:identity.providerAccountId,
      canonicalDomain:identity.canonicalDomain,grantedScopes:scopes,
      publicationSelection:{ resaleTag:"asilum:resale",currency:identity.currency },
      policyId:"shopify-merchant",policyVersion:1,status:"syncing",...encrypted,
    });
    await enqueueCatalogJob({
      connectionId:connection.id,kind:"shopify_initial_sync",
      idempotencyKey:`shopify:initial:${connection.id}:${Date.now()}`,
      payload:{ syncRunId:randomUUID(),cursor:null },
    });
    return NextResponse.redirect(destination(binding.returnPath, "syncing"), 303);
  } catch {
    return NextResponse.redirect(destination(binding.returnPath, "connection_failed"), 303);
  }
}
