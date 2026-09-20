// lib/search/size.js — the size the reader asked for (Aug 21).
//
// THE GAP THIS EXISTS FOR (measured on the shipped catalog): every item
// carries `size: { label, system, fitsLikeUS, … }`, and search read none of
// it. The engine actively DENIED the word:
//
//   "medium jacket"   170 outerwear, opening on an XL, under
//                     `no piece here matches "medium" — showing outerwear
//                     instead`, while 27 outerwear pieces fit like a US M
//   "xl hoodie"       160 tops opening on an M, same denial
//   "size medium"     ZERO results and NO note at all
//   "size 32"         ZERO results and no note, while 43 pieces are labelled 32
//   "32 waist jeans"  150 bottoms opening on a 28
//
// TWO DIFFERENT FIELDS, AND THE DIFFERENCE MATTERS.
//   `label`       what the merchant printed: "M", "32", "JP 3", "FR 48".
//                 915/915 populated, four systems (US 572, JP 145, FR 120,
//                 IT 78).
//   `fitsLikeUS`  ASILUM's NORMALISED comparison, produced by
//                 lib/brain/sizing.js. 852/915 populated — 63 items (JP 3 and
//                 JP 5) have none — and it DIFFERS from the label on 554
//                 items, which is the whole point of having it.
// So a letter query is answered by `fitsLikeUS` and the sentence says "fits
// like US M", never "size M". Claiming the merchant printed M on a piece
// labelled FR 48 would be a small lie with a real cost in a fitting room.
//
// A SIZE IS HARD, LIKE A BUDGET. An era that this catalog cannot serve gets
// dropped and the era-free rack shown, because "1980s" is often asking for a
// look. A size is never asking for a look: showing clothes that do not fit is
// as useless as showing a $2,000 jacket to a $400 ceiling. An empty result
// stays empty and names what IS here.
//
// AN ITEM WITH NO fitsLikeUS CANNOT PASS a letter constraint — the same rule
// as the budget floor and the era window. Sixty-three JP-sized pieces are
// genuinely uncomparable, and guessing a mapping for them is exactly the
// invention lib/brain/sizing.js exists to avoid.
//
// PARSED FROM THE RAW QUERY, not from the token stream, because the tokenizer
// drops every one-character token — "size m" arrives as ["size"] and the size
// itself is already gone.
//
// DELIBERATELY NOT READ: `size.measurements` (chest/waist/shoulder integers
// with no unit and no method recorded — a garment-flat and a body measurement
// are indistinguishable) and `size.runsBias` (a BRAND-level prior from
// lib/brain/sizing.js, not a property of the piece). Both are in the survey's
// rejected list for the same reason: presenting either as a fact about this
// garment is the fabrication.

import { foldNorm } from "./text.js";

export const SIZE_LETTERS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const LETTERS = Object.assign(Object.create(null), {
  xxs: "XXS", xs: "XS", "extra small": "XS",
  s: "S", small: "S",
  m: "M", med: "M", medium: "M",
  l: "L", large: "L",
  xl: "XL", "extra large": "XL",
  xxl: "XXL", "2xl": "XXL",
  xxxl: "XXXL", "3xl": "XXXL",
});

const SYSTEMS = ["us", "jp", "fr", "it"];

// Numeric labels in this catalog are waist sizes, and every one of them is on
// a pair of bottoms (150 items, labels 28/30/32/34). The range is bounded so a
// price, a year or a shoe size cannot be read as a waist.
const WAIST_MIN = 24;
const WAIST_MAX = 46;

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Read a size out of the RAW query.
 *
 * @returns {{ tokens: string[], size: null | {
 *            kind: "fit" | "native" | "waist",
 *            fits?: string, system?: string, label?: string, waist?: number,
 *            phrase: string, label_text: string } }}
 *   `label_text` is the phrase the engine may say out loud.
 */
