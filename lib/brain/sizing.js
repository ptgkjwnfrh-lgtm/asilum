// lib/brain/sizing.js
// Asilum "size brain" — a normalization layer that maps any labeled size
// (mens / womens / luxury numeric) onto a common "fits like US __" scale,
// and models garment measurements per category so the feed, stylist, and
// ingestion can reason about fit rather than trusting a raw tag. A piece may
// say "IT 46" but the size brain resolves it to "fits like US M" using
// brand + category consensus.
//
// Nothing here talks to a server. Callers provide the user's private profile.

// ---- Canonical fit scale (ordinal) --------------------------------------
export const FIT_LADDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** A fit label's position on FIT_LADDER, or null if it is not on the ladder.
 *  The ordinal is what makes "one size apart" a computable distance. */
export function fitIndex(f) {
  const i = FIT_LADDER.indexOf(String(f || "").toUpperCase());
  return i === -1 ? null : i;
}
/** The inverse of fitIndex. CLAMPS rather than returning null, so arithmetic
 *  that runs off either end of the ladder lands on XXS or XXXL instead of
 *  producing a size that does not exist. */
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

/**
 * Any printed size label -> a US alpha size, or null.
 *
 * Handles IT/EU/FR/UK/US/JP numeric systems, waist-inch bottoms and plain
 * alpha labels. THE SAME NUMBER MEANS DIFFERENT SIZES IN DIFFERENT SYSTEMS —
 * "46" is a small in menswear and an XL in womenswear IT — which is why
 * `gender` and `category` are read and not optional decoration.
 *
 * Null means "we could not read this label", and callers must treat it as
 * unknown rather than guessing a middle size. This is the LABEL only; brand
 * bias is applied by fitsLikeUS.
 */
export function toUSAlpha(rawLabel, gender, category) {
  if (rawLabel == null) return null;
  let s = String(rawLabel).trim().toUpperCase();
  const sys = (s.match(/^(IT|EU|FR|UK|US|JP|W|M)\b/) || [])[1] || null;
  // WHAT WAS WRONG (Aug 8, codebase audit). The ALPHA table carries correct
  // entries for "2XL", "3XL" and "ONE SIZE" that were UNREACHABLE, because
  // every lookup key was derived by stripping the label:
  //   alphaMatch = s.replace(/[^A-Z]/g,"")  ->  "2XL" becomes "XL", "ONE SIZE"
  //   becomes "ONESIZE" (no space, so it misses the "ONE SIZE" key)
  // and the `!numMatch` guard below then refused the lookup entirely for
  // anything containing a digit.
  //
  // So the digit fell through to the NUMERIC path and was read as a body
  // measurement. Measured before the fix:
  //   "2XL"      -> "XS"    (n=2 read as a US womens 2 — the largest common
  //                          size resolving to the smallest)
  //   "3XL"      -> "XL"
  //   "ONE SIZE" -> null
  // A 2XL garment was fit-scored as XS, so it read as far too small for the
  // people it actually fits, and XS stock was matched to 2XL wearers.
  //
  // Look the WHOLE normalized label up first. Only labels that are not
  // themselves alpha sizes go on to the numeric interpretation below.
  const compact = s.replace(/\s+/g, " ").trim();
  if (ALPHA[compact]) return ALPHA[compact];
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

/**
 * What the piece actually FITS like, after correcting for how the house cuts.
 *
 * The distinction from toUSAlpha is the whole point of this module: a Saint
 * Laurent M and a Balenciaga M are not the same garment. BRAND_BIAS is a
 * consensus adjustment in ladder steps and is SUBTRACTED — a positive bias
 * means "runs small", so the piece fits like a smaller size than its label.
 *
 * Returns `{ fitsLike, base, bias }` so a caller can show both the corrected
 * size and the label it came from, and say why they differ.
 */
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

/**
 * ESTIMATED garment measurements in inches for a category and size.
 *
 * A model, not a fact: a size-M base per category, stepped along the ladder.
 * Returns null for categories where body measurements are meaningless
 * (footwear, accessories) rather than inventing numbers for them.
 *
 * Real measurements from a merchant or size chart ALWAYS beat these — see
 * `measurementSource` on sizeRecord, which records which of the two a reader
 * is looking at.
 */
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

/**
 * Everything known about one piece's size, as a single record.
 *
 * `measurementSource` is the honesty field: "estimated-size-model" means the
 * numbers came from the model above, while "merchant", "listing" or
 * "size-chart" mean somebody measured the actual garment. fitAssessment
 * reports that distinction as `exact` so the UI never presents an estimate
 * with the confidence of a measurement.
 */
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
    measurementSource: opts.measurementSource || "estimated-size-model",
    category: opts.category || null,
  };
}

// ---- User fit scoring -----------------------------------------------------
const EASE = {
  tops: { chest: [2, 6], waist: [1, 6] },
  knitwear: { chest: [2, 8], waist: [1, 8] },
  outerwear: { chest: [4, 10], waist: [3, 10] },
  tailoring: { chest: [2, 5], waist: [1, 4] },
  dresses: { chest: [1, 4], waist: [0.5, 3], hips: [1, 4] },
  bottoms: { waist: [0, 2], hips: [1, 4], inseam: [0, 0] },
};

