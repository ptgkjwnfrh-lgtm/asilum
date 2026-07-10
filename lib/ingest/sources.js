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

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson(url, headers) {
  const res = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const length = Number(res.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) return null;
  const text = await res.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) return null;
  return JSON.parse(text);
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
    const data = await fetchJson(feedUrl, { Accept: "application/json" });
    if (!data) return [];
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
    const data = await fetchJson(endpoint, { Authorization: `Bearer ${apiKey}` });
    if (!data) return [];
    return (data.products || []).map((p) => normalize(p, "official-api"));
  } catch {
    return [];
  }
}

// ---- Guard: refuse disallowed hosts ---------------------------------------

export function isPermittedSource(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    const allowed = new Set(
      (process.env.INGEST_ALLOWED_HOSTS || "")
        .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
    );
    return allowed.has(parsed.hostname.toLowerCase());
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
