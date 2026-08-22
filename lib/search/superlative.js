// lib/search/superlative.js — "cheapest" is a sort, not a word (Aug 22).
//
// THE DEFECT THIS EXISTS FOR (measured on the shipped catalog): price is on
// 915 of 915 items, /api/discover has sorted on it since Day 1, and the
// search engine treated the words that ask for that sort as unmatched text.
//
//   "cheapest jacket"      opened at $970 while the cheapest outerwear is $545
//   "most expensive knit"  opened at $785 while the dearest knit is $980
//   "cheapest boots"       opened at $695 while footwear starts at $195
//
// Every one of them printed `no piece here matches "cheapest"` and served the
// category in relevance order.
//
// WHAT IS AND IS NOT READ. A SUPERLATIVE is a sort over a stored number, so
// it is honoured. A bare ADJECTIVE is not: "cheap", "affordable",
// "expensive", "pricey" need a threshold this catalog cannot justify — its
// cheapest outerwear is $545 — and lib/search/denseQuery.js already declines
// them for that reason. "cheapest" says nothing about a price level; it says
// "put the smallest one first", which is arithmetic on data we hold.
//
// The sort applies to the rack the engine already chose. It never widens the
// rack, never crosses a tier (a compositional or cultural read keeps its
// place), and the note names the sort so nobody mistakes the first row for
// the most relevant one.

const ASC = ["cheapest", "least expensive", "lowest priced", "lowest price"];
const DESC = ["most expensive", "priciest", "dearest", "highest priced", "highest price"];

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Read a price superlative out of the RAW query.
 * @returns {{ tokens: string[], sort: null | { direction: "asc"|"desc", phrase: string, label: string } }}
 */
export function parsePriceSuperlative(query, tokens = []) {
  const q = String(query ?? "").toLowerCase().trim();
  if (!q) return { tokens, sort: null };
  const consume = (phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    const rest = [];
    let i = 0;
    for (const t of tokens) {
      if (i < words.length && String(t).toLowerCase() === words[i]) { i++; continue; }
      rest.push(t);
    }
    return rest;
  };
  const all = [...DESC.map((p) => [p, "desc"]), ...ASC.map((p) => [p, "asc"])]
    .sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, direction] of all) {
    if (!new RegExp(`\\b${esc(phrase)}\\b`).test(q)) continue;
    return {
      tokens: consume(phrase),
      sort: {
        direction, phrase,
        label: direction === "asc" ? "price, lowest first" : "price, highest first",
      },
    };
  }
  return { tokens, sort: null };
}

/**
 * Sort a ranked rack by price WITHIN each tier, so a read never crosses a
 * literal match. An unpriced item sinks — it cannot claim to be the cheapest
 * or the dearest of anything.
 */
export function applyPriceSort(ranked = [], sort = null, tierOf = () => 0) {
  if (!sort) return ranked;
  const dir = sort.direction === "asc" ? 1 : -1;
  const key = (it) => (typeof it.price === "number" ? it.price : null);
  return ranked.slice().sort((a, b) => {
    const t = tierOf(a) - tierOf(b);
    if (t) return t;
    const pa = key(a);
    const pb = key(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return (pa - pb) * dir || String(a.id).localeCompare(String(b.id));
  });
}
