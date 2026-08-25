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
  if (/\b(jeans?|pants?|trousers?|cargos?|shorts?|skirts?|denim)\b/.test(t)) return "bottoms";
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

// Map one Browse API itemSummary → catalog item shape.
export function normalizeEbayItem(raw = {}) {
  const title = raw.title || "Untitled listing";
  const sourceProductId = String(raw.itemId || "").slice(0, 160);
  const brand = (raw.localizedAspects || []).find((a) => /brand/i.test(a.name || ""))?.value
    || title.split(/\s+/).slice(0, 2).join(" ");
  const category = guessCategory(title);
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

// Search + normalize + dedupe against known ids.
export async function searchEbay(q, { limit = 24, knownIds = new Set(), verifyColors = true } = {}) {
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
  const normalized = (Array.isArray(data.itemSummaries) ? data.itemSummaries : [])
    .map(normalizeEbayItem)
    .filter((it) => !knownIds.has(it.id));
  return verifyColors ? verifyProductColors(normalized) : normalized;
}
