// lib/ingest/adapters/normalize.js
// The single normalizer every adapter funnels through: raw source data in,
// ASILUM NormalizedProduct out. After this point the app does not care
// whether a product came from eBay, Shopify, or an authorized merchant feed.

import { createHash } from "node:crypto";
import { TAGS } from "../../brain/tags.js";
import { safeExternalUrl, safeImageUrl } from "../../url.js";
import { inferTags } from "../inferTags.js";
import { guessCategory, guessEra } from "../ebay.js";

const COLORS = ["black","white","cream","beige","brown","tan","grey","gray","navy","blue","red","green","olive","yellow","orange","purple","pink","burgundy","gold","silver"];
const MATERIALS = ["cotton","wool","leather","denim","silk","linen","nylon","cashmere","suede","canvas","fleece","corduroy","velvet","mohair","polyester"];
const FITS = ["boxy","oversized","slim","relaxed","cropped","baggy","fitted","wide","tapered","bootcut","flare","straight"];
const AVAILABILITY = new Set(["available", "sold", "removed", "price_changed", "source_unavailable", "unknown"]);

function pick(text, vocab) {
  const t = ` ${String(text).toLowerCase()} `;
  return vocab.find((w) => t.includes(` ${w} `)) || null;
}

function plainText(value, limit = 2000) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function safeEra(value, fallback) {
  const era = value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  if (!era || typeof era !== "object") return null;
  const year = Number(era.year);
  return {
    ...(Number.isInteger(year) && year >= 1800 && year <= 2100 ? { year } : {}),
    ...(plainText(era.season, 40) ? { season: plainText(era.season, 40) } : {}),
    ...(plainText(era.decade, 20) ? { decade: plainText(era.decade, 20) } : {}),
    ...(plainText(era.raw, 80) ? { raw: plainText(era.raw, 80) } : {}),
  };
}

function safeSize(value) {
  if (typeof value === "string") return { label: plainText(value, 40) };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, limit] of Object.entries({ label: 40, system: 20, gender: 20, fitsLikeUS: 20 })) {
    const cleaned = plainText(value[key], limit);
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
  raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const source = String(sourceName || "source").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40) || "source";
  const title = plainText(raw.title || raw.name || "Untitled item", 300) || "Untitled item";
  const brand = plainText(raw.brand || raw.designer || raw.merchant || "Unknown", 160) || "Unknown";
  const description = plainText(raw.description);
  const text = [title, brand, description].filter(Boolean).join(" ");
  const rawSourceId = String(raw.source_product_id || raw.sourceProductId || raw.itemId || raw.sku || raw.id || "")
    .replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const sourceProductId = (rawSourceId || createHash("sha256").update(`${source}:${title}:${raw.url || ""}`).digest("hex").slice(0, 32)).slice(0, 160);
  const era = safeEra(raw.era, guessEra(title));
  const category = guessCategory(`${title} ${plainText(raw.category, 120)}`);
  const images = (Array.isArray(raw.images) ? raw.images : raw.image ? [raw.image] : [])
    .map((image) => safeImageUrl(typeof image === "string" ? image : image?.url))
    .filter(Boolean).slice(0, 12);
  const sourceUrl = safeExternalUrl(raw.source_product_url || raw.url || raw.link);
  const inferred = raw.tags && !Array.isArray(raw.tags) ? raw.tags : inferTags(text);
  const tags = Object.fromEntries(Object.entries(inferred || {}).filter(([tag, value]) =>
    TAGS.includes(String(tag).toUpperCase()) && Number.isFinite(Number(value)) && Number(value) > 0
  ).map(([tag, value]) => [String(tag).toUpperCase(), Math.min(1, Number(value))]));
  const incomingId = String(raw.id || "");
  const namespacedId = `${source}-${sourceProductId}`;
  const id = incomingId.startsWith(`${source}-`) && incomingId.length <= 80
    ? incomingId
    : namespacedId.length <= 80
      ? namespacedId
      : `${source}-${createHash("sha256").update(sourceProductId).digest("hex").slice(0, 48)}`;
  return {
    id,
    source_name: source,
    source_product_id: sourceProductId,
    source_product_url: sourceUrl,
    title,
    brand,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80),
    description: description || null,
    price: raw.price != null && Number.isFinite(Number(raw.price)) && Number(raw.price) >= 0 ? Number(raw.price) : null,
    currency: /^[A-Z]{3}$/.test(String(raw.currency || "").toUpperCase()) ? String(raw.currency).toUpperCase() : "USD",
    tags,
    designers: (Array.isArray(raw.designers) ? raw.designers : brand !== "Unknown" ? [brand] : [])
      .slice(0, 8).map((designer) => plainText(designer, 160)).filter(Boolean),
    category,
    subcategory: plainText(raw.subcategory, 80) || null,
    color: plainText(raw.color, 80) || pick(text, COLORS),
    material: plainText(raw.material, 120) || pick(text, MATERIALS),
    fit: plainText(raw.fit, 80) || pick(text, FITS),
    silhouette: plainText(raw.silhouette, 100) || null,
    condition: plainText(raw.condition, 100) || null,
    size: safeSize(raw.size),
    era,
    decade: plainText(raw.decade, 20) || era?.decade || null,
    img: images[0] || safeImageUrl(raw.img),
    images,
    alt: plainText(raw.alt, 300) || title,
    url: sourceUrl,
    is_available: raw.is_available !== false,
    availability_status: AVAILABILITY.has(String(raw.availability_status)) ? String(raw.availability_status) : "unknown",
    source,
  };
}
