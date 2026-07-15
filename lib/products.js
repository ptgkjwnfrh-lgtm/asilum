// Canonical product resolution. Mutation routes accept only an item id and
// rebuild the snapshot from server-owned inventory before learning or saving.

import { TAGS } from "./brain/tags.js";
import { getItem, listItems } from "./db/index.js";
import { CATALOG, getCatalogItem } from "./ingest/catalog.js";
import { safeExternalUrl, safeImageUrl } from "./url.js";

const KNOWN_TAGS = new Set(TAGS);
const text = (value, max) => value == null ? null : String(value).trim().slice(0, max) || null;

function safeEra(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const year = Number(value.year);
  const out = {
    ...(Number.isInteger(year) && year >= 1800 && year <= 2100 ? { year } : {}),
  };
  for (const [key, max] of Object.entries({ season: 40, decade: 20, raw: 80 })) {
    const cleaned = text(value[key], max);
    if (cleaned) out[key] = cleaned;
  }
  return Object.keys(out).length ? out : null;
}

function safeSize(value) {
  if (typeof value === "string") return text(value, 40);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, max] of Object.entries({ label: 40, system: 20, gender: 20, fitsLikeUS: 20 })) {
    const cleaned = text(value[key], max);
    if (cleaned) out[key] = cleaned;
  }
  const bias = Number(value.runsBias);
  if (Number.isFinite(bias)) out.runsBias = Math.max(-5, Math.min(5, bias));
  if (value.measurements && typeof value.measurements === "object" && !Array.isArray(value.measurements)) {
    const measurements = {};
    for (const key of ["chest", "waist", "hip", "shoulder", "length", "inseam", "rise"]) {
      const number = Number(value.measurements[key]);
      if (Number.isFinite(number) && number >= 0 && number <= 200) measurements[key] = number;
    }
    if (Object.keys(measurements).length) out.measurements = measurements;
  }
  return Object.keys(out).length ? out : null;
}

export function isDiscoverableProduct(item) {
  if (!item || item.is_available === false) return false;
  if ((item.moderation_status || "visible") !== "visible") return false;
  return !["sold", "removed", "unavailable"].includes(item.availability_status);
}

export function productSnapshot(item) {
  if (!item || typeof item !== "object") return null;
  const id = text(item.id, 80);
  if (!id) return null;
  const tags = {};
  for (const [tag, raw] of Object.entries(item.tags || {})) {
    const key = String(tag).toUpperCase();
    const weight = Number(raw);
    if (KNOWN_TAGS.has(key) && Number.isFinite(weight) && weight > 0) {
      tags[key] = Math.min(1, weight);
    }
  }
  const price = Number(item.price);
  const sourceUrl = safeExternalUrl(item.source_product_url || item.url);
  return {
    id,
    title: text(item.title, 300) || "Untitled item",
    brand: text(item.brand, 160) || "Unknown",
    price: Number.isFinite(price) && price >= 0 ? price : null,
    currency: /^[A-Z]{3}$/.test(String(item.currency || "").toUpperCase())
      ? String(item.currency).toUpperCase() : "USD",
    tags,
    img: safeImageUrl(item.img),
    alt: text(item.alt, 300),
    source: text(item.source || item.source_name, 80),
    source_name: text(item.source_name || item.source, 80),
    source_product_id: text(item.source_product_id, 160),
    source_product_url: sourceUrl,
    url: sourceUrl,
    designers: Array.isArray(item.designers)
      ? item.designers.slice(0, 4).map((v) => text(v, 160)).filter(Boolean) : [],
    category: text(item.category, 80),
    subcategory: text(item.subcategory, 80),
    color: text(item.color, 80),
    material: text(item.material, 120),
    fit: text(item.fit, 80),
    silhouette: text(item.silhouette, 100),
    condition: text(item.condition, 100),
    decade: text(item.decade, 40),
    era: safeEra(item.era),
    size: safeSize(item.size),
    is_available: item.is_available !== false,
    availability_status: text(item.availability_status, 40) || "unknown",
    moderation_status: text(item.moderation_status, 40) || "visible",
  };
}

