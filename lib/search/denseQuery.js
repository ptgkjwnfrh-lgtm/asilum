// Dense-layer query understanding for the search engine (Day 26).
//
// The product_tags layer is typed (dense-v1, Day 25) but the search scoring
// was type-blind: a gender row scored like a material row, and constraint
// words ("womens", "under 400", "winter") polluted text ranking instead of
// narrowing the pool. This module gives search two honest capabilities:
//
//   1. TYPE_WEIGHTS — typed tag-layer scoring (a material hit is worth more
//      than a size-system hit, a collection code most of all).
//   2. parseDenseConstraints — constraint tokens lifted OUT of the scoring
//      stream and applied as pool filters against real item fields.
//
// Pure module: no db imports, unit-testable.

import { looksLikeYearToken } from "./era.js";

export const TYPE_WEIGHTS = {
  collection: 2,
  material: 1.5,
  garment: 1.2,
  category: 1,
  decade: 1,
  aesthetic: 0.8,
  season: 0.8,
  year: 0.8,
  climate: 0.8,
  brand: 0.6,
  designer: 0.6,
  "aesthetic-brand": 0.5,
  gender: 0.5,
  fit: 0.5,
  "price-band": 0.5,
  "aesthetic-adjacent": 0.4,
  size: 0.3,
  "size-system": 0.1,
};

// Collapse a typed score map ({ productId: { tagType: score } }) into the
// scalar layer rankSearchResults already consumes.
export function weighTypedTagScores(typed = {}) {
  const out = {};
  for (const [productId, byType] of Object.entries(typed)) {
    let s = 0;
    for (const [tagType, score] of Object.entries(byType)) {
      s += (TYPE_WEIGHTS[tagType] ?? 0.3) * score;
    }
    if (s > 0) out[productId] = s;
  }
  return out;
}

const GENDER_WORDS = Object.assign(Object.create(null), {
  mens: "mens", men: "mens", menswear: "mens",
  womens: "womens", women: "womens", womenswear: "womens",
  unisex: "unisex",
});
// "warm coat" means an INSULATING coat — a cold-weather garment — but the
// word was mapped to warm-weather and hard-filtered Fall/Winter out of the
// pool, removing 94 of 170 outerwear items (every FW puffer and parka) from
// the exact query that wants them. "cold shoulder top" inverted symmetrically.
// Only the unambiguous season words survive; insulation-vs-season is a
// distinction the catalog cannot currently express.
const CLIMATE_WORDS = Object.assign(Object.create(null), {
  winter: "cold-weather",
  summer: "warm-weather",
});

// Budget language, in the shapes people actually type. Only a phrase that
// resolves to a NUMBER is consumed — a bare "under" or "over" stays a token
// and keeps whatever text meaning it had ("over shirt", "under layer").
//
// Deliberately NOT read: "cheap", "affordable", "expensive", "splurge". Each
// would need a threshold this catalog cannot justify — its cheapest outerwear
// is $545 — and a number invented to make a word work is the kind of claim
// the honesty contract exists to prevent. Numeric ranges only.
// A COUNT IS NOT A BUDGET. Single digits reach the parser now, and "under 3
// items" is a request for three results, not a three-dollar ceiling. The
// nouns that mark a count are a closed list; a number followed by one of them
// is left alone.
const COUNT_NOUNS = new Set(["item", "items", "piece", "pieces", "result", "results",
                             "thing", "things", "option", "options", "look", "looks"]);
