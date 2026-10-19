// lib/business.js — the business-account law (owner order, Aug 13),
// client-safe: shared validation for the passport → business upgrade.
// A PASSPORT account becomes a BUSINESS account by verifying itself —
// brand name + Shopify storefront + personal website — through a
// human-reviewed verification case. Only business accounts get a
// chance at a hotlist booth.

export const BRAND_NAME_MIN = 2;
export const BRAND_NAME_MAX = 80;
export const STATEMENT_MAX = 500;

// The canonical shop identity is the myshopify domain; a custom
// storefront domain belongs in the website field.
export const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

// Accepts "shop.myshopify.com", "https://shop.myshopify.com/anything",
// with any case — returns the bare lowercase domain, or null.
export function normalizeShopifyDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return SHOPIFY_DOMAIN_RE.test(s) ? s : null;
}

/** A brand name within the allowed length, or null. Trims but does not
 *  otherwise rewrite — a house's name is its own, and silently "correcting" it
 *  is worse than refusing it. */
export function validBrandName(input) {
  const s = String(input || "").trim();
  return s.length >= BRAND_NAME_MIN && s.length <= BRAND_NAME_MAX ? s : null;
}