const PUBLIC_ZONES = new Set(["core", "discovery", "reach", "ad"]);
const PUBLIC_RANK_PARTS = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "theta", "zeta", "ad",
]);

function finiteNumber(value, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

// User-facing APIs should never serialize SELECT * rows. Keep the stable card
// contract and a small allowlist of explainable ranking metadata; generated
// tsvectors, moderation flags, timestamps, and internal source ids stay server-side.
export function publicProduct(item) {
  const snapshot = productSnapshot(item);
  if (!snapshot) return null;
  const {
    moderation_status: _moderationStatus,
    source_product_id: _sourceProductId,
    ...safe
  } = snapshot;

  if (PUBLIC_ZONES.has(item._zone)) safe._zone = item._zone;
  if (["graph", "tags"].includes(item._via)) safe._via = item._via;
  const score = finiteNumber(item._score);
  if (score != null) safe._score = score;
  const contextMatch = finiteNumber(item._contextMatch, -1, 1);
  if (contextMatch != null) safe._contextMatch = contextMatch;
  if (item._parts && typeof item._parts === "object" && !Array.isArray(item._parts)) {
    safe._parts = Object.fromEntries(Object.entries(item._parts)
      .filter(([key, value]) => PUBLIC_RANK_PARTS.has(key) && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)]));
  }

  const confidence = finiteNumber(item.confidenceScore, 0, 1);
  if (confidence != null) safe.confidenceScore = confidence;
  if (typeof item.matchReason === "string") safe.matchReason = item.matchReason.slice(0, 80);
  if (Array.isArray(item.matchedTags)) {
    safe.matchedTags = item.matchedTags.slice(0, 12).map((tag) => text(tag, 40)).filter(Boolean);
  }

  // Sponsorship is returned only when it is an active, disclosed placement.
  // Inactive campaign metadata has no reason to cross the API boundary.
  const disclosure = text(item.sponsor_disclosure, 200);
  if (item.sponsored === true && item.sponsorship_status === "active" && disclosure) {
    safe.sponsored = true;
    safe.sponsor_disclosure = disclosure;
  }
  return safe;
}

let poolCache = null;
let poolCacheAt = 0;
let poolPromise = null;
const PRODUCT_POOL_TTL_MS = 15_000;

// Expensive discovery surfaces share one short-lived inventory snapshot per
// server instance instead of each scanning 5,000 rows independently.
export async function getDiscoverablePool({ limit = 5000, fallback = true } = {}) {
  const safeLimit = Math.max(1, Math.min(5000, Math.trunc(Number(limit)) || 5000));
  const now = Date.now();
  if (poolCache && now - poolCacheAt < PRODUCT_POOL_TTL_MS) {
    return (poolCache.length ? poolCache : fallback ? CATALOG : []).slice(0, safeLimit);
  }
  if (!poolPromise) {
    poolPromise = (async () => {
      // An empty successful read may use the explicit demo fallback. A failed
      // database read must propagate: treating an outage as an empty catalog
      // would make synthetic inventory look legitimate during recovery.
      const rows = await listItems(5000);
      poolCache = rows.filter(isDiscoverableProduct);
      poolCacheAt = Date.now();
      return poolCache;
    })().finally(() => { poolPromise = null; });
  }
  const rows = await poolPromise;
  return (rows.length ? rows : fallback ? CATALOG : []).slice(0, safeLimit);
}

export async function resolveProduct(id) {
  const key = text(id, 80);
  if (!key) return null;
  const item = await getItem(key);
  if (item) return isDiscoverableProduct(item) ? productSnapshot(item) : null;
  // Synthetic inventory is a keyless/empty-catalog fallback. Once any live
  // inventory exists, guessed syn-* ids must not re-enter mutation paths.
  const livePool = await getDiscoverablePool({ fallback: false });
  return livePool.length ? null : productSnapshot(getCatalogItem(key));
}

export async function resolveProducts(ids = []) {
  const unique = [...new Set(ids.map((id) => text(id, 80)).filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (id) => [id, await resolveProduct(id)]));
  return new Map(pairs.filter(([, item]) => item));
}