export function parseSizeConstraint(query, tokens = [], { footwear = false } = {}) {
  const q = foldNorm(query);
  if (!q) return { tokens, size: null };

  const consume = (phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    const rest = [];
    let i = 0;
    for (const t of tokens) {
      if (i < words.length && foldNorm(t) === words[i]) { i++; continue; }
      rest.push(t);
    }
    return rest;
  };

  // "jp 3", "fr 48", "us 12", "it 46" — a native size names its own system.
  const native = q.match(new RegExp(`\\b(${SYSTEMS.join("|")})\\s*(\\d{1,2})\\b`));
  if (native) {
    const system = native[1].toUpperCase();
    const label = `${system} ${native[2]}`;
    return {
      tokens: consume(`${native[1]} ${native[2]}`),
      size: { kind: "native", system, label, phrase: native[0], label_text: `size ${label}` },
    };
  }

  // A SHOE SIZE IS A SHOE SIZE (20 Sep 2026). MEASURED on the live catalog:
  // "boots size 42" read 42 as a WAIST and answered "nothing with a 42 waist
  // in footwear", and "boots size 9" read nothing at all (9 is below the
  // waist floor). When the query names footwear, "size N" is a shoe size:
  // up to 16 the US ladder the sellers here label with ("8", "9.5"), 35–50
  // the EU ladder ("EU 45", "US10.5=UK9.5=EUR44=27CM"). Matching is against
  // the label as printed, never a conversion table.
  if (footwear) {
    const shoe = q.match(/\b(?:size|eu|eur|us)\s*(\d{1,2}(?:\.5)?)\b/);
    if (shoe) {
      const n = Number(shoe[1]);
      const system = /^(eu|eur)/.test(shoe[0]) ? "EU" : /^us/.test(shoe[0]) ? "US" : n >= 35 && n <= 50 ? "EU" : n <= 16 ? "US" : null;
      if (system) {
        return {
          tokens: consume(shoe[0]),
          size: { kind: "shoe", system, shoe: n, label: `${system} ${shoe[1]}`, phrase: shoe[0], label_text: `a ${system} ${shoe[1]} shoe size` },
        };
      }
    }
  }

  // "size 32", "32 waist", "waist 32"
  const waist = q.match(/\b(?:size|waist)\s+(\d{2})\b/) || q.match(/\b(\d{2})\s+waist\b/);
  if (waist) {
    const n = Number(waist[1]);
    if (n >= WAIST_MIN && n <= WAIST_MAX) {
      return {
        tokens: consume(waist[0]),
        size: { kind: "waist", waist: n, label: String(n), phrase: waist[0], label_text: `a ${n} waist` },
      };
    }
  }

  // Letters, with or without a leading "size".
  const names = Object.keys(LETTERS).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const re = new RegExp(`\\b(?:size\\s+)?${esc(name)}\\b`);
    const hit = q.match(re);
    if (!hit) continue;
    const fits = LETTERS[name];
    return {
      tokens: consume(hit[0]),
      size: { kind: "fit", fits, phrase: hit[0], label_text: `fits like US ${fits}` },
    };
  }

  return { tokens, size: null };
}

/**
 * Does this piece satisfy a size constraint?
 *
 * UNKNOWN IS NEVER A QUIET YES: a piece with no size record fails rather than
 * passing on the benefit of the doubt, because showing an unsized garment to
 * someone who asked for a medium is worse than showing them fewer results.
 *
 * Three constraint kinds — `fit` (the normalized US ladder), `native` (the
 * label as printed) and `waist` (inches).
 */
export function itemMatchesSize(item, size) {
  if (!size) return true;
  const s = item?.size;
  if (!s || typeof s !== "object") return false;
  if (size.kind === "fit") {
    // Unknown is never a quiet yes.
    return !!s.fitsLikeUS && foldNorm(s.fitsLikeUS) === foldNorm(size.fits);
  }
  if (size.kind === "native") {
    return foldNorm(s.label) === foldNorm(size.label);
  }
  if (size.kind === "waist") {
    return String(s.label).trim() === String(size.waist);
  }
  if (size.kind === "shoe") {
    // Footwear only, against the label as printed. A bare number is the US
    // ladder ("9"); an EU number needs its marker ("EU 45", "EUR44") or a
    // seller's list of EU sizes ("38.5,39,40,…,45").
    if (item?.category !== "footwear") return false;
    const label = foldNorm(s.label);
    if (!label) return false;
    const n = String(size.shoe);
    const esc = n.replace(".", "\\.");
    if (size.system === "US") {
      return label === n || new RegExp(`(^|[^0-9.])us\\s?${esc}(?![0-9.])`).test(label);
    }
    if (new RegExp(`(^|[^a-z])(eu|eur)\\s?${esc}(?![0-9.])`).test(label)) return true;
    const list = label.split(",").map((x) => x.trim());
    return list.length > 1 && list.every((x) => /^\d{2}(\.5)?$/.test(x)) && list.includes(n);
  }
  return true;
}

/** Filter a pool by size. A filter, not a score — see applyOriginConstraint. */
export function applySizeConstraint(items = [], size = null) {
  if (!size) return items;
  return items.filter((it) => itemMatchesSize(it, size));
}

/** What a scope actually holds, said out loud when the ask cannot be met. */
export function sizeMissNote(size, scope = [], scopeLabel = null) {
  if (!size) return null;
  const where = scopeLabel ? ` in ${scopeLabel}` : "";
  if (size.kind === "fit") {
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
    const present = [...new Set(scope.map((it) => it?.size?.fitsLikeUS).filter(Boolean))]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (!present.length) return `nothing${where} carries a comparable size`;
    return `nothing${where} fits like US ${size.fits} — what is here runs ${present[0]} to ${present[present.length - 1]}`;
  }
  if (size.kind === "shoe") {
    const shoes = scope.filter((it) => it?.category === "footwear");
    const labels = [...new Set(shoes.map((it) => it?.size?.label).filter(Boolean))].sort();
    if (!labels.length) return `nothing${where} carries a shoe size`;
    return `nothing in ${size.label_text}${where} — the shoe sizes here are ${labels.slice(0, 8).join(", ")}`;
  }
  const labels = [...new Set(scope.map((it) => it?.size?.label).filter(Boolean))].sort();
  if (!labels.length) return `nothing${where} carries a size label`;
  return `nothing with ${size.label_text}${where} — the labels here are ${labels.slice(0, 6).join(", ")}`;
}
