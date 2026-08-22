// lib/search/negation.js — the engine stops serving the thing you excluded.
//
// THE DEFECT THIS EXISTS FOR (measured on the shipped catalog): negation was
// parsed nowhere, so the excluded word went into scoring like any other and
// DROVE the rack. The user got the exact thing they asked not to see, at the
// top:
//
//   "no logo hoodie"        top row: Acne Studios — LOGO HOODIE
//   "trousers no pleats"    top row: Kapital — PLEATED TROUSERS
//   "jacket except puffer"  top row: Y/Project — DOWN PUFFER
//   "not prada"             13 results, every one of them Prada
//   "anything but sneakers" 17 of the 24 shown were sneakers
//
// A NEGATION IS HARD, LIKE A BUDGET, NOT SOFT LIKE AN ERA. When an era window
// is empty the constraint is dropped and the reader is shown the era-free
// rack, because "1980s" is often asking for a look. "No logos" is not asking
// for a look — it is a requirement, and serving logos anyway would be worse
// than serving nothing. So an exclusion that empties the rack stays empty and
// says why.
//
// WHAT AN EXCLUSION CAN HONESTLY MEAN. This catalog stores no materials and
// no colours. "no leather" therefore excludes pieces NAMED leather; it cannot
// promise a garment contains none. Every sentence this module writes says "by
// name" for exactly that reason — the removal is real and its basis is
// stated, which is the only honest way to offer it at all.
//
// DECLARED SCOPE. Markers are a closed set (below). One word is excluded per
// marker — "no logo hoodie" excludes "logo", not "logo hoodie", because a
// greedy two-word exclusion would silently eat the noun the reader still
// wants — with ONE exception: a known house or designer NAME is consumed
// whole, because "not rick owens" and "anything but comme des garcons" are
// names, and half a name is not one.
// Aesthetic exclusion ("no streetwear") is NOT read — the ten brain axes are
// weights, not labels a piece carries or lacks, and thresholding one into a
// yes/no would be a claim the vector does not support.

import { foldNorm } from "./text.js";

// A marker followed by a word. "but" is only a marker after a totaliser,
// because a bare "but" is ordinary English ("nothing but a t-shirt" is an
// exclusion; "but" alone is not).
const SIMPLE_MARKERS = new Set(["no", "not", "without", "minus", "except", "excluding", "sans", "excl"]);
const TOTALISERS = new Set(["anything", "everything", "all", "nothing", "any"]);
// Skipped between a marker and its word: "without a logo", "minus the stripes".
const FILLERS = new Set(["a", "an", "the", "any", "of"]);

/**
 * Lift negations out of a token stream.
 * @returns {{ tokens: string[], exclusions: Array<{ word: string, marker: string }> }}
 */
export function parseNegations(tokens = [], { phrases = [] } = {}) {
  // Known multi-word names, longest first, keyed the way the tokenizer splits.
  const phraseKeys = phrases
    .map((p) => foldNorm(p).split(/[^a-z0-9]+/).filter(Boolean))
    .filter((parts) => parts.length > 1)
    .sort((a, b) => b.length - a.length);
  const rest = [];
  const exclusions = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = foldNorm(tokens[i]);
    let marker = null;
    let j = i;
    if (SIMPLE_MARKERS.has(t)) { marker = t; j = i + 1; }
    else if (t === "but" && TOTALISERS.has(foldNorm(rest[rest.length - 1] || ""))) {
      marker = "but"; j = i + 1;
      rest.pop();
    } else if (TOTALISERS.has(t) && foldNorm(tokens[i + 1] || "") === "but") {
      marker = "but"; j = i + 2;
    }
    if (marker === null) { rest.push(tokens[i]); continue; }
    while (j < tokens.length && FILLERS.has(foldNorm(tokens[j]))) j++;
    const word = foldNorm(tokens[j] || "");
    if (!word || SIMPLE_MARKERS.has(word)) {
      // A marker with nothing to exclude is just a word.
      rest.push(tokens[i]);
      continue;
    }
    // A known name is consumed whole — half a name is not one.
    let span = [word];
    for (const parts of phraseKeys) {
      if (parts.length > tokens.length - j) continue;
      const ahead = tokens.slice(j, j + parts.length).map((t) => foldNorm(t));
      if (parts.every((p, k) => p === ahead[k])) { span = ahead; break; }
    }
    exclusions.push({ word: span.join(" "), marker });
    i = j + span.length - 1;
  }
  return { tokens: rest, exclusions };
}

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameKey = (d) => foldNorm(d).split(/[^a-z0-9]+/).filter(Boolean).join(" ");
const pieceOf = (title) => {
  const full = foldNorm(title);
  const d = full.indexOf("—");
  return d >= 0 ? full.slice(d + 1).trim() : full;
};

/**
 * Does this item match an excluded word? Four kinds of match, in the order a
 * person would mean them:
 *   1. the house       "not prada"        → every Prada piece
 *   2. a credited name "not virgil abloh" → every piece crediting him
 *   3. the category    "anything but shoes" (a generic noun names a category)
 *   4. the piece name  "no logo"          → every piece NAMED logo
 */
export function itemMatchesExclusion(item, word, { categoryOf = () => null } = {}) {
  const w = foldNorm(word);
  if (!w) return false;
  const whole = new RegExp("\\b" + esc(w) + "\\b");
  if (item?.brand && whole.test(foldNorm(item.brand))) return true;
  // A designer exclusion needs the WHOLE name. MEASURED: a contains-test made
  // "not prada" remove 15 Miu Miu pieces as well, because they credit Miuccia
  // Prada — a different house and a different person.
  if ((item?.designers || []).some((d) => nameKey(d) === nameKey(w))) return true;
  const cat = categoryOf(w);
  if (cat && item?.category === cat) return true;
  const piece = pieceOf(item?.title);
  for (const v of nameVariants(w)) if (new RegExp("\\b" + esc(v) + "\\b").test(piece)) return true;
  return false;
}

// An exclusion has to reach the form the TITLE uses, not the form the reader
// typed. MEASURED: "trousers no pleats" reported `nothing here is named
// "pleats"` while ten pleated trousers sat on the page, because a bare plural
// strip turns "pleats" into "pleat" and `\bpleat\b` does not match
// "pleated". Same closed expansion the era anchors use — never a stemmer,
// which would over-reach on a catalog this small.
function nameVariants(w) {
  const base = w.endsWith("es") && w.length >= 5 ? w.slice(0, -2)
    : w.endsWith("s") && w.length >= 4 ? w.slice(0, -1)
    : w;
  const out = new Set([w, base, base + "s", base + "es", base + "ed", base + "d"]);
  if (base.length > 2) out.add(base + base[base.length - 1] + "ed"); // stud → studded
  if (base.endsWith("y")) out.add(base.slice(0, -1) + "ies");
  return [...out].filter((v) => v.length >= 3);
}

export function applyExclusions(items = [], exclusions = [], opts = {}) {
  if (!exclusions.length) return items;
  return items.filter((it) => !exclusions.some((x) => itemMatchesExclusion(it, x.word, opts)));
}

/**
 * The sentence. Always says "by name" where the basis is a name, because the
 * catalog cannot check a fabric.
 */
export function exclusionNote(exclusions = [], removed = 0, remaining = 0) {
  if (!exclusions.length) return null;
  const words = exclusions.map((x) => `"${x.word}"`).join(" and ");
  if (!removed) return `nothing here is named ${words} — nothing to exclude`;
  if (!remaining) return `every piece here matches ${words} — nothing left after excluding it`;
  return `excluding ${words} by name — ${removed} piece${removed === 1 ? "" : "s"} removed`;
}
