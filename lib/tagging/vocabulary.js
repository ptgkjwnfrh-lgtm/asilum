// lib/tagging/vocabulary.js
// ONE VOCABULARY FOR EVERY TAG ON A PIECE.
//
// Owner instruction, 24 August: the tagging system should be advanced and
// COHESIVE. It was neither, and the reason was not that anything was missing —
// it was that four vocabularies had grown up beside each other and nothing
// reconciled them.
//
// What that cost, in one example. `lib/tagging/dense.js` wrote a wool trouser's
// fabric under the facet `material`, at confidence 0.9. The ingest path in
// `lib/ingest/adapters/normalize.js` wrote the same word on the same garment
// under the facet `fabric`, at 0.6. The search weight table knew `material`
// (×1.5) and had never heard of `fabric`, so it fell to the unknown floor
// (×0.3). Same word, same garment: 1.35 one way, 0.18 the other — SEVEN AND A
// HALF TIMES apart, decided by which code path happened to run. Four more
// facets — color, condition, silhouette, subcategory — were in the same
// position: written by one path, unknown to the scorer.
//
// So this module is the single register. A facet is not a string any more; it
// is an entry with a DEFINITION, a WEIGHT and its ALIASES, and:
//
//   * every writer normalises through `facetOf`, so `fabric` becomes
//     `material` at the point of writing rather than at the point of scoring;
//   * the search weight table is DERIVED from here rather than maintained
//     beside it;
//   * a facet nobody defined cannot be written — the database CHECK in v49
//     and the test in tests/tagging-vocabulary.test.js both read this list;
//   * a facet with no definition fails the test, because a tag whose meaning
//     nobody wrote down is a tag nobody can use consistently. That is what
//     "cohesive" has to mean if it is to mean anything.
//
// THE FACETS ARE AXES, NOT A BAG. "black + wool + oversized + 1990s" is four
// facets with one value each, not four words in one pile — which is what makes
// it possible to ask for one and not the others.
//
// HONESTY ABOUT COVERAGE. Some facets are declared and nothing writes them yet
// (`origin`, `subculture`). They are marked `written: false` rather than
// quietly listed, because §5's tagging law says sparse items stay honestly
// sparse and never padded — and a vocabulary that implies coverage it does not
// have is the same lie one level up.

/**
 * @typedef {object} Facet
 * @property {string} means      one sentence: what a value of this facet IS
 * @property {number} weight     how much a hit is worth in search scoring
 * @property {string[]} aliases  names other code has used for the same axis
 * @property {boolean} written   does anything in the tree write it today
 */

/** @type {Record<string, Facet>} */
export const FACETS = Object.freeze({
  // ---- what the piece IS -------------------------------------------------
  garment: {
    means: "the noun a person would use for the piece itself — trouser, parka, knit",
    weight: 1.2, aliases: [], written: true,
  },
  category: {
    means: "the department the garment sits in — outerwear, knitwear, footwear",
    weight: 1, aliases: ["subcategory"], written: true,
  },
  material: {
    means: "what it is made of — wool, cotton, leather, nylon",
    weight: 1.5, aliases: ["fabric"], written: true,
  },
  color: {
    means: "a colour the piece verifiably is, not one the description mentions",
    weight: 1.1, aliases: ["colour"], written: true,
  },
  silhouette: {
    means: "the shape it makes on a body — oversized, cropped, straight-leg",
    weight: 1.1, aliases: [], written: true,
  },
  fit: {
    means: "how it sits relative to the wearer's measurements — relaxed, slim, true-to-size",
    weight: 0.5, aliases: [], written: true,
  },
  condition: {
    means: "the state of the object — new, used, deadstock, repaired",
    weight: 0.7, aliases: [], written: true,
  },

  // ---- where it comes from ----------------------------------------------
  brand: {
    means: "the house whose name the piece carries, which is not always who designed it",
    weight: 0.6, aliases: [], written: true,
  },
  designer: {
    means: "the person who designed it, where that is a different fact from the house",
    weight: 0.6, aliases: [], written: true,
  },
  collection: {
    means: "the specific collection or season code it belongs to",
    weight: 2, aliases: [], written: true,
  },
  origin: {
    means: "the place a piece is OF — a city or a country whose making it belongs to",
    weight: 0.9, aliases: ["city"], written: false,
  },

  // ---- when it is from ---------------------------------------------------
  decade: {
    means: "the decade it is from or refers to — 1990s, 2000s",
    weight: 1, aliases: [], written: true,
  },
  year: {
    means: "a specific year, where the piece is dated that precisely",
    weight: 0.8, aliases: [], written: true,
  },
  season: {
    means: "the season it was made for — SS, AW",
    weight: 0.8, aliases: [], written: true,
  },
  climate: {
    means: "the weather it is for, which is not the same as the season it sold in",
    weight: 0.8, aliases: [], written: true,
  },

  // ---- what it means -----------------------------------------------------
  aesthetic: {
    means: "one of the ten canonical aesthetics the taste vector is expressed in",
    weight: 0.8, aliases: [], written: true,
  },
  "aesthetic-adjacent": {
    means: "an aesthetic reached by affinity rather than stated — WEAKER ON PURPOSE, because it is inferred",
    weight: 0.4, aliases: [], written: true,
  },
  "aesthetic-brand": {
    means: "an aesthetic a house carries as a whole, applied to a piece of theirs",
    weight: 0.5, aliases: [], written: true,
  },
  mood: {
    means: "the feeling a piece carries — sharp, soft, severe — as distinct from the aesthetic it belongs to",
    weight: 0.7, aliases: [], written: false,
  },
  subculture: {
    means: "a named scene or movement the piece belongs to",
    weight: 0.9, aliases: [], written: false,
  },

  // ---- practical facts ---------------------------------------------------
  gender: {
    means: "the department it was merchandised in — a shelf fact, never a claim about who may wear it",
    weight: 0.5, aliases: [], written: true,
  },
  size: {
    means: "the size as printed on the piece",
    weight: 0.3, aliases: [], written: true,
  },
  "size-system": {
    means: "which sizing system that number belongs to — UK, US, IT, JP",
    weight: 0.1, aliases: [], written: true,
  },
  "price-band": {
    means: "the band its price falls in, so a query can ask about level without a number",
    weight: 0.5, aliases: [], written: true,
  },
});

/** Every canonical facet name. */
export const FACET_NAMES = Object.freeze(Object.keys(FACETS));

const ALIAS_TO_FACET = Object.freeze(Object.fromEntries(
  Object.entries(FACETS).flatMap(([name, f]) => [
    [name, name], ...f.aliases.map((a) => [a, name]),
  ]),
));

/**
 * The canonical facet for a name a writer used, or null if nobody defined it.
 *
 * Null is the point. A writer that invents a facet gets nothing back and the
 * tag is dropped at the door rather than landing in the table to be scored at
 * an accidental weight for the rest of its life.
 */
export function facetOf(name) {
  return ALIAS_TO_FACET[String(name || "").trim().toLowerCase()] || null;
}

/** What a hit on this facet is worth in search. Derived, never maintained twice. */
export function facetWeight(name) {
  const facet = facetOf(name);
  return facet ? FACETS[facet].weight : 0;
}

/** The weight table, built from the register rather than kept beside it. */
export const FACET_WEIGHTS = Object.freeze(Object.fromEntries(
  Object.entries(FACETS).map(([name, f]) => [name, f.weight]),
));
