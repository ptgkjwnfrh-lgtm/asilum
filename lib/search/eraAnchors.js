// lib/search/eraAnchors.js — era-anchor extraction for cultural reads (Aug 5).
//
// THE DEFECT THIS EXISTS FOR (owner-reported, reproduced on production):
// "playboi carti" resolved to the right entity and era ("vamp rockstar" —
// the opium reading) but the RACK contradicted it: boxy tees and oversized
// shirts, i.e. his older cash-carti silhouette. Cause: the cultural tier
// ranks by the interpretation's four abstract tags alone; its colors, moods,
// and the summary's concrete garment language ("flared leather, studs,
// silver crosses") were discarded, scores tied in wide clusters, and the
// alphabetical id tie-break did the real ranking. Item color data is 0/915
// (measured Aug 5) — a color bonus would be a no-op, so the only honest era
// signal the catalog can corroborate is the summary's garment/material/
// silhouette words against item TITLES.
//
// Mechanism, deliberately narrow:
//   * ANCHOR_WORDS is a closed curated set: materials, garment nouns,
//     hardware, and silhouette adjectives that actually occur in catalog
//     titles. Free extraction from summaries would let editorial words
//     ("menace", "rockstar") pollute ranking.
//   * Matching is WHOLE-WORD with simple plural/participle folds. Substring
//     matching is proven treacherous on this catalog: "stud" hits "Acne
//     Studios", "cross" hits "crossbody" (both measured).
//   * Titles are "Brand — piece"; only the PIECE part is matched, so a
//     material word can never ride in on a brand name ("Chrome Hearts").
//   * Anchors ORDER the rack, they never expand it — inclusion stays the
//     r10 contract (≥1 exact slate-tag hit, lib/discover/tagRank.js).

const MATERIALS = [
  "leather", "denim", "suede", "mohair", "wool", "silk", "satin", "velvet",
  "mesh", "lace", "nylon", "shearling", "fur", "cashmere", "corduroy",
  "canvas", "fleece",
];

const GARMENTS_AND_HARDWARE = [
  "moto", "boot", "derby", "loafer", "sneaker", "chain", "cross", "stud",
  "flare", "cargo", "hoodie", "tee", "knit", "trench", "blazer", "varsity",
  "parka", "beanie", "scarf", "belt", "necklace", "ring", "bracelet",
  "jersey", "polo", "chino", "balaclava", "vest", "skirt", "gown",
];

const SILHOUETTES = [
  "oversized", "boxy", "cropped", "fitted", "distressed", "padded",
  "quilted", "pleated", "flared", "baggy", "slim", "longline",
];

export const ERA_ANCHOR_WORDS = new Set([
  ...MATERIALS, ...GARMENTS_AND_HARDWARE, ...SILHOUETTES,
]);

// Fold a raw token to its anchor base, or null if it is not anchor
// vocabulary: "studs"→stud, "studded"→stud, "flared"→flare (flared is also
// itself a silhouette anchor; base form wins so variants dedupe).
export function anchorBaseOf(rawToken) {
  const t = String(rawToken || "").toLowerCase().replace(/[^a-z]/g, "");
  if (t.length < 3) return null;
  const candidates = [t];
  if (t.endsWith("ies")) candidates.push(t.slice(0, -3) + "y"); // derbies → derby
  if (t.endsWith("es")) candidates.push(t.slice(0, -2));        // crosses → cross
  if (t.endsWith("s")) candidates.push(t.slice(0, -1));
  if (t.endsWith("ed")) {
    candidates.push(t.slice(0, -1));        // flared → flare
    if (t.length > 4 && t[t.length - 3] === t[t.length - 4]) {
      candidates.push(t.slice(0, -3));      // studded → stud
    }
  }
  for (const c of candidates) if (ERA_ANCHOR_WORDS.has(c)) return c;
  return null;
}

// Distinct anchor bases present in an interpretation's summary + label.
export function extractEraAnchors(text) {
  const out = new Set();
  for (const tok of String(text || "").toLowerCase().split(/[^a-z]+/)) {
    const base = anchorBaseOf(tok);
    if (base) out.add(base);
  }
  return [...out];
}

// Whole-word variants an anchor base may take in a title.
function variantsOf(base) {
  const v = [base, base + "s", base + "es", base + "ed", base + "d"];
  if (base.endsWith("y")) v.push(base.slice(0, -1) + "ies"); // derby → derbies
  v.push(base + base[base.length - 1] + "ed"); // stud → studded
  return v;
}

// How many DISTINCT anchors hit the piece part of a title, whole-word.
export function anchorHitCount(title, anchors) {
  if (!anchors?.length) return 0;
  const piece = String(title || "").toLowerCase().replace(/^[^—]+—\s*/, "");
  if (!piece) return 0;
  let hits = 0;
  for (const a of anchors) {
    const re = new RegExp("\\b(?:" + variantsOf(a).join("|") + ")\\b");
    if (re.test(piece)) hits++;
  }
  return hits;
}
