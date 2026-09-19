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
import { readBytes, UPSTREAM_TIMEOUT_MS } from "../security/http.js";
import { validateListingContract } from "../catalog/contract.js";

const FETCH_CAP_BYTES = 4 * 1024 * 1024;
export const SHOPIFY_PAGE_LIMIT = 250;
const MAX_PAGES = 40;

/** The public products.json URL for a Shopify domain, or null if the domain is
 *  not one. Goes through safeExternalUrl, so a merchant-supplied domain cannot
 *  aim the importer at a private address. */
export function shopifyProductsUrl(domain, { sinceId = null } = {}) {
  const d = String(domain || "").trim().toLowerCase();
  if (!SHOPIFY_DOMAIN_RE.test(d)) return null;
  const url = new URL(`https://${d}/products.json`);
  url.searchParams.set("limit", String(SHOPIFY_PAGE_LIMIT));
  if (sinceId && /^\d+$/.test(String(sinceId))) url.searchParams.set("since_id", String(sinceId));
  return safeExternalUrl(url.href);
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
export function mapShopifyProducts(payload, domain, { currency = null } = {}) {
  const products = payload && Array.isArray(payload.products) ? payload.products : null;
  if (!products) return null;
  return products.map((p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const available = variants.filter((v) => v && v.available === true);
    const priced = (available.length ? available : variants)
      .map((v) => Number(v && v.price))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const tags = Array.isArray(p.tags)
      ? p.tags.map(String)
      : String(p.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    const resaleStatus = tags.some((tag) => tag.toLowerCase() === "asilum:resale") ? "resale" : "unknown";
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
      connection_id: `shopify-public:${domain}`,
      resale_status: resaleStatus,
      policy_id: "shopify-merchant-public-export",
      policy_version: 1,
      environment: "production",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
      variants: variants.map((variant) => ({
        source_variant_id: variant?.id ? String(variant.id) : null,
        title: variant?.title || null,
        options: [variant?.option1, variant?.option2, variant?.option3].filter(Boolean),
        price: variant?.price ?? null,
        currency,
        availability_status: variant?.available === true ? "available" : "sold",
      })).filter((variant) => variant.source_variant_id),
    };
  });
}

async function readLegacyJson(response) {
  // Real Response objects are streamed and capped. Tiny test doubles from the
  // unit suite do not carry a ReadableStream, so retain a bounded fallback.
  if (response?.body && response?.headers?.get) {
    const bytes = await readBytes(response, FETCH_CAP_BYTES);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > FETCH_CAP_BYTES) throw new RangeError("products.json larger than the import cap");
  return JSON.parse(text);
}

// Fetch + map + normalize + gate. Returns { imported, skipped } — the
// caller persists `imported`. Never throws on remote misbehaviour; a
// non-Shopify or refused response is an { error } result.
export async function importShopifyInventory({
  shopifyDomain, sourceName, currency = "USD", fetchImpl = fetch, maxPages = MAX_PAGES,
}) {
  if (!shopifyProductsUrl(shopifyDomain)) return { error: "shopify domain is not importable" };
  const imported = [];
  const skipped = [];
  let sinceId = null;
  let pages = 0;
  const pageBudget = Math.max(1, Math.min(Number(maxPages) || MAX_PAGES, MAX_PAGES));
  try {
    for (; pages < pageBudget; pages++) {
      const url = shopifyProductsUrl(shopifyDomain, { sinceId });
      const res = await fetchImpl(url, {
        redirect: "error",
        headers: { Accept: "application/json", "User-Agent": "asilum-import/2" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!res.ok) return { error: `store answered ${res.status} for products.json` };
      const payload = await readLegacyJson(res);
      const raws = mapShopifyProducts(payload, shopifyDomain, { currency });
      if (!raws) return { error: "response is not a Shopify products.json shape" };
      for (const raw of raws) {
        const item = normalizeSourceProduct(raw, sourceName);
        const contract = validateListingContract(item);
        if (!contract.ok) skipped.push({ handle: raw.source_product_id, title: raw.title, reason: contract.reasons.join("; ") });
        else imported.push(item);
      }
      if (raws.length < SHOPIFY_PAGE_LIMIT) break;
      const last = payload.products.at(-1)?.id;
      if (!last || String(last) === String(sinceId)) return { error: "products.json pagination did not advance" };
      sinceId = String(last);
    }
    if (pages >= pageBudget && imported.length && imported.length % SHOPIFY_PAGE_LIMIT === 0) {
      return { error: `products.json exceeded the ${pageBudget}-page safety budget` };
    }
  } catch (err) {
    return { error: `could not read products.json (${err && err.message ? err.message : "fetch failed"})` };
  }
  return { imported, skipped, pages: pages + 1 };
}
