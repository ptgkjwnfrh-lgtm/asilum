// lib/brands/shopify.js
// Consented Shopify import for a VERIFIED business (owner directive,
// 18 Aug): the designer gave us their myshopify domain in their own
// application, so reading its public /products.json is consent, not
// scraping. SERVER-ONLY.
//
// Full OAuth store control stays externally gated (partner app + review,
// RIGHTS-REGISTER — v18's note); this is the zero-friction path that works
// today. Every imported item still passes the checkout honesty gate; items
// that fail are SKIPPED AND REPORTED, never silently dropped — import is
// bulk + consented, so partial-with-loud-report is the honest contract
// (contrast: operator intake is atomic on purpose).
//
// products.json carries NO currency — the import takes it explicitly from
// the operator (documented in DESIGNER-INTAKE.md).

import { SHOPIFY_DOMAIN_RE } from "../business.js";
import { safeExternalUrl } from "../url.js";
import { normalizeSourceProduct } from "../ingest/adapters/normalize.js";
import { refusalReason } from "../orders.js";

const FETCH_CAP_BYTES = 4 * 1024 * 1024;
export const SHOPIFY_PAGE_LIMIT = 250;

/** The public products.json URL for a Shopify domain, or null if the domain is
 *  not one. Goes through safeExternalUrl, so a merchant-supplied domain cannot
 *  aim the importer at a private address. */
export function shopifyProductsUrl(domain) {
  const d = String(domain || "").trim().toLowerCase();
  if (!SHOPIFY_DOMAIN_RE.test(d)) return null;
  return safeExternalUrl(`https://${d}/products.json?limit=${SHOPIFY_PAGE_LIMIT}`);
}

/** Merchant description HTML reduced to plain text. NOT a sanitizer — the
 *  output is stored and read, never re-rendered as markup. Do not repurpose it
 *  for anything that will be injected into a page. */
export function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// products.json → raw items for THE normalizer. Availability is variant
// truth: any available variant → "available", none → "sold". Price is the
// cheapest available variant (else the cheapest overall, which the gate
// then refuses via availability anyway).
export function mapShopifyProducts(payload, domain, { currency = "USD" } = {}) {
  const products = payload && Array.isArray(payload.products) ? payload.products : null;
  if (!products) return null;
  return products.map((p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const available = variants.filter((v) => v && v.available === true);
    const priced = (available.length ? available : variants)
      .map((v) => Number(v && v.price))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    return {
      title: p.title,
      description: stripHtml(p.body_html),
      brand: p.vendor,
      source_product_id: String(p.handle || p.id || ""),
      source_product_url: `https://${domain}/products/${p.handle}`,
      price: priced[0] ?? null,
      currency,
      availability_status: available.length ? "available" : "sold",
      images: (Array.isArray(p.images) ? p.images : []).map((img) => img && img.src).filter(Boolean),
      category: p.product_type || null,
    };
  });
}

// Fetch + map + normalize + gate. Returns { imported, skipped } — the
// caller persists `imported`. Never throws on remote misbehaviour; a
// non-Shopify or refused response is an { error } result.
export async function importShopifyInventory({ shopifyDomain, sourceName, currency = "USD", fetchImpl = fetch }) {
  const url = shopifyProductsUrl(shopifyDomain);
  if (!url) return { error: "shopify domain is not importable" };
  let payload = null;
  try {
    const res = await fetchImpl(url, { redirect: "follow", headers: { "User-Agent": "asilum-import/1" } });
    if (!res.ok) return { error: `store answered ${res.status} for products.json` };
    const text = await res.text();
    if (text.length > FETCH_CAP_BYTES) return { error: "products.json larger than the import cap" };
    payload = JSON.parse(text);
  } catch (err) {
    return { error: `could not read products.json (${err && err.message ? err.message : "fetch failed"})` };
  }
  const raws = mapShopifyProducts(payload, shopifyDomain, { currency });
  if (!raws) return { error: "response is not a Shopify products.json shape" };

  const imported = [];
  const skipped = [];
  for (const raw of raws) {
    const item = normalizeSourceProduct(raw, sourceName);
    const refusal = refusalReason(item);
    if (refusal) skipped.push({ handle: raw.source_product_id, title: raw.title, reason: refusal });
    else imported.push(item);
  }
  return { imported, skipped };
}
