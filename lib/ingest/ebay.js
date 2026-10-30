// lib/ingest/ebay.js
// eBay source adapter — the OFFICIAL Browse API path (never scraping).
// Server-side only: reads EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_ENV from
// env (Vercel project settings or .env.local). Client-credentials OAuth for
// public search; token cached until near-expiry.
//
// Every eBay item is normalized to the catalog schema and run through the
// SAME pipeline as seed items: inferTags() for the brain vector, sizeRecord()
// for the size brain, era derived from the title where possible.

import { inferTags } from "./sources.js";
import { sizeRecord } from "../brain/sizing.js";
import { readJsonResponse, readResponseSnippet } from "../security/http.js";
import { createHash } from "node:crypto";
import { verifyProductColors } from "./colorEvidence.js";

const HOSTS = {
  SANDBOX: { auth: "https://api.sandbox.ebay.com/identity/v1/oauth2/token", api: "https://api.sandbox.ebay.com" },
  PRODUCTION: { auth: "https://api.ebay.com/identity/v1/oauth2/token", api: "https://api.ebay.com" },
};
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// Scope and environment are part of the cache key: Browse tokens do not
// authorize the bulk Feed API. Never reuse tokens after credential rotation.
const tokenCache = new Map();

/**
 * The eBay application token, cached until a minute before it expires.
 *
 * THROWS when the credentials are unset, rather than returning null — every
 * caller here is already inside an adapter that reports its own disabled
 * state, so reaching this without keys is a misconfiguration worth surfacing.
 *
 * Defaults to SANDBOX: only an explicit EBAY_ENV=PRODUCTION talks to the real
 * marketplace.
 */
