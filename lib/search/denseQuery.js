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

const GENDER_WORDS = {
  mens: "mens", men: "mens", menswear: "mens",
  womens: "womens", women: "womens", womenswear: "womens",
  unisex: "unisex",
};
const CLIMATE_WORDS = {
  winter: "cold-weather", cold: "cold-weather",
  summer: "warm-weather", warm: "warm-weather",
};

// Lift constraint tokens out of a token stream. Returns the remaining tokens
// (for text/tag scoring) plus structured constraints for pool filtering.
// "under 400" / "below $400" consumes both words; bare numbers stay tokens.
export function parseDenseConstraints(tokens = []) {
  const rest = [];
  const constraints = { gender: null, maxPrice: null, climate: null };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (GENDER_WORDS[t]) { constraints.gender = GENDER_WORDS[t]; continue; }
    if (CLIMATE_WORDS[t]) { constraints.climate = CLIMATE_WORDS[t]; rest.push(t); continue; }
    if ((t === "under" || t === "below") && i + 1 < tokens.length) {
      const n = Number(String(tokens[i + 1]).replace(/^\$/, ""));
      if (Number.isFinite(n) && n > 0) { constraints.maxPrice = n; i++; continue; }
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
// but fails maxPrice (an unpriced item cannot claim to be under a budget).
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
  if (constraints.climate) {
    out = out.filter((it) => {
      const season = it.era && typeof it.era === "object" ? String(it.era.season ?? "").toLowerCase() : "";
      return !season || SEASON_CLIMATE[season] === constraints.climate;
    });
  }
  return out;
}
