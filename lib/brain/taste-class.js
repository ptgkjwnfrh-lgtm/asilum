// lib/brain/taste-class.js — ASTERISK's one-word read of a taste profile.
// Client-safe, imports nothing. Each class scores the bearer's REAL
// conviction weights (the 10 canonical TAGS) — the passport's TASTE CLASS
// field is derived, never invented. Weights say how much a tag testifies
// for a class; the top total wins.

export const TASTE_CLASSES = [
  { name: "DARK",         weights: { SEDUCTIVE: 0.7, "AVANT-GARDE": 0.6, STATEMENT: 0.5, ARCHIVAL: 0.3 } },
  { name: "STREET",       weights: { STREETWEAR: 1.0, STATEMENT: 0.4, INDEPENDENT: 0.4 } },
  { name: "ACTIVE",       weights: { GORP: 1.0, UTILITARIAN: 0.7 } },
  { name: "PREPPY",       weights: { TAILORED: 0.8, MINIMAL: 0.4, STREETWEAR: 0.2 } },
  { name: "PROFESSIONAL", weights: { TAILORED: 1.0, MINIMAL: 0.7 } },
  { name: "MINIMALIST",   weights: { MINIMAL: 1.0, TAILORED: 0.4, UTILITARIAN: 0.3 } },
  { name: "ROMANTIC",     weights: { SEDUCTIVE: 1.0, STATEMENT: 0.3, TAILORED: 0.3 } },
  { name: "AVANT",        weights: { "AVANT-GARDE": 1.0, ARCHIVAL: 0.5, INDEPENDENT: 0.5 } },
  { name: "ARCHIVIST",    weights: { ARCHIVAL: 1.0, INDEPENDENT: 0.6, "AVANT-GARDE": 0.4 } },
  { name: "UNDERGROUND",  weights: { INDEPENDENT: 1.0, STREETWEAR: 0.5, "AVANT-GARDE": 0.4 } },
  { name: "TECHNICAL",    weights: { UTILITARIAN: 1.0, GORP: 0.6, MINIMAL: 0.3 } },
  { name: "OPULENT",      weights: { SEDUCTIVE: 0.6, STATEMENT: 0.6, TAILORED: 0.5 } },
];

// pairs: [[TAG, weight], …] straight from the conviction list.
// Returns the winning class name, or "UNCLASSIFIED" when the brain has no
// meaningful signal yet.
export function tasteClass(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return "UNCLASSIFIED";
  let best = null;
  let bestScore = 0;
  for (const cls of TASTE_CLASSES) {
    let score = 0;
    for (const [tag, weight] of pairs) {
      const factor = cls.weights[String(tag).toUpperCase()];
      if (factor) score += factor * Math.abs(Number(weight) || 0);
    }
    if (score > bestScore) { bestScore = score; best = cls.name; }
  }
  return bestScore > 0.05 && best ? best : "UNCLASSIFIED";
}
