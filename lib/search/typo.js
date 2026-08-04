// lib/search/typo.js — literal-engine typo bridge (r12).
//
// The brain's compositional tier has had a typo bridge since asterisk-boost
// r2 (lib/brain/index.js) — but it only fires AFTER the literal engine comes
// up empty, so a typo'd garment noun ("sweter", "trousrs") reached the
// garment tables, the title matcher, and the tag layer uncorrected and
// carried zero evidence. This bridge corrects unknown tokens at
// interpretation time so every downstream tier sees the corrected token.
//
// Deliberately conservative, all declared:
//   - only tokens of 5+ chars, letters only;
//   - a token the vocabulary already knows (exact or stem) is NEVER
//     corrected — "shirt" can never become "skirt";
//   - distance budget 1 for 5–8 chars, 2 for 9+;
//   - a tie between two candidates at the same distance corrects nothing
//     (ambiguity is not a license to guess);
//   - every correction is recorded and rides the response
//     (interpreted.typoCorrections) — visible influence, never silent.
//   - SEARCH_TYPO_BRIDGE=0 kills it without a deploy.
//
// Vocabulary: the engine's own garment tables + brain tag names + mapping
// phrase words. Brands are deliberately excluded — brandMatch has its own
// contains-rule, and fuzzy brand hits misfire on short names.

import { distance } from "fastest-levenshtein";
import { TAGS } from "../brain/tags.js";

export function typoBridgeEnabled() {
  return process.env.SEARCH_TYPO_BRIDGE !== "0";
}

/** Build the correction vocabulary for one interpretation pass. */
export function buildTypoVocab({ garmentKeys = [], mappings = [] } = {}) {
  const vocab = new Set(garmentKeys);
  for (const t of TAGS) vocab.add(String(t).toLowerCase());
  for (const m of mappings) {
    for (const w of String(m.searchPhrase || "").split(/\s+/)) if (w.length > 2) vocab.add(w);
    for (const r of m.relatedTerms || []) for (const w of String(r).split(/\s+/)) if (w.length > 2) vocab.add(w);
  }
  return [...vocab];
}

/**
 * Correct unknown tokens against the vocabulary.
 * `isKnown(token)` — caller-supplied check that must cover stem-aware table
 * hits (r11): known tokens are never touched.
 */
export function correctTokens(tokens, vocab, isKnown) {
  if (!typoBridgeEnabled()) return { tokens, corrections: [] };
  const corrections = [];
  const out = tokens.map((t) => {
    if (t.length < 5 || /[^a-z]/.test(t) || isKnown(t) || vocab.includes(t)) return t;
    const budget = t.length >= 9 ? 2 : 1;
    let best = null, bestD = budget + 1, tied = false;
    for (const w of vocab) {
      if (Math.abs(w.length - t.length) > budget) continue;
      const d = distance(t, w);
      if (d < bestD) { best = w; bestD = d; tied = false; }
      else if (d === bestD && w !== best) tied = true;
    }
    if (!best || bestD > budget || tied) return t;
    corrections.push({ from: t, to: best, distance: bestD });
    return best;
  });
  return { tokens: out, corrections };
}
