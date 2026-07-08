// lib/ingest/sources.js
// Ingestion adapters. IMPORTANT POLICY: this layer only pulls from sources
// that PERMIT programmatic access. It never scrapes hotlink-protected or
// ToS-restricted retailers (e.g. SSENSE, Grailed, Depop, Farfetch, etc.).
//
// Permitted source types:
//   - official / documented product APIs (merchant provides them)
//   - affiliate & merchant product feeds (CSV/JSON the merchant publishes)
//   - open-access museum APIs (e.g. The Met, public-domain flagged only)
//
// Each adapter normalizes to the catalog item shape used by the brain:
//   { id, title, brand, price, currency, tags, designers, category, era,
//     size, img, alt, url, source }

import { coldStart } from "../brain/index.js";

// Turn a free-text title/description into a tag vector using the brain, so
// ingested items get scored consistently with seed items.
export function inferTags(text) {
  return coldStart(text || "").profile;
}

function normalize(raw, source) {
  return {
    id: raw.id || `${source}-${(raw.sku || raw.url || Math.random()).toString().slice(-10)}`,
    title: raw.title || raw.name || "Untitled item",
    brand: raw.brand || raw.merchant || "Unknown",
    price: Number(raw.price) || null,
    currency: raw.currency || "USD",
    tags: raw.tags || inferTags([raw.title, raw.description, raw.brand].filter(Boolean).join(" ")),
    designers: raw.designers || (raw.brand ? [raw.brand] : []),
    category: raw.category || null,
    era: raw.era || null,
    size: raw.size || null,
    img: raw.image || raw.img || null, // only kept if source permits hotlinking
    alt: raw.alt || raw.title || "",
    url: raw.url || raw.link || null,  // click-through / buy link (affiliate)
    source,
  };
}

// Merchant product feed (affiliate CSV/JSON the merchant publishes for us).
export async function fromMerchantFeed(feedUrl) {
  if (!feedUrl) return [];
  try {
    const res = await fetch(feedUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data.items || [];
    return rows.map((r) => normalize(r, "merchant-feed"));
  } catch {
    return [];
  }
}

// Official documented product API (merchant-provided; key via env).
export async function fromOfficialApi(endpoint, apiKey) {
  if (!endpoint || !apiKey) return [];
  try {
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products || []).map((p) => normalize(p, "official-api"));
  } catch {
    return [];
  }
}

// ---- Guard: refuse disallowed hosts ---------------------------------------

const BLOCKED_HOSTS = [
  "ssense.com", "grailed.com", "depop.com", "farfetch.com",
  "therealreal.com", "vestiairecollective.com",
];

export function isPermittedSource(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !BLOCKED_HOSTS.some((b) => host === b || host.endsWith("." + b));
  } catch {
    return false;
  }
}

// Runs enabled adapters, merges + dedupes by id.
export async function runIngestion(config = {}) {
  const batches = await Promise.all([
    config.merchantFeedUrl && isPermittedSource(config.merchantFeedUrl)
      ? fromMerchantFeed(config.merchantFeedUrl) : Promise.resolve([]),
    config.officialApiUrl && isPermittedSource(config.officialApiUrl)
      ? fromOfficialApi(config.officialApiUrl, config.officialApiKey) : Promise.resolve([]),
  ]);
  const merged = new Map();
  for (const batch of batches) for (const item of batch) merged.set(item.id, item);
  return Array.from(merged.values());
}
