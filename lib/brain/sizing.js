// lib/brain/sizing.js
// Asilum "size brain" — a normalization layer that maps any labeled size
// (mens / womens / luxury numeric) onto a common "fits like US __" scale,
// and models garment measurements per category so the feed, stylist, and
// ingestion can reason about fit rather than trusting a raw tag. A piece may
// say "IT 46" but the size brain resolves it to "fits like US M" using
// brand + category consensus.
//
// Nothing here talks to a server. The user's own measurements live client-side.

// ---- Canonical fit scale (ordinal) --------------------------------------
export const FIT_LADDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export function fitIndex(f) {
  const i = FIT_LADDER.indexOf(String(f || "").toUpperCase());
  return i === -1 ? null : i;
}
export function fitFromIndex(i) {
  if (i == null) return null;
  const c = Math.max(0, Math.min(FIT_LADDER.length - 1, Math.round(i)));
  return FIT_LADDER[c];
}

// ---- Numeric size systems -> US alpha ------------------------------------
const MENS_TOP = {
  42: "XXS", 44: "XS", 46: "S", 48: "M", 50: "L", 52: "XL", 54: "XXL", 56: "XXXL",
};
const WOMENS_IT = {
  36: "XXS", 38: "XS", 40: "S", 42: "M", 44: "L", 46: "XL", 48: "XXL",
};
const WOMENS_FR = {
  32: "XXS", 34: "XS", 36: "S", 38: "M", 40: "L", 42: "XL", 44: "XXL",
};
const WOMENS_US_NUM = {
  0: "XXS", 2: "XS", 4: "S", 6: "S", 8: "M", 10: "M", 12: "L", 14: "XL", 16: "XXL",
};
const WAIST_IN = [
  [28, "XS"], [30, "S"], [32, "M"], [34, "L"], [36, "XL"], [38, "XXL"], [40, "XXXL"],
];
const JP_MENS = { 1: "XS", 2: "S", 3: "M", 4: "L", 5: "XL" };
const WOMENS_UK = { 4: "XXS", 6: "XS", 8: "S", 10: "M", 12: "L", 14: "XL", 16: "XXL" };
const ALPHA = { XXS:"XXS", XS:"XS", S:"S", M:"M", L:"L", XL:"XL", XXL:"XXL", "2XL":"XXL", XXXL:"XXXL", "3XL":"XXXL", OS:"M", "ONE SIZE":"M" };

// ---- Brand fit bias -------------------------------------------------------
const BRAND_BIAS = {
  "Saint Laurent": +1, "Hedi Slimane": +1, "Celine": +1, "Dior": +1, "Dior Men": +1,
  "Balenciaga": -1, "Vetements": -1, "Rick Owens": +0, "Comme des Garçons": +1,
  "Junya Watanabe": +1, "Yohji Yamamoto": -1, "Maison Margiela": +0,
  "Bode": -1, "Supreme": +0, "Stone Island": +1, "Arc'teryx": +0, "Salomon": +1,
  "The Row": +0, "Prada": +1, "Miu Miu": +1, "Loewe": +0, "Bottega Veneta": +0,
  "Kapital": -1, "Visvim": +1, "Kaptain Sunshine": +1, "Aimé Leon Dore": +0,
  "Fear of God": -1, "ERL": -1, "Acne Studios": +0, "Our Legacy": +0,
  "Jil Sander": +1, "Lemaire": -1, "Sacai": +0, "Undercover": +1,
};

export function toUSAlpha(rawLabel, gender, category) {
  if (rawLabel == null) return null;
  let s = String(rawLabel).trim().toUpperCase();
  const sys = (s.match(/^(IT|EU|FR|UK|US|JP|W|M)\b/) || [])[1] || null;
  const numMatch = s.replace(/[^0-9.]/g, "");
  const alphaMatch = s.replace(/[^A-Z]/g, "");
  if (alphaMatch && ALPHA[alphaMatch] && !numMatch) return ALPHA[alphaMatch];
  const n = parseFloat(numMatch);
  const isBottom = /bottom|pant|trouser|jean|short|denim/i.test(category || "");
  if (!isNaN(n)) {
    if (isBottom && n >= 26 && n <= 44) {
      let out = "XXXL";
      for (const [w, a] of WAIST_IN) { if (n <= w) { out = a; break; } }
      return out;
    }
    if (sys === "FR" && WOMENS_FR[n]) return WOMENS_FR[n];
    if (sys === "UK" && WOMENS_UK[n]) return WOMENS_UK[n];
    if (sys === "JP" && JP_MENS[n]) return JP_MENS[n];
    if ((gender === "womens") && WOMENS_IT[n]) return WOMENS_IT[n];
    if ((gender === "womens") && WOMENS_US_NUM[n]) return WOMENS_US_NUM[n];
    if (MENS_TOP[n]) return MENS_TOP[n];
    if (WOMENS_IT[n]) return WOMENS_IT[n];
    if (WOMENS_US_NUM[n]) return WOMENS_US_NUM[n];
  }
  if (alphaMatch && ALPHA[alphaMatch]) return ALPHA[alphaMatch];
  return null;
}

