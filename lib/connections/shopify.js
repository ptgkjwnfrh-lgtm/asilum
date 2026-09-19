// lib/connections/shopify.js — standalone Shopify public-app authorization.
// No merchant password or developer token ever crosses ASILUM's UI.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeShopifyDomain } from "../business.js";
import { readJsonResponse, readResponseSnippet, UPSTREAM_TIMEOUT_MS } from "../security/http.js";
import {
  claimConnectionRefresh, rotateConnectionTokens,
} from "../db/production.js";
import { decryptProviderToken, encryptProviderToken, tokenVaultConfigured } from "./tokenVault.js";

const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_SCOPES = ["read_products", "read_inventory"];

export function shopifyConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID || "";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || "";
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI || "";
  const apiVersion = process.env.SHOPIFY_API_VERSION || "";
  const scopes = [...new Set(String(process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES.join(","))
    .split(",").map((scope) => scope.trim()).filter(Boolean))];
  const safeScopes = scopes.filter((scope) => ["read_products", "read_inventory", "read_locations", "read_publications"].includes(scope));
  let redirect = null;
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) redirect = parsed.href;
  } catch {}
  return {
    clientId, clientSecret, redirectUri: redirect, apiVersion,
    scopes: safeScopes.length ? safeScopes : DEFAULT_SCOPES,
    configured: Boolean(clientId && clientSecret && redirect && /^20\d{2}-(?:01|04|07|10)$/.test(apiVersion) && tokenVaultConfigured()),
  };
}

export function normalizeShopDomain(value) {
  return normalizeShopifyDomain(value);
}

export function newOAuthState() {
  const state = randomBytes(32).toString("base64url");
  return { state, hash: hashOAuthState(state) };
}

export function hashOAuthState(state) {
  return createHash("sha256").update(String(state || "")).digest("hex");
}

export function shopifyAuthorizationUrl(shopDomain, state) {
  const shop = normalizeShopDomain(shopDomain);
  const config = shopifyConfig();
  if (!shop || !state || !config.configured) return null;
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.href;
}

const rfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export function canonicalShopifyQuery(searchParams) {
  const grouped = new Map();
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => `${rfc3986(key)}=${values.map(rfc3986).join(",")}`).join("&");
}

