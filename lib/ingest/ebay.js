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

let _token = null, _exp = 0;

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
export async function getAppToken() {
  if (_token && Date.now() < _exp - 60_000) return _token;
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const id = process.env.EBAY_CLIENT_ID, secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
  const res = await fetch(HOSTS[env].auth, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}: ${await readResponseSnippet(res)}`);
  const data = await readJsonResponse(res, { maxBytes: 256 * 1024 });
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(Number(data.expires_in))) {
    throw new Error("eBay OAuth returned an invalid token response");
  }
  _token = data.access_token;
  _exp = Date.now() + Number(data.expires_in) * 1000;
  return _token;
}

// Category guess from listing title → catalog canonical categories.
export function guessCategory(title = "") {
  const t = title.toLowerCase();
  if (/\b(jackets?|coats?|parkas?|shells?|bombers?|puffers?|anoraks?|vests?)\b/.test(t)) return "outerwear";
  if (/\b(blazers?|suits?)\b/.test(t)) return "tailoring";
  // sneaker collabs and silhouettes read as footwear before anything else
  // catches them ("Jordan 11 … Comme des Garcons", "Ramones High-Top")
  if (/\b(jordan|foamposite|dunks?|air max|air force|converse|vans|ramones|geobaskets?|tabi boots?)\b/.test(t)) return "footwear";
  // "shorts" only — "short sleeve" is not a pair of shorts
  if (/\b(jeans?|pants?|trousers?|cargos?|shorts|skirts?|denim)\b/.test(t)) return "bottoms";
  if (/\b(dress(es)?|gowns?)\b/.test(t)) return "dresses";
  if (/\b(sweaters?|knits?|cardigans?|hoodies?|fleeces?)\b/.test(t)) return "knitwear";
  if (/\b(boots?|sneakers?|shoes?|loafers?|derby|derbies|runners?|trainers?|mules?)\b/.test(t)) return "footwear";
  if (/\b(bags?|belts?|hats?|caps?|beanies?|scar(f|ves)|wallets?|rings?|necklaces?|sunglass(es)?)\b/.test(t)) return "accessories";
  return "tops";
}

// Era guess: explicit year in title, else assume contemporary decade.
export function guessEra(title = "") {
  const m = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
  if (m) { const y = +m[0]; return { year: y, decade: `${Math.floor(y / 10) * 10}s`, raw: m[0] }; }
  // season codes, the archive's own notation (first light, 10 Sep 2026):
  // FW1998, AW05, SS02, 03AW, 20SS, F/W21, A/W 96 — a two-digit year reads
  // 60–99 as the 1900s and 00–29 as the 2000s
  const s = title.match(/\b(?:[FSAP]\/?[WS]\s?'?(\d{4}|\d{2})|(\d{2})\s?(?:[FSAP][WS]))\b/i);
  if (s) {
    const raw = s[0];
    const digits = s[1] || s[2];
    let y = Number(digits);
    if (digits.length === 2) y = y >= 60 ? 1900 + y : 2000 + y;
    if (y >= 1960 && y <= 2029) return { year: y, decade: `${Math.floor(y / 10) * 10}s`, raw };
  }
  // "90s" / "80's" / "2000s" decades
  const d = title.match(/\b(?:(19)?([6-9])0'?s|(20[0-2])0'?s)\b/i);
  if (d) { const decade = d[3] ? `${d[3]}0s` : `19${d[2]}0s`; return { decade, raw: d[0] }; }
  return { decade: "2020s", raw: null };
}

// Size guess from title/aspects ("sz M", "IT 48", "W32", "US 10")…
export function guessSizeLabel(item) {
  const aspects = item.localizedAspects || [];
  // "Size" exactly, then a regional size — never "Size Type" (Regular/Petite)
  // which first light read as the size itself (10 Sep 2026)
  const sizeAspect = aspects.find((a) => /^(size|taglia|größe|taille)$/i.test(a.name || ""))
    || aspects.find((a) => /^(us|uk|eu|it|jp|fr) size$/i.test(a.name || ""))
    || aspects.find((a) => /^us shoe size$/i.test(a.name || ""));
  if (sizeAspect && sizeAspect.value) return String(sizeAspect.value).slice(0, 40);
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

function plainDescription(raw) {
  const html = [raw.shortDescription, raw.description].filter(Boolean).join(" ");
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 2000) || null;
}

// The brand, with WHERE IT CAME FROM: the seller's Brand aspect first (the
// item detail carries it; a search summary does not), then the detail's own
// brand field, then — last, and marked — the first two words of the title,
// which is what "Vintage Helmut" and "Size 14" were on first light.
function brandOf(raw, title) {
  const aspect = (raw.localizedAspects || []).find((a) => /^(brand|marca|marke|marque)$/i.test(a.name || ""))?.value;
  if (aspect) return { brand: String(aspect).slice(0, 160), brandSource: "aspect" };
  if (raw.brand) return { brand: String(raw.brand).slice(0, 160), brandSource: "field" };
  return { brand: title.split(/\s+/).slice(0, 2).join(" "), brandSource: "title" };
}

// Map one Browse API item (a search summary, or the item detail) → catalog item shape.
export function normalizeEbayItem(raw = {}) {
  const title = raw.title || "Untitled listing";
  const sourceProductId = String(raw.itemId || "").slice(0, 160);
  const { brand, brandSource } = brandOf(raw, title);
  const category = guessCategory(title);
  const label = guessSizeLabel(raw) || (raw.size ? String(raw.size).slice(0, 40) : null);
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
    brandSource,
    description: plainDescription(raw),
    categoryPath: raw.categoryPath || null,
    material: aspect(/^(?:material|outer shell material|fabric type)$/i),
    merchantColor: aspect(/^(?:color|colour)$/i) || raw.color || null,
    img: images[0] || null,      // eBay Browse image URLs are display-licensed for API consumers
    images,
    alt: title,
    url: raw.itemWebUrl || null,
    condition: raw.condition || null,
    source: "eBay Browse API",
    source_product_id: sourceProductId || null,
  };
}

// STEP ONE, first half: the search summaries as eBay returns them.
export async function searchEbayRaw(q, { limit = 24 } = {}) {
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const token = await getAppToken();
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 24, 50));
  const url = `${HOSTS[env].api}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${safeLimit}&category_ids=11450`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`eBay search ${res.status}: ${await readResponseSnippet(res)}`);
  const data = await readJsonResponse(res, { maxBytes: MAX_RESPONSE_BYTES });
  return Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
}

// STEP ONE, second half: the item detail — the seller's item specifics
// (localizedAspects), the description, every photograph. getItem runs on the
// basic application scope; the bulk getItems endpoint does not (403 on this
// keyset, 10 Sep 2026), so details are fetched one at a time.
export async function fetchItemDetail(itemId) {
  if (!itemId) return null;
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const token = await getAppToken();
  const res = await fetch(`${HOSTS[env].api}/buy/browse/v1/item/${encodeURIComponent(itemId)}?fieldgroups=PRODUCT`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`eBay item ${res.status}: ${await readResponseSnippet(res)}`);
  return readJsonResponse(res, { maxBytes: MAX_RESPONSE_BYTES });
}

// Search + normalize + dedupe against known ids.
export async function searchEbay(q, { limit = 24, knownIds = new Set(), verifyColors = true } = {}) {
  const normalized = (await searchEbayRaw(q, { limit }))
    .map(normalizeEbayItem)
    .filter((it) => !knownIds.has(it.id));
  return verifyColors ? verifyProductColors(normalized) : normalized;
}
