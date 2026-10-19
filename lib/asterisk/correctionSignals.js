// Shared correction semantics for every recommendation surface.
// Persistence aggregates explicit feedback; consumers apply the same weights
// without mutating the stored Alpha brain profile on each read.

import { migrateProfile } from "../brain/index.js";

// A REASON CHANGES ONLY ITS LANE (V.2, 19 Sep 2026). "Too expensive" changes
// price handling; "too small" changes fit; "dislike the finish" changes the
// finish tags and nothing else. Before this, every taste correction carried
// the piece's six dominant tags into the profile, so a reader who said "too
// expensive" would have punished the designer, the material and the
// silhouette for a number. The lane is decided by the code, here, once.
export const REASON_LANES = Object.freeze(Object.assign(Object.create(null), {
  "too-expensive": "price",
  "too-small": "fit", "too-large": "fit",
  "dislike-finish": "finish",
  "not-interested": "item", "already-own": "item",
  "not-my-style": "taste", "less-like-this": "taste", "more-like-this": "taste",
  "dont-recommend-silhouette": "taste",
  "dont-recommend-brand": "brand",
  "right-vibe-wrong-product": "note", "too-literal": "note", "too-abstract": "note",
  "wrong-brand": "data", "wrong-color": "data", "wrong-category": "data",
  "wrong-material": "data", "wrong-era": "data", "wrong-attribution": "data",
}));
export const laneOf = (code) => REASON_LANES[String(code || "")] || "note";

// this item only | this session (24 h) | an ongoing preference
export const CORRECTION_SCOPES = Object.freeze(["item", "session", "ongoing"]);
export const SESSION_SCOPE_MS = 24 * 60 * 60 * 1000;

/** Undone corrections and expired session corrections have no effect. */
export function isCorrectionActive(c, now = Date.now()) {
  if (!c) return false;
  if (c.undoneAt ?? c.undone_at) return false;
  const scope = c.scope || "ongoing";
  if (scope !== "session") return true;
  const at = Number(c.createdAt ?? (c.created_at ? new Date(c.created_at).getTime() : 0)) || 0;
  return now - at < SESSION_SCOPE_MS;
}

const laneTag = (c, prefix) => (c.tags || []).map(String).find((t) => t.startsWith(prefix + ":"))?.slice(prefix.length + 1) ?? null;

/**
 * The price lane: the LOWEST price the reader called too expensive, in
 * minor units, or null. "Item" scope excludes the piece and sets no ceiling.
 */
export function priceCeilingFrom(corrections = [], now = Date.now()) {
  let ceiling = null;
  for (const c of corrections) {
    if (c.code !== "too-expensive" || (c.scope || "ongoing") === "item" || !isCorrectionActive(c, now)) continue;
    const cents = Number(laneTag(c, "price"));
    if (!Number.isFinite(cents) || cents <= 0) continue;
    ceiling = ceiling == null ? cents : Math.min(ceiling, cents);
  }
  return ceiling;
}

/** The fit lane: which brand + category ran small or large for this reader. */
export function fitHintsFrom(corrections = [], now = Date.now()) {
  const out = [];
  for (const c of corrections) {
    if ((c.code !== "too-small" && c.code !== "too-large") || !isCorrectionActive(c, now)) continue;
    out.push({
      direction: c.code === "too-small" ? "runs-small" : "runs-large",
      brand: laneTag(c, "brand") || c.brand || null,
      category: laneTag(c, "category") || null,
      size: laneTag(c, "size") || null,
      productId: c.productId ?? c.product_id ?? null,
      scope: c.scope || "ongoing",
    });
  }
  return out;
}

export const NEGATIVE_CORRECTION_CODES = new Set([
  "not-my-style", "less-like-this", "dont-recommend-silhouette",
  // finish: its snapshot holds ONLY the piece's material/finish tags (see
  // lib/asterisk/explain.js), so the subtraction cannot reach anything else.
  "dislike-finish",
]);
export const PROFILE_SHAPING_CODES = new Set([
  ...NEGATIVE_CORRECTION_CODES, "more-like-this",
]);

const clamp = (value) => Math.max(-1, Math.min(1, value));

/**
 * Fold a reader's explicit corrections into their taste vector.
 *
 * A CORRECTION IS A PROMISE, NOT A HINT. Something the reader pushed away is
 * subtracted, and the adjustment is clamped to [-1, 1] so a burst of
 * corrections cannot invert a profile entirely — the reader is being listened
 * to, not overwritten.
 *
 * Migrates a legacy flat profile on read, so old rows fold in correctly.
 */
export function applyCorrectionSignalsToBrainProfile(profile, summary = {}) {
  const adjusted = migrateProfile(profile);
  for (const signal of summary.signals || []) {
    const tag = String(signal.tag || "").trim().toUpperCase();
    const occurrences = Math.max(0, Number(signal.occurrences) || 0);
    if (!tag || !occurrences) continue;
    const delta = signal.code === "more-like-this"
      ? 0.3 * occurrences
      : NEGATIVE_CORRECTION_CODES.has(signal.code)
        ? -0.4 * occurrences
        : 0;
    if (delta) adjusted.long[tag] = clamp((adjusted.long[tag] || 0) + delta);
  }
  return adjusted;
}
