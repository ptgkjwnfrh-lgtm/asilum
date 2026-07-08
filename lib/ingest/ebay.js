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

const HOSTS = {
  SANDBOX: { auth: "https://api.sandbox.ebay.com/identity/v1/oauth2/token", api: "https://api.sandbox.ebay.com" },
  PRODUCTION: { auth: "https://api.ebay.com/identity/v1/oauth2/token", api: "https://api.ebay.com" },
};

let _token = null, _exp = 0;

export async function getAppToken() {
  if (_token && Date.now() < _exp - 60_000) return _token;
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const id = process.env.EBAY_CLIENT_ID, secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
  const res = await fetch(HOSTS[env].auth, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  _token = data.access_token;
  _exp = Date.now() + data.expires_in * 1000;
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

// Map one Browse API itemSummary → catalog item shape.
export function normalizeEbayItem(raw) {
  const title = raw.title || "Untitled listing";
  const brand = (raw.localizedAspects || []).find((a) => /brand/i.test(a.name || ""))?.value
    || title.split(/\s+/).slice(0, 2).join(" ");
  const category = guessCategory(title);
  const label = guessSizeLabel(raw);
  return {
    id: "ebay-" + (raw.itemId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-16),
    title,
    brand,
    price: raw.price ? Number(raw.price.value) : null,
    currency: raw.price?.currency || "USD",
    tags: inferTags(`${title} ${brand}`),
    designers: [],
    category,
    era: guessEra(title),
    size: sizeRecord(label || "M", { gender: "unisex", category }),
    img: raw.image?.imageUrl || null,      // eBay Browse image URLs are display-licensed for API consumers
    alt: title,
    url: raw.itemWebUrl || null,
    condition: raw.condition || null,
    source: "eBay Browse API",
  };
}

// Search + normalize + dedupe against known ids.
export async function searchEbay(q, { limit = 24, knownIds = new Set() } = {}) {
  const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const token = await getAppToken();
  const url = `${HOSTS[env].api}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 50)}&category_ids=11450`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!res.ok) throw new Error(`eBay search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.itemSummaries || [])
    .map(normalizeEbayItem)
    .filter((it) => !knownIds.has(it.id));
}
