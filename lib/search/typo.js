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
import { CULTURE } from "../asterisk/culture.js";
import { CATALOG } from "../ingest/catalog.js";
import { ERA_WORDS } from "./era.js";

// Culture vocabulary (Aug 5): every word of every entity name and alias.
// The bridge was rewriting proper nouns in cultural queries — drake→drape,
// diana→piana, baker→biker, light (academia)→night, french (new wave)→trench
// — 42 corruptions across a 1169-query sweep. A word that appears in ANY
// known cultural reference is real vocabulary, not a typo. Built once, lazily
// (the culture catalog is load-time frozen, so this is deterministic).
// The catalog's own title and brand words are real by definition — the
// bridge was rewriting "liner" (padded liner jacket, an actual product) to
// "linen" and "hiker" (GORE-TEX hiker) to "biker", corrupting searches for
// exact product names. Built once from the frozen catalog.
let CATALOG_WORDS = null;
function catalogWords() {
  if (CATALOG_WORDS) return CATALOG_WORDS;
  const w = new Set();
  for (const it of CATALOG) {
    for (const src of [it.title, it.brand]) {
      for (const t of String(src || "").toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 2) w.add(t);
    }
  }
  return (CATALOG_WORDS = w);
}

let CULTURE_WORDS = null;
function cultureWords() {
  if (CULTURE_WORDS) return CULTURE_WORDS;
  const w = new Set();
  for (const e of CULTURE) {
    for (const key of [e.name, ...(e.aliases || [])]) {
      for (const t of String(key).toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 2) w.add(t);
    }
  }
  return (CULTURE_WORDS = w);
}

// Real fashion vocabulary the bridge must NEVER "correct" (measured Aug 5:
// each of these is a live word that sat within edit-distance 1 of a table key
// and was silently rewritten — plaid→plain, shift→shirt, smock→sock,
// gauze→gauge, lined→linen, frill→drill). r13's landmine list is included
// wholesale: those words are deliberately absent from the garment tables, so
// isKnown() cannot protect them. A bridge that rewrites correct queries is
// worse than no bridge — this is the declared stoplist, not a heuristic.
const NEVER_CORRECT = new Set([
  // r13 landmines (deliberately not garment keys)
  "shift", "smock", "sheath", "halter", "jumper", "robe", "parts",
  // materials, weaves, finishes
  "plaid", "gauze", "lined", "linen", "suede", "sued", "tweed", "denim",
  "cotton", "nylon", "rayon", "modal", "crepe", "voile", "twill", "satin",
  "velvet", "shear", "sheer", "waxed", "washed", "faded", "brushed",
  // construction / silhouette words
  "frill", "flare", "flared", "pleat", "pleated", "ruche", "ruched",
  "drape", "draped", "cinch", "cinched", "raglan", "dolman", "empire",
  // common produce nouns a fashion search may use as a vibe word
  "grape", "peach", "cherry", "lemon", "mango", "melon", "berry", "apple",
  // colors
  "black", "white", "cream", "beige", "brown", "green", "olive", "khaki",
  "navy", "teal", "coral", "taupe", "camel", "ivory", "stone", "slate",
]);

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
export function isProtectedWord(token) {
  const t = String(token).toLowerCase();
  return NEVER_CORRECT.has(t) || ERA_WORDS.has(t) || cultureWords().has(t) || catalogWords().has(t);
}

export function correctTokens(tokens, vocab, isKnown) {
  if (!typoBridgeEnabled()) return { tokens, corrections: [] };
  const corrections = [];
  const out = tokens.map((t) => {
    if (t.length < 5 || /[^a-z]/.test(t) || isKnown(t) || vocab.includes(t)) return t;
    if (isProtectedWord(t)) return t;
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
