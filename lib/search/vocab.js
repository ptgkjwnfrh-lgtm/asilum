// lib/search/vocab.js — stem-indexed token lookup (r11).
//
// The engine's plural handling was a strip-trailing-s heuristic, which covers
// "tees"→"tee" but misses the reverse direction and real inflections:
// "trouser" (table key is "trousers"), "sneaker" ("sneakers"), "loafer",
// "cargo" ("cargos") all fell through the garment tables. Porter stemming
// (words/stemmer, MIT, zero-dep, deterministic) indexes each table by the
// stems of its OWN keys at module load; a query token looks up exact-first,
// stem-second. Exact keys always win stem collisions, and stems are an
// internal index only — never displayed, never stored.

import { stemmer } from "stemmer";

/** Build a lookup: every table key maps exactly; each key's stem maps too
 * unless a real key (or an earlier key's stem) already claimed it. */
export function buildStemIndex(table) {
  const idx = new Map(Object.entries(table));
  for (const [key, value] of Object.entries(table)) {
    const s = stemmer(key);
    if (!idx.has(s)) idx.set(s, value);
  }
  return idx;
}

// Porter stems -ed/-ing verb and adjective forms onto noun keys, which turned
// MODIFIERS into decisive garment/category evidence (measured Aug 5:
// coated→outerwear via "coat", knitted→knitwear, dressed/dressing→dresses,
// belted→accessories, tight→bottoms via "tights", suiting→tailoring). The
// stem index exists for NOUN INFLECTIONS ("trouser"→"trousers"), so only
// those forms may resolve: the token must be the key modulo a plural/simple
// noun ending. An -ed/-ing form never resolves through a stem.
const INFLECTION_BLOCK = /(ed|ing)$/;

function stemResolvable(token) {
  return !INFLECTION_BLOCK.test(token);
}

/** Exact-first, stem-second token lookup against a buildStemIndex map.
 * Irregular -ves plurals ("scarves") sit outside Porter's reach — they fall
 * back to the -f singular before giving up. */
export function lookupToken(idx, token) {
  const exact = idx.get(token);
  if (exact !== undefined) return exact;
  if (!stemResolvable(token)) return undefined;
  const stemmed = idx.get(stemmer(token));
  if (stemmed !== undefined) return stemmed;
  if (token.endsWith("ves")) {
    const f = token.slice(0, -3) + "f";
    return idx.get(f) ?? idx.get(stemmer(f));
  }
  return undefined;
}
