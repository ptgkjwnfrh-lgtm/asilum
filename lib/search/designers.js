// lib/search/designers.js — the people, not just the houses (Aug 21).
//
// THE GAP THIS EXISTS FOR (measured on the shipped catalog): every item
// carries `designers[]`, 915/915 populated, 93 distinct names, and 523 items
// credit somebody who is NOT the label on the piece. The search engine read
// the field nowhere — its only appearance in lib/search was a comment.
//
//   "jun takahashi"   ZERO results, while 16 Undercover items name him
//   "rei kawakubo"    681 items via the cultural tier, opening on JW
//                     Anderson, while 14 Comme des Garçons pieces carry her
//                     name as a stored field
//   "virgil abloh"    790 items via the cultural tier, while 36 pieces across
//                     Off-White AND Louis Vuitton credit him
//   "kim jones"       617 items of lexicon guess; 37 pieces across Fendi and
//                     Dior Men credit him
//   "demna jacket"    170 outerwear under `no piece here matches "demna"`,
//                     while 12 Balenciaga pieces credit Demna
//
// The field answers something no brand match can: a person moves, and their
// work is split across houses. Miuccia Prada is 28 pieces across Miu Miu and
// Prada; Kim Jones is 37 across Fendi and Dior Men; Grace Wales Bonner is 23
// across her own label and Adidas Originals.
//
// DECLARED DECISIONS:
//
//   * WHOLE PHRASE, NEVER SUBSTRING. This is the Aug 5 word-boundary lesson
//     with higher stakes: "rose" must not claim Martine Rose, "jones" must
//     not claim Kim Jones, "green" must not claim Craig Green. A span of the
//     query must EQUAL a stored name.
//   * A BRAND OUTRANKS A CREDIT. When the query already resolved to a house
//     — exactly, partially, or by spelling — that reading stands and this
//     module does not run. "Lemaire" is a house; Christophe Lemaire is a
//     person; the house is what was asked for.
//   * A CREDIT IS AN ATTRIBUTION, NOT A TENURE CLAIM. The catalog stores no
//     tenure dates, so neither the note nor the label may imply the piece was
//     made while that person was at that house. The sentence says "credits",
//     and says how many and where.
//   * A STORED ATTRIBUTION OUTRANKS AN INTERPRETATION. "rei kawakubo" is both
//     a name in this field and a curated culture entity. Fourteen pieces
//     actually credited to her beat 681 pieces in an anti-fashion vibe, and
//     the note names which reading was used.
//   * An item with no `designers` entry cannot pass — unknown is never a
//     quiet yes, the same rule the budget floor and the era window use.

import { foldNorm } from "./text.js";

// A name reduced to the same shape the tokenizer produces: accent-folded and
// split on every non-alphanumeric. Without it "Sarah-Linh Tran" could never
// match, because the query arrives as three tokens and the stored name keeps
// its hyphen — the name was in the vocabulary and unreachable.
const nameKey = (d) => foldNorm(d).split(/[^a-z0-9]+/).filter(Boolean).join(" ");

/**
 * Distinct designer names present in a pool, in catalog spelling.
 *
 * `excludeBrands` drops every name a HOUSE already answers to — that is the
 * "a brand outranks a credit" rule applied to the vocabulary itself rather
 * than to one query. MEASURED (vibe sweep, run 1 of this change): without it,
 * "willy chavarria varsity jacket" and 52 other designer-piece queries had
 * their top row relabelled "designer credit", because the label is also a
 * person in this field, and the credit's weight buried the product-name match
 * the reader actually wanted. Thirty of the 93 names are houses.
 */
export function listDesigners(items = [], { excludeBrands = [] } = {}) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandForms = excludeBrands.map((b) => nameKey(b)).filter(Boolean);
  const isHouse = (name) =>
    brandForms.some((b) => b === name || new RegExp("\\b" + esc(name) + "\\b").test(b));
  const byFolded = new Map();
  for (const it of items) {
    for (const d of it?.designers || []) {
      const key = nameKey(d);
      if (!key || byFolded.has(key) || isHouse(key)) continue;
      byFolded.set(key, d);
    }
  }
  return [...byFolded.values()];
}

/**
 * Find the longest contiguous span of the token stream that EQUALS a stored
 * designer name. Longest-first so "kim jones" wins over any single token, and
 * so a two-word name is never split.
 *
 * @returns {null | { designer: string, words: string[], tokens: string[] }}
 *          `tokens` is the remaining stream with the span removed.
 */
export function parseDesignerCredit(tokens = [], designers = []) {
  if (!tokens.length || !designers.length) return null;
  const byName = new Map(designers.map((d) => [nameKey(d), d]));
  for (let len = Math.min(tokens.length, 5); len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const span = tokens.slice(i, i + len);
      const name = byName.get(span.join(" "));
      if (!name) continue;
      // A single-token name is only accepted when it IS the whole name —
      // which byName already guarantees — never as a fragment of a longer one.
      return {
        designer: name,
        words: span,
        tokens: [...tokens.slice(0, i), ...tokens.slice(i + len)],
      };
    }
  }
  return null;
}

export function itemCreditsDesigner(item, designer) {
  if (!designer) return true;
  const want = nameKey(designer);
  return (item?.designers || []).some((d) => nameKey(d) === want);
}

export function applyDesignerCredit(items = [], designer = null) {
  if (!designer) return items;
  return items.filter((it) => itemCreditsDesigner(it, designer));
}

/** Which houses in a pool credit this person, and how many pieces. */
export function creditFootprint(items = [], designer) {
  const houses = new Map();
  let count = 0;
  for (const it of items) {
    if (!itemCreditsDesigner(it, designer)) continue;
    count++;
    if (it.brand) houses.set(it.brand, (houses.get(it.brand) || 0) + 1);
  }
  return {
    count,
    houses: [...houses.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h),
  };
}

/** The sentence. Names the person, the count and the houses — nothing else. */
export function creditNote(designer, footprint) {
  if (!designer) return null;
  if (!footprint || !footprint.count) return `nothing here credits ${designer}`;
  const where = footprint.houses.length
    ? ` at ${footprint.houses.slice(0, 3).join(" and ")}`
    : "";
  const n = footprint.count;
  return `reading "${designer}" as a designer credit — ${n} piece${n === 1 ? "" : "s"}${where}`;
}
