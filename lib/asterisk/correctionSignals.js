// Shared correction semantics for every recommendation surface.
// Persistence aggregates explicit feedback; consumers apply the same weights
// without mutating the stored Alpha brain profile on each read.

import { migrateProfile } from "../brain/index.js";

export const NEGATIVE_CORRECTION_CODES = new Set([
  "not-my-style", "less-like-this", "dont-recommend-silhouette",
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