export function verifyShopifyQueryHmac(searchParams, secret = shopifyConfig().clientSecret) {
  const supplied = searchParams.get("hmac") || "";
  if (!secret || !/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(canonicalShopifyQuery(searchParams)).digest("hex");
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function verifyShopifyWebhookHmac(rawBody, supplied, secret = shopifyConfig().clientSecret) {
  if (!secret || typeof supplied !== "string") return false;
  let theirs;
  try { theirs = Buffer.from(supplied, "base64"); } catch { return false; }
  const ours = createHmac("sha256", secret).update(rawBody).digest();
  return theirs.length === ours.length && timingSafeEqual(theirs, ours);
}

async function tokenRequest(shopDomain, params, fetchImpl = fetch) {
  const shop = normalizeShopDomain(shopDomain);
  const config = shopifyConfig();
  if (!shop || !config.configured) throw new Error("Shopify authorization is not configured");
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  if (!response.ok) {
    const error = new Error(`Shopify token exchange ${response.status}: ${await readResponseSnippet(response)}`);
    error.status = response.status;
    error.retryAfter = response.headers?.get?.("retry-after") || null;
    throw error;
  }
  const data = await readJsonResponse(response, { maxBytes: MAX_RESPONSE_BYTES });
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(Number(data.expires_in))) {
    throw new Error("Shopify returned an invalid expiring-token response");
  }
  return data;
}

export function tokenTimes(data, now = Date.now()) {
  const expires = Number(data.expires_in);
  const refreshExpires = Number(data.refresh_token_expires_in);
  return {
    tokenExpiresAt: Number.isFinite(expires) ? new Date(now + expires * 1000).toISOString() : null,
    refreshTokenExpiresAt: Number.isFinite(refreshExpires) ? new Date(now + refreshExpires * 1000).toISOString() : null,
  };
}

export async function exchangeShopifyCode(shopDomain, code, fetchImpl = fetch) {
  const data = await tokenRequest(shopDomain, { code: String(code || ""), expiring: "1" }, fetchImpl);
  if (typeof data.refresh_token !== "string" || !data.refresh_token) {
    throw new Error("Shopify did not issue the required expiring offline refresh token");
  }
  return { ...data, ...tokenTimes(data) };
}

export async function shopifyGraphql({ shopDomain, accessToken, query, variables = {}, fetchImpl = fetch }) {
  const shop = normalizeShopDomain(shopDomain);
  const config = shopifyConfig();
  if (!shop || !config.apiVersion || !accessToken) throw new Error("Shopify GraphQL request is not configured");
  const response = await fetchImpl(`https://${shop}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const error = new Error(`Shopify GraphQL ${response.status}: ${await readResponseSnippet(response)}`);
    error.status = response.status;
    error.retryAfter = response.headers?.get?.("retry-after") || null;
    throw error;
  }
  const data = await readJsonResponse(response, { maxBytes: 8 * 1024 * 1024 });
  if (Array.isArray(data.errors) && data.errors.length) {
    const first = data.errors[0] || {};
    const error = new Error(`Shopify GraphQL: ${String(first.message || "provider error").slice(0, 300)}`);
    const code = first.extensions?.code;
    if (code === "THROTTLED") error.status = 429;
    if (code === "ACCESS_DENIED") error.status = 403;
    throw error;
  }
  return data.data;
}

export async function readShopifyIdentity(shopDomain, accessToken, fetchImpl = fetch) {
  const data = await shopifyGraphql({
    shopDomain, accessToken, fetchImpl,
    query: `query AsilumShopIdentity { shop { id myshopifyDomain currencyCode } }`,
  });
  const shop = data?.shop;
  const canonicalDomain = normalizeShopDomain(shop?.myshopifyDomain);
  if (!shop?.id || !canonicalDomain || canonicalDomain !== normalizeShopDomain(shopDomain)) {
    throw new Error("Shopify shop identity did not match the authorized domain");
  }
  return { providerAccountId: shop.id, canonicalDomain, currency: shop.currencyCode || null };
}

export function encryptedShopifyTokens(tokens, providerAccountId) {
  return {
    tokenCiphertext: encryptProviderToken(tokens.access_token, { connectionRef: providerAccountId, field: "access" }),
    refreshTokenCiphertext: encryptProviderToken(tokens.refresh_token, { connectionRef: providerAccountId, field: "refresh" }),
    tokenExpiresAt: tokens.tokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    tokenKeyVersion: process.env.CATALOG_TOKEN_KEY_VERSION,
  };
}

export async function accessTokenForConnection(connection, fetchImpl = fetch) {
  if (!connection?.tokenCiphertext) throw new Error("Shopify connection has no credential");
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() > Date.now() + 5 * 60_000) {
    return decryptProviderToken(connection.tokenCiphertext, { connectionRef: connection.providerAccountId, field: "access" });
  }
  if (!(await claimConnectionRefresh(connection.id))) {
    const error = new Error("Shopify credential refresh is already in progress");
    error.retryable = true;
    throw error;
  }
  const refresh = decryptProviderToken(connection.refreshTokenCiphertext, { connectionRef: connection.providerAccountId, field: "refresh" });
  try {
    const data = await tokenRequest(connection.canonicalDomain, { grant_type: "refresh_token", refresh_token: refresh }, fetchImpl);
    if (typeof data.refresh_token !== "string" || !data.refresh_token) throw new Error("Shopify refresh did not rotate the refresh token");
    const timed = { ...data, ...tokenTimes(data) };
    const encrypted = encryptedShopifyTokens(timed, connection.providerAccountId);
    await rotateConnectionTokens(connection.id, encrypted);
    return data.access_token;
  } catch (error) {
    // A short lease expires naturally if the provider never answered. A
    // successful retry uses the same refresh token per Shopify's contract.
    throw error;
  }
}
