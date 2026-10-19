// lib/search/gender.js — WHO A PIECE IS CUT FOR, READ FROM WHAT THE RECORD SAYS.
//
// MEASURED on the live catalog (20 Sep 2026, 897 eBay listings): 839 rows
// carry size.gender = "unisex" — not because a seller said so, but because
// the size record defaults to it when the adapter supplies nothing — while
// 72 titles say "women's" and 110 say "men's". The gender constraint let
// every "unisex" row through, so "womens under 200" answered with 513
// pieces led by a men's Gore-Tex shell. "womens under 200" is a query a
// real reader typed (search_logs, 22 Aug); the honest rack is the 70-odd
// pieces whose sellers wrote women's.
//
// The reading, in order of who said it:
//   1. an explicit mens / womens on the record — the supplier's word;
//   2. the title — the seller's word: "women's", "womens", "ladies",
//      "femme"; "men's", "mens", "homme" (never inside "women's");
//   3. unisex on the record — kept, but only when the title says nothing,
//      because on a marketplace row it is usually the default, not a fact;
//   4. nothing.
// A title reading is disclosed by the predicate's callers like every other.

import { norm } from "./tokens.js";

const WOMENS = /(^|[^a-z])(women'?s?|womens|ladies|lady'?s|femme|female|girls?)([^a-z]|$)/;
const MENS = /(^|[^a-z])(men'?s?|mens|homme|male|gentlemen'?s|boys?)([^a-z]|$)/;

/** What the seller's title says: "womens" | "mens" | null. Women's wins a
 *  title that names both ("men's & women's") only when men's is absent. */
export function titleGender(title) {
  const t = norm(String(title || "")).replace(/’/g, "'");
  if (!t) return null;
  const w = WOMENS.test(t), m = MENS.test(t);
  if (w && !m) return "womens";
  if (m && !w) return "mens";
  return null; // both, or neither: the title does not decide
}

/** The gender a piece is recorded or titled for. */
export function itemGender(it = {}) {
  const recorded = it?.size && it.size.gender;
  if (recorded === "mens" || recorded === "womens") return recorded;
  const titled = titleGender(it?.title);
  if (titled) return titled;
  return recorded === "unisex" ? "unisex" : null;
}

/** The constraint predicate every gender site shares: an absent reading
 *  passes (never over-filter on absent data), unisex passes, a named gender
 *  must agree. */
export function itemMatchesGender(it, g) {
  const v = itemGender(it);
  return !v || v === g || v === "unisex";
}
