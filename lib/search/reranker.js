// lib/search/reranker.js — THE TASTE RERANKER (V.2 brief §10, step 6). Pure.
//
// The engine (lib/search/index.js) answers the QUESTION: literal, lexical and
// bounded-semantic candidates, every constraint applied, a reason and a
// confidence on each row. This module reorders a page of that answer by the
// reader's PERMITTED taste profile — and the brief's two guards are the
// whole design:
//
//   PRESERVE EXACT ENTITY IDENTITY. A row the engine matched on its name, its
//   brand, its designer or its credit is PINNED: it keeps its position
//   relative to every other pinned row and nothing taste-ranked can pass it.
//   A question about Helmut Lang is answered with Helmut Lang first.
//   PRESERVE EXPLICIT CONSTRAINTS. The reranker never adds a row and never
//   removes one; a size, era, origin or negation the engine applied stays
//   applied because the candidate set is the engine's.
//
// Taste = explicit stamps (the reader's own manual keep/explore tags, weight
// 1, never decayed) + inferred tags (already time-decayed by lib/brain
// before they reach here) + negative feedback (hidden tags, a penalty).
// Repeated impressions are EXPOSURE, not preference: an item the reader has
// already been served is nudged down, not up. Diversity: at most
// DIVERSITY_PER_BRAND rows of one brand in the top window. Exploration: at
// least EXPLORE_SLOTS rows in the top window are LOW-affinity picks (the
// reader's taste is a hypothesis, and a page that only confirms it never
// tests it). Every weight here is an experimental default, not a fact about
// brains — the measurement script states the before/after.
//
// Each row leaves with `match`: { reasons[], source, uncertainty } — the
// engine's reason first, "taste" appended when taste moved it, the listing's
// provider as source, and an uncertainty word from the engine's confidence.

export const RERANK_VERSION = "2026-10-02.1";
export const PINNED_REASONS = Object.freeze(["product name match", "brand match", "designer match", "designer credit", "title match"]);
export const DIVERSITY_PER_BRAND = 2;
export const EXPLORE_SLOTS = 2;
export const TOP_WINDOW = 12;
export const TASTE_WEIGHT = 1.0;          // how far taste may move a non-pinned row (score units)
export const EXPLICIT_WEIGHT = 1.0;       // a stamp counts fully
export const INFERRED_WEIGHT = 0.6;       // an inferred tag counts less than a stamp
export const NEGATIVE_WEIGHT = 1.5;       // a hidden tag counts against, more than for
export const RERANK_SEEN_PENALTY = 0.35;         // an already-served row: exposure, not preference

/** The reader's permitted taste, folded into one signed vector. */
export function foldTaste({ explicit = {}, inferred = {}, negative = {} } = {}) {
  const vec = Object.create(null);
  for (const [t, w] of Object.entries(inferred)) if (Number.isFinite(w)) vec[t] = (vec[t] || 0) + w * INFERRED_WEIGHT;
  for (const [t, w] of Object.entries(explicit)) if (Number.isFinite(w)) vec[t] = (vec[t] || 0) + Math.abs(w) * EXPLICIT_WEIGHT;
  for (const [t, w] of Object.entries(negative)) if (Number.isFinite(w)) vec[t] = (vec[t] || 0) - Math.abs(w) * NEGATIVE_WEIGHT;
  return vec;
}

/** Bounded affinity of an item's tags to the folded taste, in [-1, 1]. */
export function affinity(vec, tags = {}) {
  let dot = 0, na = 0, nb = 0;
  for (const [t, w] of Object.entries(tags || {})) { const v = vec[t] || 0; dot += v * w; nb += w * w; }
  for (const v of Object.values(vec)) na += v * v;
  if (!na || !nb) return 0;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb)));
}

export function uncertaintyOf(row) {
  if (row.matchReason === "assisted read") return "assisted";
  if (row.matchReason === "category browse") return "related";
  if (PINNED_REASONS.includes(row.matchReason)) return "exact";
  const c = Number(row.confidenceScore) || 0;
  return c >= 0.5 ? "likely" : "related";
}

/**
 * Rerank one page. `rows` are the engine's results in its order (each with
 * matchReason / confidenceScore / tags / brand / source). Returns the same
 * rows, same count, reordered, each with `match` and `tasteMoved`.
 */
export function rerankByTaste(rows = [], { taste = null, seen = new Set(), window = TOP_WINDOW } = {}) {
  const vec = taste ? foldTaste(taste) : null;
  const n = rows.length;
  const labelled = rows.map((row, i) => {
    const pinned = PINNED_REASONS.includes(row.matchReason);
    const aff = vec ? affinity(vec, row.tags) : 0;
    const exposure = seen && seen.has(String(row.id)) ? RERANK_SEEN_PENALTY : 0;
    // the engine's order is the base: earlier = higher
    const base = (n - i) / n;
    const score = pinned ? Number.POSITIVE_INFINITY : base + aff * TASTE_WEIGHT - exposure;
    return { row, i, pinned, aff, score };
  });
  const pinnedRows = labelled.filter((x) => x.pinned);                   // keep engine order
  const rest = labelled.filter((x) => !x.pinned).sort((a, b) => b.score - a.score || a.i - b.i);

  // diversity in the top window, then the exploration slots
  const top = [];
  const held = [];
  const perBrand = Object.create(null);
  for (const x of rest) {
    const b = String(x.row.brand || "").toLowerCase();
    if (top.length < Math.max(0, window - pinnedRows.length) && b && (perBrand[b] || 0) >= DIVERSITY_PER_BRAND) { held.push(x); continue; }
    if (top.length < Math.max(0, window - pinnedRows.length)) { top.push(x); if (b) perBrand[b] = (perBrand[b] || 0) + 1; } else held.push(x);
  }
  if (vec && top.length >= window - pinnedRows.length && held.length) {
    // swap the lowest-affinity held rows into the last EXPLORE_SLOTS of the window
    const explore = held.filter((x) => x.aff <= 0).slice(0, EXPLORE_SLOTS);
    for (const e of explore) {
      // the victim is the LAST high-affinity row still in the window (a row
      // swapped in a moment ago is low-affinity and must not be swapped out)
      let victim = -1;
      for (let k = top.length - 1; k >= 0; k--) if (top[k].aff > 0) { victim = k; break; }
      if (victim < 0) break;
      const out = top.splice(victim, 1)[0];
      top.push(e); held.splice(held.indexOf(e), 1); held.unshift(out);
    }
  }
  const ordered = [...pinnedRows, ...top, ...held];
  return ordered.map((x, pos) => ({
    ...x.row,
    tasteMoved: !x.pinned && pos !== x.i,
    match: {
      reasons: [x.row.matchReason || "match", ...(!x.pinned && vec && Math.abs(x.aff) > 0.05 ? [x.aff > 0 ? "taste" : "against taste"] : [])],
      source: x.row.source_name || x.row.source || "catalog",
      uncertainty: uncertaintyOf(x.row),
    },
  }));
}
