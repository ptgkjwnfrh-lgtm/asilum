// lib/search/origin.js — origin comprehension for the search engine (Aug 21).
//
// THE GAP THIS EXISTS FOR (measured, scripts/measure-attribute-reading.mjs):
// 36 of 36 origin probes browsed. "japanese coat" served the whole outerwear
// rack — every row labelled "category browse", the top four Willy Chavarria,
// Bode, Supreme and Miu Miu — and disclosed `no piece here matches
// "japanese"`, while twelve Japanese houses sat in the catalog it was
// searching.
//
// The knowledge lives in lib/asterisk/houses.js, curated and provenance-
// stamped. This module is the query half: which words name an origin, and
// what happens to a rack when one does.
//
// It behaves exactly like the era layer, for the same reason — an origin is a
// checkable property of a piece, not a mood:
//   * the word is lifted OUT of the scoring stream and applied as a filter;
//   * a house this catalog knows nothing about cannot pass ("unknown" is not
//     a quiet yes);
//   * a filter that empties the rack is DROPPED, the query is re-read without
//     it, and both halves are said out loud.
//
// DECLARED DECISIONS:
//   * A demonym is read as the HOUSE's base, never as a look. "french" does
//     not mean French-girl style and "japanese" does not mean Japanese
//     workwear — those are aesthetics, and the culture catalog and the
//     mapping table own them. Both still run: "japanese denim" filters to
//     Japanese houses AND expands through its existing craft mapping.
//   * "scandinavian" and "nordic" are groups, not countries, and resolve to
//     the set. "european" and "asian" are NOT read: a continent is too coarse
//     to be an answer anyone wanted, and reading it would quietly halve a
//     rack on a word the user meant loosely.
//   * The country nouns ("japan", "italy") read the same as their demonyms.
//     A person typing "japan coat" means the same thing.

import { houseIsFrom, houseOrigin } from "../asterisk/houses.js";

// word → the country or countries it names. One table, so the vocabulary and
// the mapping cannot drift apart.
const ORIGIN_TERMS = Object.assign(Object.create(null), {
  japanese: ["Japan"], japan: ["Japan"],
  belgian: ["Belgium"], belgium: ["Belgium"],
  italian: ["Italy"], italy: ["Italy"],
  french: ["France"], france: ["France"],
  american: ["United States"], america: ["United States"], usa: ["United States"],
  british: ["United Kingdom"], english: ["United Kingdom"], uk: ["United Kingdom"],
  britain: ["United Kingdom"], london: ["United Kingdom"],
  swedish: ["Sweden"], sweden: ["Sweden"],
  german: ["Germany"], germany: ["Germany"],
  spanish: ["Spain"], spain: ["Spain"],
  swiss: ["Switzerland"], switzerland: ["Switzerland"],
  austrian: ["Austria"], austria: ["Austria"],
  canadian: ["Canada"], canada: ["Canada"],
  scandinavian: ["Sweden", "Denmark", "Norway"],
  nordic: ["Sweden", "Denmark", "Norway", "Finland", "Iceland"],
  // Origins this catalog holds no house from. They are here ON PURPOSE:
  // knowing that "korean" names an origin and that there is none here is
  // strictly more than not knowing the word. The reader gets "no korean
  // houses in this catalog — showing outerwear instead" rather than the
  // blank `no piece here matches "korean"`, and the day a Korean house is
  // ingested the query starts working with no code change.
  korean: ["South Korea"], chinese: ["China"], dutch: ["Netherlands"],
  danish: ["Denmark"], denmark: ["Denmark"], norwegian: ["Norway"],
  finnish: ["Finland"], portuguese: ["Portugal"], brazilian: ["Brazil"],
  australian: ["Australia"], irish: ["Ireland"], scottish: ["Scotland"],
  polish: ["Poland"], russian: ["Russia"], turkish: ["Turkey"],
  indian: ["India"], mexican: ["Mexico"], greek: ["Greece"],
  argentine: ["Argentina"], nigerian: ["Nigeria"],
});

// Every word this module reads — the typo bridge must not rewrite one.
export const ORIGIN_WORDS = new Set(Object.keys(ORIGIN_TERMS));

// A demonym that is also a city name reads as the country when it stands
// alone, but "london" is a real place a piece can be about, and the culture
// catalog has entities for cities. Keep the city words out of the filter and
// leave them to the cultural tier, which serves them well already.
const CITY_WORDS = new Set(["london"]);

/**
 * Lift origin language out of a token stream.
 * @returns {{ tokens: string[], origin: null | { countries: string[], label: string, words: string[] } }}
 */
export function parseOriginConstraint(tokens = []) {
  const rest = [];
  const words = [];
  const countries = new Set();
  let label = null;
  for (const raw of tokens) {
    const t = String(raw || "").toLowerCase();
    const hit = CITY_WORDS.has(t) ? null : ORIGIN_TERMS[t];
    if (!hit) { rest.push(t); continue; }
    for (const c of hit) countries.add(c);
    words.push(t);
    label = label ? `${label} / ${t}` : t;
  }
  if (!countries.size) return { tokens: rest, origin: null };
  return { tokens: rest, origin: { countries: [...countries], label, words } };
}

/** Does this piece satisfy an origin constraint? A NULL CONSTRAINT MATCHES
 *  EVERYTHING — "no constraint" must never filter the shelf to nothing. */
export function itemMatchesOrigin(item, origin) {
  if (!origin) return true;
  return houseIsFrom(item?.brand, new Set(origin.countries));
}

/** Filter a pool by house origin. A FILTER, NOT A SCORE — an origin the reader
 *  asked for is a requirement, and a strong enough match must not be able to
 *  outweigh it. Returns the input untouched when there is no constraint. */
export function applyOriginConstraint(items = [], origin = null) {
  if (!origin) return items;
  const want = new Set(origin.countries);
  return items.filter((it) => houseIsFrom(it?.brand, want));
}

/**
 * The sentence for an origin this catalog cannot serve. Names a house it DOES
 * hold from that country when there is one — the difference between "we have
 * nothing Japanese" and "we have nothing Japanese in footwear".
 */
export function originMissNote(origin, scope = [], scopeLabel = null, { fellBack = false } = {}) {
  if (!origin) return null;
  const where = scopeLabel ? ` in ${scopeLabel}` : "";
  const instead = fellBack ? (scopeLabel ? ` — showing ${scopeLabel} instead` : " — showing everything instead") : "";
  const elsewhere = [...new Set(
    scope.map((it) => it?.brand).filter((b) => houseIsFrom(b, new Set(origin.countries)))
  )];
  if (elsewhere.length) {
    return `no ${origin.label} pieces${where} — ${elsewhere.slice(0, 2).join(" and ")} are here in other categories${instead}`;
  }
  return `no ${origin.label} houses in this catalog${instead}`;
}

export { houseOrigin };