export function fitsLikeUS(rawLabel, opts = {}) {
  const { brand, gender, category } = opts;
  const base = toUSAlpha(rawLabel, gender, category);
  const bi = fitIndex(base);
  if (bi == null) return { fitsLike: null, base: base, bias: 0 };
  const bias = BRAND_BIAS[brand] || 0;
  const adj = fitFromIndex(bi - bias);
  return { fitsLike: adj, base, bias };
}

// ---- Garment measurement model (inches) ----------------------------------
const BODY_BASE = {
  tops:        { chest: 42, waist: 40, shoulder: 18.5, length: 28 },
  knitwear:    { chest: 44, waist: 42, shoulder: 19,   length: 27 },
  outerwear:   { chest: 46, waist: 44, shoulder: 19.5, length: 30 },
  tailoring:   { chest: 42, waist: 38, shoulder: 18,   length: 30 },
  dresses:     { chest: 36, waist: 30, shoulder: 15,   length: 38 },
  bottoms:     { chest: 0,  waist: 32, shoulder: 0,    length: 41 },
  footwear:    null,
  accessories: null,
};
const STEP = { chest: 2, waist: 2, shoulder: 0.6, length: 1 };

export function measurementsFor(category, usAlpha) {
  const base = BODY_BASE[category];
  if (!base) return null;
  const idx = fitIndex(usAlpha);
  const mIdx = fitIndex("M");
  if (idx == null) return { ...base };
  const d = idx - mIdx;
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = base[k] ? +(base[k] + d * STEP[k]).toFixed(1) : 0;
  }
  return out;
}

export function sizeRecord(rawLabel, opts = {}) {
  const { fitsLike, base, bias } = fitsLikeUS(rawLabel, opts);
  const m = measurementsFor(opts.category, fitsLike || base);
  return {
    label: rawLabel,
    system: opts.system || null,
    gender: opts.gender || null,
    fitsLikeUS: fitsLike,
    runsBias: bias,
    measurements: m,
  };
}

// ---- User fit scoring -----------------------------------------------------
export function fitScore(sizeRec, profile) {
  if (!sizeRec || !profile) return 0.5;
  let alphaScore = 0.5;
  const target = fitIndex(profile.usualSize);
  const got = fitIndex(sizeRec.fitsLikeUS);
  if (target != null && got != null) {
    const dist = Math.abs(target - got);
    alphaScore = Math.max(0, 1 - dist * 0.34);
  }
  let measScore = null;
  const bm = profile.measurements || {};
  const gm = sizeRec.measurements || {};
  const key = gm.chest ? "chest" : (gm.waist ? "waist" : null);
  if (key && bm[key] && gm[key]) {
    const ease = gm[key] - bm[key];
    const ideal = key === "chest" ? 4 : 1;
    measScore = Math.max(0, 1 - Math.abs(ease - ideal) / 8);
  }
  if (measScore == null) return alphaScore;
  return +(alphaScore * 0.5 + measScore * 0.5).toFixed(3);
}

export function fitPhrase(sizeRec, profile) {
  if (!sizeRec || !sizeRec.fitsLikeUS) return null;
  const base = "fits like US " + sizeRec.fitsLikeUS;
  if (!profile || !profile.usualSize) {
    if (sizeRec.runsBias > 0) return base + " · runs small";
    if (sizeRec.runsBias < 0) return base + " · runs large";
    return base;
  }
  const t = fitIndex(profile.usualSize);
  const g = fitIndex(sizeRec.fitsLikeUS);
  if (t == null || g == null) return base;
  const d = g - t;
  if (d === 0) return base + " · your size";
  if (d === 1) return base + " · a touch roomy";
  if (d === -1) return base + " · a touch snug";
  if (d > 1) return base + " · oversized on you";
  return base + " · runs small on you";
}
