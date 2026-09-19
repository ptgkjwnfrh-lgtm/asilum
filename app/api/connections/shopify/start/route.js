import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../../lib/identity.js";
import { getBusinessAccount, createOAuthState } from "../../../../../lib/db/production.js";
import { newOAuthState, shopifyAuthorizationUrl, shopifyConfig, normalizeShopDomain } from "../../../../../lib/connections/shopify.js";
import { readJsonRequest } from "../../../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json({ error: "a signed-in ASILUM account is required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "shopify-oauth-start", subject: user, limit: 10, windowMs: 60 * 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  if (!shopifyConfig().configured) return NextResponse.json({ error: "Shopify connection is awaiting ASILUM app configuration" }, { status: 503 });
  const shopDomain = normalizeShopDomain(body.shop);
  if (!shopDomain) return NextResponse.json({ error: "enter a store like your-shop.myshopify.com" }, { status: 400 });
  const business = await getBusinessAccount(accountId).catch(() => null);
  if (!business || business.status !== "business") {
    return NextResponse.json({ error: "the store connection opens after business verification" }, { status: 403 });
  }
  if (normalizeShopDomain(business.shopifyDomain) !== shopDomain) {
    return NextResponse.json({ error: "this store does not match the verified business application" }, { status: 403 });
  }
  const { state, hash } = newOAuthState();
  const returnPath = "/board?tab=studio";
  await createOAuthState({ stateHash:hash,accountId,shopDomain,returnPath,expiresAt:new Date(Date.now()+10*60_000).toISOString() });
  return NextResponse.json({ authorizationUrl: shopifyAuthorizationUrl(shopDomain, state), status: "awaiting_authorization" });
}