// ZERO IS A NUMBER. MEASURED: "under 0" was refused by `n > 0`, and the whole
// budget phrase was silently dropped with it — 715 items came back under `no
// piece here matches "under", "0"`. A zero ceiling is an answerable request
// whose answer is "nothing, and here is the cheapest thing there is".
const amount = (tok) => {
  // An ABSENT token is not zero. Number("") is 0, so accepting a zero
  // endpoint without this guard turned "at least" with nothing after it into
  // a $0 floor — caught by tests/price-range on the first run.
  const raw = String(tok ?? "").replace(/^\$/, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Lift constraint tokens out of a token stream. Returns the remaining tokens
// (for text/tag scoring) plus structured constraints for pool filtering.
// "under 400" / "below $400" consumes both words; bare numbers stay tokens.
export function parseDenseConstraints(tokens = []) {
  const rest = [];
  const constraints = { gender: null, maxPrice: null, minPrice: null, climate: null,
                        // The reader typed the endpoints the other way round.
                        reversedRange: false };
  const setMax = (n) => { constraints.maxPrice = constraints.maxPrice == null ? n : Math.min(constraints.maxPrice, n); };
  const setMin = (n) => { constraints.minPrice = constraints.minPrice == null ? n : Math.max(constraints.minPrice, n); };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (GENDER_WORDS[t]) { constraints.gender = GENDER_WORDS[t]; continue; }
    if (CLIMATE_WORDS[t]) { constraints.climate = CLIMATE_WORDS[t]; rest.push(t); continue; }

    // "between 400 and 800". RANGE RULE: when BOTH endpoints are plausible
    // collection years the phrase is left alone for the era layer — "between
    // 1990 and 2000" is a decade, not a $10 budget band.
    if (t === "between") {
      const lo = amount(tokens[i + 1]);
      const hi = tokens[i + 2] === "and" ? amount(tokens[i + 3]) : null;
      const bothYears = looksLikeYearToken(tokens[i + 1]) && looksLikeYearToken(tokens[i + 3]);
      if (lo != null && hi != null && !bothYears) {
        if (lo > hi) constraints.reversedRange = true;
        setMin(Math.min(lo, hi)); setMax(Math.max(lo, hi)); i += 3; continue;
      }
    }
    // "400 to 800"
    const here = amount(t);
    if (here != null && tokens[i + 1] === "to") {
      const hi = amount(tokens[i + 2]);
      const bothYears = looksLikeYearToken(t) && looksLikeYearToken(tokens[i + 2]);
      if (hi != null && !bothYears) {
        if (here > hi) constraints.reversedRange = true;
        setMin(Math.min(here, hi)); setMax(Math.max(here, hi)); i += 2; continue;
      }
    }
    // "under 400" / "below 400" / "up to 400" / "less than 400" / "at most 400"
    if (t === "under" || t === "below") {
      const n = amount(tokens[i + 1]);
      if (n != null && !COUNT_NOUNS.has(String(tokens[i + 2] ?? "").toLowerCase())) {
        setMax(n); i++; continue;
      }
    }
    if ((t === "up" && tokens[i + 1] === "to") || (t === "less" && tokens[i + 1] === "than") ||
        (t === "at" && tokens[i + 1] === "most")) {
      const n = amount(tokens[i + 2]);
      if (n != null) { setMax(n); i += 2; continue; }
    }
    // "over 2000" / "above 2000" / "more than 2000" / "at least 2000"
    if (t === "over" || t === "above") {
      const n = amount(tokens[i + 1]);
      if (n != null && !COUNT_NOUNS.has(String(tokens[i + 2] ?? "").toLowerCase())) {
        setMin(n); i++; continue;
      }
    }
    if ((t === "more" && tokens[i + 1] === "than") || (t === "at" && tokens[i + 1] === "least")) {
      const n = amount(tokens[i + 2]);
      if (n != null) { setMin(n); i += 2; continue; }
    }
    rest.push(t);
  }
  return { tokens: rest, constraints };
}

const SEASON_CLIMATE = {
  "fall/winter": "cold-weather", "pre-fall": "cold-weather",
  "spring/summer": "warm-weather", "resort": "warm-weather",
};

// Apply parsed constraints against REAL item fields (never tag rows): gender
// from size.gender, price from price, climate from era.season. An item
// missing the field passes gender/climate (don't over-filter on absent data)
// but fails maxPrice/minPrice (an unpriced item cannot claim to be under a
// budget, and cannot claim to clear a floor either).
export function applyDenseConstraints(items = [], constraints = {}) {
  let out = items;
  if (constraints.gender) {
    out = out.filter((it) => {
      const g = it.size && it.size.gender;
      return !g || g === constraints.gender || g === "unisex";
    });
  }
  if (constraints.maxPrice != null) {
    out = out.filter((it) => typeof it.price === "number" && it.price <= constraints.maxPrice);
  }
  if (constraints.minPrice != null) {
    out = out.filter((it) => typeof it.price === "number" && it.price >= constraints.minPrice);
  }
  if (constraints.climate) {
    out = out.filter((it) => {
      const season = it.era && typeof it.era === "object" ? String(it.era.season ?? "").toLowerCase() : "";
      return !season || SEASON_CLIMATE[season] === constraints.climate;
    });
  }
  return out;
}
