// lib/search/text.js — the one place text is folded for matching.
//
// THE DEFECT THIS EXISTS FOR (measured on the shipped catalog): four houses
// carry diacritics — Comme des Garçons (14 items), Alaïa (12), Aimé Leon Dore
// (12), Stüssy (11) — and nothing in the engine folded them. So the ordinary
// way a person types those names missed entirely:
//
//   "alaia dress"       40 dresses, NOT ONE of them Alaïa, top row Salomon
//   "stussy tee"        160 tops, no Stüssy anywhere
//   "comme des garcons" 14 correct items under the FALSE sentence
//                       `no piece here matches "garcons" — showing comme des instead`
//
// The last one is the worst shape: a right answer wearing a wrong explanation.
//
// Folding is NFD + combining-mark strip, which is symmetric — a query typed
// WITH the accent still matches, because both sides fold. It is deliberately
// only accent folding: no stemming, no case-insensitive Unicode casefolding
// beyond toLowerCase, and no transliteration of non-Latin scripts (ß, ø and
// ł do not decompose, and inventing a mapping for them is a knowledge claim
// this file has no business making).

export function foldAccents(s) {
  // NFKC FIRST, then NFD + mark strip. MEASURED: "ｐｒａｄａ" in fullwidth
  // Latin returned ZERO while "prada" returned 13 — the forms a phone keyboard
  // or a paste from a Japanese site produces were unreachable. NFKC maps
  // fullwidth and other compatibility forms onto their plain equivalents; NFD
  // then separates the accents this file already strips.
  return String(s ?? "").normalize("NFKC").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase, accent-folded, trimmed — the form every matcher compares in. */
export function foldNorm(s) {
  return foldAccents(String(s ?? "")).toLowerCase().trim();
}

/** The de-spaced skeleton of a name, for spelling resolution only. */
export function skeleton(s) {
  return foldNorm(s).replace(/[^a-z0-9]/g, "");
}
