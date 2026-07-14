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

import { normalizeSourceProduct } from "./adapters/normalize.js";
export { inferTags } from "./inferTags.js";

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

// Merchant product feed (affiliate CSV/JSON the merchant publishes for us).
export async function fromMerchantFeed(feedUrl) {
  if (!feedUrl) return [];
  try {
    const data = await fetchJson(feedUrl, { Accept: "application/json" });
    if (!data) return [];
    const rows = Array.isArray(data) ? data : data.items || [];
    return rows.slice(0, 1000).map((r) => normalizeSourceProduct(r, "merchant-feed"));
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
    return (Array.isArray(data.products) ? data.products : [])
      .slice(0, 1000).map((p) => normalizeSourceProduct(p, "official-api"));
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
