// Canonical product resolution. Mutation routes accept only an item id and
// rebuild the snapshot from server-owned inventory before learning or saving.

import { TAGS } from "./brain/tags.js";
import { getItem } from "./db/index.js";
import { getCatalogItem } from "./ingest/catalog.js";
import { safeExternalUrl, safeImageUrl } from "./url.js";

const KNOWN_TAGS = new Set(TAGS);
const text = (value, max) => value == null ? null : String(value).trim().slice(0, max) || null;

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
    era: item.era && typeof item.era === "object" ? item.era : null,
    size: item.size && typeof item.size === "object" ? item.size : item.size || null,
    is_available: item.is_available !== false,
    availability_status: text(item.availability_status, 40) || "unknown",
    moderation_status: text(item.moderation_status, 40) || "visible",
  };
}

export async function resolveProduct(id) {
  const key = text(id, 80);
  if (!key) return null;
  let item = null;
  try { item = await getItem(key); } catch {}
  return productSnapshot(item || getCatalogItem(key));
}

export async function resolveProducts(ids = []) {
  const unique = [...new Set(ids.map((id) => text(id, 80)).filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (id) => [id, await resolveProduct(id)]));
  return new Map(pairs.filter(([, item]) => item));
}
