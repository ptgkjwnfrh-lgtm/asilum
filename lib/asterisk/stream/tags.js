// lib/asterisk/stream/tags.js — STEP FOUR: the item's tag vector, composed.
//
// Two layers ride in ONE object, item.tags, so the brain that already exists
// (learn(), vecSim, the alpha bridge) sees both without a new code path:
//   * the ten CANONICAL aesthetics, UPPERCASE keys — the lexicon's reading of
//     the words, the decoded seller tags' reading, and the model's scoring,
//     blended; and
//   * DESCRIPTORS, lowercase keys — the deeper array ("dagger collar",
//     "lambskin", "taxi driver"), weighted, capped at DESCRIPTOR_CAP.
// A person's profile learns both the moment they act on the piece; the feed
// matches both. That is the stream: an item with "dagger collar" and "mid
// 1970s" reaches the people whose profiles carry those words.
//
// The composer is pure. With no identification it is the deterministic path
// alone, which is what ran before this module existed.

import { inferTags } from "../../ingest/inferTags.js";
import { TAGS } from "../../brain/tags.js";
import { aspectText } from "./decode.js";
import { DESCRIPTOR_CAP, normalizeDescriptorTag } from "./schema.js";

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// descriptor kind → product_tags facet (lib/tagging/vocabulary.js). Colour is
// dropped on purpose: the colour law says a colour is verified by the image
// pass or it is not written.
export const KIND_FACET = Object.freeze({
  garment: "garment", material: "material", silhouette: "silhouette", fit: "fit",
  detail: "detail", reference: "reference", subculture: "subculture", mood: "mood",
  collection: "collection", decade: "decade", origin: "origin",
});

function decodedDescriptors(decoded) {
  if (!decoded) return [];
  const out = [];
  const add = (v, kind, weight) => { const tag = normalizeDescriptorTag(v); if (tag) out.push({ tag, kind, weight }); };
  add(decoded.style, "silhouette", 0.55);
  add(decoded.type, "garment", 0.5);
  add(decoded.theme, "reference", 0.45);
  for (const m of [decoded.material, decoded.outerMaterial, decoded.lining]) add(m, "material", 0.5);
  add(decoded.decade, "decade", 0.5);
  add(decoded.madeIn, "origin", 0.4);
  for (const f of decoded.features || []) add(f, "detail", 0.4);
  for (const f of decoded.accents || []) add(f, "detail", 0.35);
  for (const k of ["closure", "neckline", "sleeve", "pattern"]) add(decoded[k], "detail", 0.35);
  for (const r of decoded.reference || []) add(r, "reference", 0.5);
  if (decoded.vintage === true) add("vintage", "decade", 0.5);
  return out;
}

/**
 * composeTags({ title, brand, description, decoded, identification })
 * → { tags, canonical, descriptors, typed }
 */
export function composeTags({ title = "", brand = "", description = "", decoded = null, identification = null } = {}) {
  const lex = inferTags(`${title} ${brand} ${String(description || "").slice(0, 400)}`);
  const asp = decoded ? inferTags(aspectText(decoded)) : {};
  const conf = identification ? clamp01(identification.confidence) : 0;
  const canonical = {};
  for (const t of TAGS) {
    const l = clamp01(lex[t]), a = clamp01(asp[t]);
    const m = identification ? clamp01(identification.taste?.[t]) : 0;
    // the model's reading leads when it is confident; the lexicon never vanishes
    const v = identification
      ? clamp01(0.35 * l + 0.15 * a + 0.7 * conf * m + 0.15 * (1 - conf) * l)
      : clamp01(0.8 * l + 0.25 * a);
    if (v > 0.02) canonical[t] = +v.toFixed(3);
  }
  // descriptors: the model's first (scaled by its confidence), the seller's decoded facts second; max wins
  const byTag = new Map();
  const put = (d) => {
    const prev = byTag.get(d.tag);
    if (!prev || prev.weight < d.weight) byTag.set(d.tag, d);
  };
  for (const d of identification?.descriptors || []) put({ tag: d.tag, kind: d.kind, weight: +Math.min(0.9, d.weight * (0.6 + 0.4 * conf)).toFixed(3) });
  for (const d of decodedDescriptors(decoded)) put(d);
  const descriptors = [...byTag.values()].filter((d) => d.weight >= 0.1).sort((a, b) => b.weight - a.weight).slice(0, DESCRIPTOR_CAP);
  const tags = { ...canonical };
  for (const d of descriptors) tags[d.tag] = d.weight;
  const typed = descriptors
    .filter((d) => KIND_FACET[d.kind])
    .map((d) => ({ tag: d.tag, tagType: KIND_FACET[d.kind], confidence: d.weight, source: identification ? "asterisk" : "system" }));
  return { tags, canonical, descriptors, typed };
}

// Split one stored tags object back into its two layers.
export function splitTags(tags = {}) {
  const canonical = {}, descriptors = {};
  for (const [k, v] of Object.entries(tags || {})) {
    if (TAGS.includes(k)) canonical[k] = v; else if (k === k.toLowerCase()) descriptors[k] = v;
  }
  return { canonical, descriptors };
}
