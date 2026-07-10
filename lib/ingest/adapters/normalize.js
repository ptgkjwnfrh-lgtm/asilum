// lib/ingest/adapters/normalize.js
// The single normalizer every adapter funnels through: raw source data in,
// ASILUM NormalizedProduct out. After this point the app does not care
// whether a product came from eBay, Depop, Grailed, SSENSE, TRR, or Shopify.

import { inferTags } from "../sources.js";
import { guessCategory, guessEra } from "../ebay.js";

const COLORS = ["black","white","cream","beige","brown","tan","grey","gray","navy","blue","red","green","olive","yellow","orange","purple","pink","burgundy","gold","silver"];
const MATERIALS = ["cotton","wool","leather","denim","silk","linen","nylon","cashmere","suede","canvas","fleece","corduroy","velvet","mohair","polyester"];
const FITS = ["boxy","oversized","slim","relaxed","cropped","baggy","fitted","wide","tapered","bootcut","flare","straight"];

function pick(text, vocab) {
  const t = ` ${String(text).toLowerCase()} `;
  return vocab.find((w) => t.includes(` ${w} `)) || null;
}

// Typed tag rows for the moderatable product_tags layer, derived from what the
// source actually gave us — never invented.
export function typedTagsFrom(p) {
  const out = [];
  const add = (tag, tagType, confidence) => tag && out.push({ tag: String(tag).toLowerCase(), tagType, confidence, source: "system" });
  add(p.brand, "brand", 0.9);
  add(p.category, "category", 0.8);
  add(p.subcategory, "subcategory", 0.7);
  add(p.color, "color", 0.6);
  add(p.material, "fabric", 0.6);
  add(p.fit, "fit", 0.6);
  add(p.silhouette, "silhouette", 0.6);
  add(p.condition, "condition", 0.7);
  add(p.decade, "decade", 0.6);
  // Brain-vector aesthetics carry over as low-stakes aesthetic tags.
  for (const [t, v] of Object.entries(p.tags || {})) {
    if (v >= 0.3) add(t, "aesthetic", Math.min(0.8, v));
  }
  return out;
}

/**
 * normalizeSourceProduct(raw, sourceName)
 * `raw` uses loose field names (title/name, price/amount, images/image…);
 * adapters may pre-map source-specific fields before calling this.
 */
export function normalizeSourceProduct(raw, sourceName) {
  const title = raw.title || raw.name || "Untitled item";
  const brand = raw.brand || raw.designer || raw.merchant || "Unknown";
  const text = [title, brand, raw.description].filter(Boolean).join(" ");
  const sourceProductId = String(raw.source_product_id || raw.sourceProductId || raw.itemId || raw.sku || raw.id || "").slice(0, 80);
  const era = raw.era || guessEra(title);
  const images = (raw.images || (raw.image ? [raw.image] : []) || []).filter(Boolean);
  return {
    id: raw.id && String(raw.id).includes("-") ? raw.id : `${sourceName}-${sourceProductId}`,
    source_name: sourceName,
    source_product_id: sourceProductId,
    source_product_url: raw.source_product_url || raw.url || raw.link || null,
    title,
    brand,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80),
    description: raw.description ? String(raw.description).slice(0, 2000) : null,
    price: raw.price != null ? Number(raw.price) || null : null,
    currency: raw.currency || "USD",
    tags: raw.tags && !Array.isArray(raw.tags) ? raw.tags : inferTags(text),
    designers: raw.designers || (brand !== "Unknown" ? [brand] : []),
    category: raw.category || guessCategory(title),
    subcategory: raw.subcategory || null,
    color: raw.color || pick(text, COLORS),
    material: raw.material || pick(text, MATERIALS),
    fit: raw.fit || pick(text, FITS),
    silhouette: raw.silhouette || null,
    condition: raw.condition || null,
    size: raw.size || null,
    era,
    decade: raw.decade || era?.decade || null,
    img: images[0] || raw.img || null,
    images,
    alt: raw.alt || title,
    url: raw.source_product_url || raw.url || raw.link || null,
    is_available: raw.is_available !== false,
    availability_status: raw.availability_status || "unknown",
    source: raw.source || sourceName,
  };
}
