// lib/search/wordScope.js — "the word is here, just not there" (Aug 21).
//
// THE DEFECT THIS EXISTS FOR (measured against the shipped catalog):
// asked for "leather coat", the engine served outerwear and said
//
//     no piece here matches "leather" — showing outerwear instead
//
// while TWENTY-EIGHT pieces in the catalog it had just searched carry
// "leather" in their titles — sixteen shoes and twelve bags. The sentence is
// not a lie about the rack, but it is wrong about the catalog, and it is the
// wrong answer to give a person who is holding the word: what they needed to
// hear is that the leather here is footwear and accessories.
//
// Same shape, measured the same way:
//   oversized      19 pieces, ALL tops        — "oversized knit" claimed none
//   deconstructed   6 pieces, ALL tailoring   — "deconstructed coat" claimed none
//   nylon          31 pieces, bottoms + bags
//   mohair         16 pieces, all knitwear
//   wool           15 pieces, all tailoring
// Genuinely absent, where today's sentence is already right: "waxed", "black",
// and every other colour — this catalog has no colour data at all (0/915).
//
// The distinction this module draws is between a word the catalog does not
// have and a word the RACK does not have. Those are different facts and the
// engine could not previously tell them apart.
//
// Deliberately narrow: title pieces only (never brands — "Chrome Hearts" must
// not make "chrome" a material), whole-word with the same plural fold the
// ranker uses, and nothing here changes ranking. Disclosure only.

const piecePartOf = (title) => String(title || "").toLowerCase().replace(/^[^—]+—\s*/, "");

/**
 * word → the set of categories whose titles carry it.
 * Built from the whole discoverable pool, not from the rack being served.
 *
 * Rebuilt per request rather than cached, deliberately. MEASURED: 0.27ms at
 * the catalog's 915 items and 1.06ms at the 5000-item pool cap, and it only
 * runs on the disclosure path. A cache keyed on a pool that ingest can change
 * underneath it would buy a millisecond and risk naming a category that is no
 * longer there.
 */
export function buildTitleWordScope(items = []) {
  const scope = new Map();
  for (const it of items) {
    const cat = it?.category;
    if (!cat) continue;
    for (const raw of piecePartOf(it.title).split(/[^a-z0-9-]+/)) {
      if (raw.length < 3) continue;
      let set = scope.get(raw);
      if (!set) scope.set(raw, (set = new Set()));
      set.add(cat);
    }
  }
  return scope;
}

/**
 * Which categories carry `word`, other than the ones already being shown.
 * Returns [] when the catalog does not have the word at all — the case where
 * the existing sentence is already the true one.
 */
export function categoriesCarrying(word, scope, shownCategories = []) {
  const w = String(word || "").toLowerCase();
  if (!scope || w.length < 3) return [];
  const shown = new Set(shownCategories);
  const found = new Set();
  // Same plural fold the ranker uses: "boots" finds "boot", "berries" is not
  // attempted (the ranker does not attempt it either).
  for (const form of [w, w.endsWith("s") && w.length >= 4 ? w.slice(0, -1) : null]) {
    if (!form) continue;
    for (const cat of scope.get(form) || []) if (!shown.has(cat)) found.add(cat);
  }
  return [...found].sort();
}

/** "footwear and accessories" / "tops" / "bottoms, knitwear and tailoring" */
export function listCategories(cats = []) {
  if (cats.length <= 1) return cats[0] || "";
  if (cats.length === 2) return `${cats[0]} and ${cats[1]}`;
  return `${cats.slice(0, -1).join(", ")} and ${cats[cats.length - 1]}`;
}

/**
 * The clause naming where an unmatched word DOES live, or null when it lives
 * nowhere and the caller's existing sentence is already correct.
 */
export function elsewhereClause(words = [], scope, shownCategories = []) {
  const parts = [];
  for (const w of words) {
    const cats = categoriesCarrying(w, scope, shownCategories);
    if (cats.length) parts.push(`the ${w} here is ${listCategories(cats)}`);
  }
  return parts.length ? parts.join("; ") : null;
}