export async function getAppToken({ scope = "https://api.ebay.com/oauth/api_scope" } = {}) {
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const id = process.env.EBAY_CLIENT_ID, secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
  const key = createHash("sha256").update(JSON.stringify([env, id, secret, scope])).digest("hex");
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expires - 60_000) return cached.token;
  const res = await fetch(HOSTS[env].auth, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent(scope),
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}: ${await readResponseSnippet(res)}`);
  const data = await readJsonResponse(res, { maxBytes: 256 * 1024 });
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(Number(data.expires_in))) {
    throw new Error("eBay OAuth returned an invalid token response");
  }
  if (tokenCache.size >= 8) tokenCache.clear();
  tokenCache.set(key, { token: data.access_token, expires: Date.now() + Number(data.expires_in) * 1000 });
  return data.access_token;
}

// THE eBay CATEGORY LANES (owner, 30 Oct 2026: "asilum does more than just
// clothes — furniture, jewelry, rugs, shoes, watches, figurines, table
// ornaments"). eBay's top-level Browse category ids, by the name a route or a
// sync names them. The old single lane (11450, Clothing, Shoes & Accessories)
// stays the default so nothing that searched before searches differently.
export const EBAY_CATEGORIES = Object.freeze({
  fashion: "11450",        // Clothing, Shoes & Accessories
  jewelry: "281",          // Jewelry & Watches
  home: "11700",           // Home & Garden (furniture, rugs, lighting, decor)
  collectibles: "1",       // Collectibles (figurines, ornaments)
  antiques: "20081",       // Antiques (furniture, rugs, decorative arts)
  art: "550",              // Art (sculpture, prints)
});

/** A lane name or a raw numeric id → the category_ids value, "" for "all". */
export function ebayCategoryIds(category) {
  if (category == null || category === "" || category === "all") return category === "all" ? "" : EBAY_CATEGORIES.fashion;
  const s = String(category).trim().toLowerCase();
  if (EBAY_CATEGORIES[s]) return EBAY_CATEGORIES[s];
  if (/^\d{1,8}$/.test(s)) return s;
  return null;
}

// The sweep a demo catalog is built from: one query per lane, each in the
// category that actually holds it. `category` is the lane's catalog category
// hint for listings whose titles name no garment word.
export const EBAY_DEMO_LANES = Object.freeze([
  { query: "designer archive fashion", category: "fashion" },
  { query: "vintage leather jacket", category: "fashion" },
  { query: "designer sneakers", category: "fashion", hint: "footwear" },
  { query: "leather boots", category: "fashion", hint: "footwear" },
  { query: "vintage watch automatic", category: "jewelry", hint: "watches" },
  { query: "silver ring chain necklace", category: "jewelry", hint: "jewelry" },
  { query: "mid century chair", category: "home", hint: "furniture" },
  { query: "vintage lamp", category: "home", hint: "furniture" },
  { query: "persian rug", category: "home", hint: "rugs" },
  { query: "moroccan rug", category: "home", hint: "rugs" },
  { query: "porcelain figurine", category: "collectibles", hint: "objects" },
  { query: "vase table ornament", category: "home", hint: "objects" },
  { query: "art deco sculpture", category: "antiques", hint: "objects" },
]);

// The catalog's canonical categories: the eight garment lanes the catalog has
// always had, and the five the demo sweep adds. A normalizer that receives one
// of these as a source's own category keeps it (normalize.js).
export const CATALOG_CATEGORIES = Object.freeze([
  "tops", "bottoms", "outerwear", "tailoring", "dresses", "knitwear", "footwear", "accessories",
  "furniture", "rugs", "watches", "jewelry", "objects",
]);

// Category guess from listing title → catalog canonical categories. `hint` is
// the lane's category for a title that names no garment or object word; with
// no hint a bare title is still "tops", as it always was.
export function guessCategory(title = "", hint = null) {
  const t = title.toLowerCase();
  // the non-garment lanes first: a "chair" is never a top, a "watch" never an accessory
  if (/\b(chairs?|sofas?|couch(es)?|tables?|desks?|stools?|benches|bench|dressers?|cabinets?|shel(f|ves)|shelving|lamps?|lighting|sconces?|chandeliers?|bookcases?|sideboards?|armchairs?|loungers?|ottomans?|furniture)\b/.test(t)) return "furniture";
  if (/\b(rugs?|carpets?|kilims?|tapestr(y|ies)|runner rug)\b/.test(t)) return "rugs";
  if (/\b(watch(es)?|chronograph|wristwatch|timepiece|rolex|seiko|omega)\b/.test(t)) return "watches";
  if (/\b(figurines?|statuettes?|sculptures?|ornaments?|vases?|bowls?|candlesticks?|decanters?|ceramics?|porcelain|objets?|objects?|bookends?|busts?)\b/.test(t)) return "objects";
  if (/\b(jewel(le)?ry|rings?|necklaces?|bracelets?|earrings?|pendants?|brooch(es)?|chains?|cufflinks?)\b/.test(t)) return "jewelry";
  if (/\b(jackets?|coats?|parkas?|shells?|bombers?|puffers?|anoraks?|vests?)\b/.test(t)) return "outerwear";
  if (/\b(blazers?|suits?)\b/.test(t)) return "tailoring";
  if (/\b(jeans?|pants?|trousers?|cargos?|shorts?|skirts?|denim)\b/.test(t)) return "bottoms";
  if (/\b(dress(es)?|gowns?)\b/.test(t)) return "dresses";
  if (/\b(sweaters?|knits?|cardigans?|hoodies?|fleeces?)\b/.test(t)) return "knitwear";
  if (/\b(boots?|sneakers?|shoes?|loafers?|derby|derbies|runners?|trainers?|mules?)\b/.test(t)) return "footwear";
  if (/\b(bags?|belts?|hats?|caps?|beanies?|scar(f|ves)|wallets?|sunglass(es)?)\b/.test(t)) return "accessories";
  return hint || "tops";
}

// Era guess: explicit year in title, else assume contemporary decade.
export function guessEra(title = "") {
  const m = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
  if (m) { const y = +m[0]; return { year: y, decade: `${Math.floor(y / 10) * 10}s`, raw: m[0] }; }
  return { decade: "2020s", raw: null };
}

// Size guess from title/aspects ("sz M", "IT 48", "W32", "US 10")…
export function guessSizeLabel(item) {
  const aspects = item.localizedAspects || [];
  const sizeAspect = aspects.find((a) => /size/i.test(a.name || ""));
  if (sizeAspect && sizeAspect.value) return String(sizeAspect.value);
  const t = item.title || "";
  const m = t.match(/\b(?:sz|size)\.?\s*([A-Z0-9]{1,4})\b/i) || t.match(/\b(IT|FR|EU|UK|US|JP)\s?(\d{1,2})\b/i) || t.match(/\bW(\d{2})\b/i);
  if (m) return m[0].replace(/^(?:sz|size)\.?\s*/i, "");
  return null;
}

function listingMeasurements(item) {
  const out = {};
  for (const aspect of item.localizedAspects || []) {
    const key = /^(?:chest|chest size)$/i.test(aspect.name || "") ? "chest"
      : /^(?:waist|waist size)$/i.test(aspect.name || "") ? "waist"
      : /^(?:hips?|hip size)$/i.test(aspect.name || "") ? "hips"
      : /^inseam$/i.test(aspect.name || "") ? "inseam" : null;
    if (!key) continue;
    const match = String(aspect.value || "").match(/(\d+(?:\.\d+)?)\s*(cm|in|inch|inches|\")?/i);
    if (!match) continue;
    const value = Number(match[1]);
    const inches = String(match[2] || "in").toLowerCase() === "cm" ? value / 2.54 : value;
    if (inches > 0 && inches <= 100) out[key] = +inches.toFixed(2);
  }
  return out;
}

// Map one Browse API itemSummary → catalog item shape. `hint` is the lane's
// catalog category for a title that names nothing (EBAY_DEMO_LANES).
export function normalizeEbayItem(raw = {}, { hint = null } = {}) {
  const title = raw.title || "Untitled listing";
  const sourceProductId = String(raw.itemId || "").slice(0, 160);
  const brand = (raw.localizedAspects || []).find((a) => /brand/i.test(a.name || ""))?.value
    || title.split(/\s+/).slice(0, 2).join(" ");
  const category = guessCategory(title, hint);
  const label = guessSizeLabel(raw);
  const aspect = (pattern) => (raw.localizedAspects || []).find((entry) => pattern.test(entry.name || ""))?.value || null;
  const images = [raw.image?.imageUrl, ...(raw.additionalImages || []).map((image) => image?.imageUrl)].filter(Boolean);
  const measurements = listingMeasurements(raw);
  // Missing listing size is unknown—not a synthetic medium.
  const size = label ? sizeRecord(label, { gender: "unisex", category })
    : Object.keys(measurements).length ? {
        label: null, fitsLikeUS: null, runsBias: 0, category,
        measurements: {}, measurementSource: "listing",
      } : null;
  if (size && Object.keys(measurements).length) {
    size.measurements = measurements;
    size.measurementSource = "listing";
  }
  return {
    id: "ebay-" + createHash("sha256").update(sourceProductId || title).digest("hex").slice(0, 32),
    title,
    brand,
    price: raw.price ? Number(raw.price.value) : null,
    currency: raw.price?.currency || "USD",
    tags: inferTags(`${title} ${brand}`),
    designers: [],
    category,
    era: guessEra(title),
    size,
    merchantColor: aspect(/^(?:color|colour)$/i),
    img: images[0] || null,      // eBay Browse image URLs are display-licensed for API consumers
    images,
    alt: title,
    url: raw.itemWebUrl || null,
    condition: raw.condition || null,
    source: "eBay Browse API",
    source_product_id: sourceProductId || null,
  };
}

/** The Browse search URL for a query in a lane (exported so a test can see
 *  the category it asks for without a network). `category` is a lane name
 *  from EBAY_CATEGORIES, a raw id, or "all" for no category filter. An
 *  unknown lane THROWS rather than silently searching fashion. */
export function browseSearchUrl(q, { limit = 24, category = "fashion" } = {}) {
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 24, 50));
  const ids = ebayCategoryIds(category);
  if (ids === null) throw new Error(`unknown eBay category lane: ${category}`);
  return `${HOSTS[env].api}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${safeLimit}${ids ? `&category_ids=${ids}` : ""}`;
}

// Search + normalize + dedupe against known ids.
export async function searchEbay(q, { limit = 24, knownIds = new Set(), verifyColors = true, category = "fashion", hint = null } = {}) {
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const token = await getAppToken();
  const url = browseSearchUrl(q, { limit, category });
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`eBay search ${res.status}: ${await readResponseSnippet(res)}`);
  const data = await readJsonResponse(res, { maxBytes: MAX_RESPONSE_BYTES });
  const normalized = (Array.isArray(data.itemSummaries) ? data.itemSummaries : [])
    .map((raw) => normalizeEbayItem(raw, { hint }))
    .filter((it) => !knownIds.has(it.id));
  return verifyColors ? verifyProductColors(normalized) : normalized;
}