/**
 * How well one piece suits one body: `{ status, score, exact, compared }`.
 *
 * Two signals combine. The alpha signal is ladder distance from the person's
 * usual size. The measurement signal compares garment against body per
 * dimension using EASE — the intended GAP between them, which is why a
 * garment chest smaller than the body's is a mismatch while several inches
 * larger is correct. Ease is per category: outerwear is meant to be roomy,
 * tailoring is not.
 *
 * Measurements dominate when present (0.65 to 0.35), because a number beats a
 * letter. With no profile it returns `status: "unknown"` and a neutral 0.5 —
 * a piece is never penalised for a person not having told us their size.
 *
 * `compared` is per-dimension working, so the UI can say WHICH dimension is
 * off rather than only that something is.
 */
export function fitAssessment(sizeRec, profile) {
  if (!profile) return { status: "unknown", score: 0.5, exact: false, compared: [] };
  let alphaScore = 0.5;
  const target = fitIndex(profile.usualSize);
  const got = fitIndex(sizeRec?.fitsLikeUS);
  if (target != null && got != null) {
    const dist = Math.abs(target - got);
    alphaScore = Math.max(0, 1 - dist * 0.34);
  }
  const bm = profile.measurements || {};
  const gm = sizeRec?.measurements || {};
  const rules = EASE[sizeRec?.category] || (gm.chest ? EASE.tops : gm.waist ? EASE.bottoms : {});
  const compared = [];
  for (const [key, range] of Object.entries(rules)) {
    if (!Number.isFinite(Number(bm[key])) || !Number.isFinite(Number(gm[key])) || !bm[key] || !gm[key]) continue;
    const difference = key === "inseam" ? Math.abs(gm[key] - bm[key]) : gm[key] - bm[key];
    const inside = key === "inseam" ? difference <= 2 : difference >= range[0] && difference <= range[1];
    const distance = inside ? 0 : key === "inseam"
      ? difference - 2 : Math.min(Math.abs(difference - range[0]), Math.abs(difference - range[1]));
    compared.push({ key, difference: +difference.toFixed(2), match: inside, score: Math.max(0, 1 - distance / 6) });
  }
  const measurementScore = compared.length
    ? compared.reduce((sum, result) => sum + result.score, 0) / compared.length : null;
  const score = measurementScore == null ? alphaScore : alphaScore * 0.35 + measurementScore * 0.65;
  const exact = ["merchant", "listing", "size-chart"].includes(sizeRec?.measurementSource);
  let status = "unknown";
  if (compared.length) status = compared.every((result) => result.match) ? "match"
    : score >= 0.62 ? "close" : "mismatch";
  else if (target != null && got != null) status = target === got ? "size-match" : Math.abs(target - got) === 1 ? "close" : "mismatch";
  return { status, score: +score.toFixed(3), exact, compared };
}

/** Just the 0..1 number from fitAssessment, for ranking. */
export function fitScore(sizeRec, profile) {
  return fitAssessment(sizeRec, profile).score;
}

/**
 * The human sentence — "fits like US M · runs small", "close on the waist".
 *
 * Returns null when there is genuinely nothing to say, and the string "fit
 * data not provided" when the person HAS a profile but the piece carries no
 * size we can read. Those are different states and the UI shows them
 * differently: silence for the first, an honest absence for the second.
 */
export function fitPhrase(sizeRec, profile) {
  const hasProfile = !!(profile?.usualSize || Object.values(profile?.measurements || {}).some(Boolean));
  if (!sizeRec) return hasProfile ? "fit data not provided" : null;
  const hasGarmentMeasurements = Object.values(sizeRec.measurements || {}).some((value) => Number(value) > 0);
  if (!sizeRec.fitsLikeUS && !hasGarmentMeasurements) return hasProfile ? "fit data not provided" : null;
  const base = sizeRec.fitsLikeUS ? "fits like US " + sizeRec.fitsLikeUS : null;
  if (!hasProfile) {
    if (!base) return null;
    if (sizeRec.runsBias > 0) return base + " · runs small";
    if (sizeRec.runsBias < 0) return base + " · runs large";
    return base;
  }
  const assessment = fitAssessment(sizeRec, profile);
  if (assessment.status === "match" && assessment.exact) return "✓ matches your measurements";
  if (assessment.status === "match") return "likely matches · estimated from listed size";
  if (assessment.status === "close" && assessment.compared.length) return assessment.exact
    ? "close to your measurements" : "close · estimated from listed size";
  if (assessment.status === "mismatch") return assessment.compared.length
    ? assessment.exact ? "unlikely to match your measurements" : "unlikely to match · estimated from listed size"
    : "unlikely to match your usual size";
  if (assessment.status === "size-match") return "✓ matches your usual size";
  if (!base) return "fit data not provided";
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
