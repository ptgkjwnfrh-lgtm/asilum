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

/** Exact-first, stem-second token lookup against a buildStemIndex map.
 * Irregular -ves plurals ("scarves") sit outside Porter's reach — they fall
 * back to the -f singular before giving up. */
export function lookupToken(idx, token) {
  const exact = idx.get(token);
  if (exact !== undefined) return exact;
  const stemmed = idx.get(stemmer(token));
  if (stemmed !== undefined) return stemmed;
  if (token.endsWith("ves")) {
    const f = token.slice(0, -3) + "f";
    return idx.get(f) ?? idx.get(stemmer(f));
  }
  return undefined;
}
