// lib/verification/desk.js — THE VERIFICATION DESK's comparer (V.2).
//
// The owner's rule (docs/OPERATING-COSTS.md, 17 Sep): every piece gets the
// source's tags and an AI research cross-check; a human archivalist sees a
// piece ONLY when the two materially disagree. Missing or inconclusive
// evidence stays PENDING — never approved, never assigned to a human.
//
// This module is the deterministic half of that rule, and it is honest
// about what it is: the "research" column is LOCAL RULES reading the
// listing's own words (the same taxonomy scan lib/asterisk/tagAudit.js runs
// when no model is keyed), so it can only ever agree, disagree or fall
// silent on what the text says. It never calls a model; the desk prints
// "LOCAL RULES — MODEL OFF" over every case. With AI_RESEARCH_ENABLED and a
// key, production swaps this column for cited research through the
// learned_facts ladder (lib/asterisk/research.js) — the shape below is what
// that column will carry.
//
// SERVER-ONLY (reads the catalog). Pure otherwise: the same input yields
// the same cases, so a test can hold it.

import { CATALOG } from "../ingest/catalog.js";
import { MATERIALS, COLORS, SILHOUETTES } from "../fashion-taxonomy/index.js";

export const DESK_MODE = Object.freeze({
  research: "local-rules",
  model: false,
  label: "LOCAL RULES — MODEL OFF",
  humanLabor: "TBD",
});

export const COMPARED_FIELDS = Object.freeze(["category", "material", "color", "silhouette"]);
const MATERIAL_FIELDS = new Set(["category", "material"]); // a disagreement here is material

const norm = (v) => String(v || "").toLowerCase().trim();

/** What the SOURCE asserts, read from the listing's structured fields. */
export function sourceClaims(item) {
  const claims = {};
  if (item.category) claims.category = norm(item.category);
  const tags = item.tags && !Array.isArray(item.tags) ? Object.keys(item.tags) : (item.tags || []);
  // structured facets ride on some rows as `facets`; seed rows carry only
  // the aesthetic vector, so most fields are simply unclaimed
  const facets = item.facets || {};
  for (const f of ["material", "color", "silhouette"]) {
    if (facets[f]) claims[f] = norm(Array.isArray(facets[f]) ? facets[f][0] : facets[f]);
  }
  void tags;
  return claims;
}

/** What LOCAL RULES read in the listing's own words. */
export function researchReading(item) {
  const text = norm(`${item.title || ""} ${item.alt || ""} ${item.description || ""}`);
  const first = (list) => list.find((w) => text.includes(norm(w))) || null;
  const out = {};
  const material = first(MATERIALS); if (material) out.material = norm(material);
  const color = first(COLORS); if (color) out.color = norm(color);
  const silhouette = first(SILHOUETTES); if (silhouette) out.silhouette = norm(silhouette);
  // category: only when the listing text names one of the catalog's own categories
  const cats = ["tops", "bottoms", "outerwear", "tailoring", "dresses", "knitwear", "footwear", "accessories"];
  const cat = cats.find((c) => text.includes(c)); if (cat) out.category = cat;
  return out;
}

/** Compare one piece. Each field is agree | conflict | pending. */
export function compareItem(item) {
  const source = sourceClaims(item);
  const research = researchReading(item);
  const fields = COMPARED_FIELDS.map((field) => {
    const s = source[field] || null, r = research[field] || null;
    let status = "pending";
    if (s && r) status = s === r ? "agree" : "conflict";
    return {
      field, source: s, research: r, status,
      material: MATERIAL_FIELDS.has(field),
      evidence: r ? `word "${r}" in the listing text` : "no reading — absent evidence is not agreement",
    };
  });
  const conflict = fields.some((f) => f.status === "conflict" && f.material) ? "material"
    : fields.some((f) => f.status === "conflict") ? "minor" : null;
  const status = conflict === "material" ? "archivalist" : conflict === "minor" ? "flagged" : fields.every((f) => f.status === "pending") ? "pending" : fields.some((f) => f.status === "agree") ? "agreed" : "pending";
  return { itemId: String(item.id), title: item.title, brand: item.brand, source: item.source, fields, status };
}

/** The desk over a slice of the catalog. */
export function buildDesk({ items = null, limit = 40 } = {}) {
  const pool = (items || CATALOG).slice(0, Math.max(1, Math.min(limit, 400)));
  const cases = pool.map(compareItem);
  const counts = { archivalist: 0, flagged: 0, agreed: 0, pending: 0 };
  for (const c of cases) counts[c.status] = (counts[c.status] || 0) + 1;
  return { mode: DESK_MODE, counts, total: cases.length, cases };
}
