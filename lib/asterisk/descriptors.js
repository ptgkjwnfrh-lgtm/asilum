// lib/asterisk/descriptors.js — ONE WORD FOR ONE THING in the stream.
//
// THE GAP THIS EXISTS FOR (measured on the deep first light, 10 Sep 2026):
// the identification step writes free descriptors, and the same construction
// came back as "dagger collar", "dagger lapels" and "dagger point collar" on
// three of nine listings. Each spelling is its own key in item.tags and its
// own stream in the shared map (ADR-008 §5b): a person who favourited two
// "dagger collar" jackets never meets the third. ADR-008 named this as the
// next instrument. This module is the vocabulary that instrument reads.
//
// WHAT THIS IS. A sourced glossary of garment construction, materials, cuts
// and finishes — lib/asterisk/descriptors.json, 400 concepts, each with the
// page its definition was read from, a canonical spelling, the synonyms the
// trade uses for the SAME thing, the kind the stream's schema knows
// (lib/asterisk/stream/schema.js DESCRIPTOR_KINDS) and the era a detail
// reads as. Curated on 11 Sep 2026 from Wikipedia glossary articles and
// menswear references; never from marketplace listings (the eBay licence
// question in OWNER-DECISIONS §12 does not arise: nothing here came from
// eBay Content).
//
// WHAT IT IS NOT. It is not a classifier and it invents nothing: a term the
// glossary does not know comes back unchanged. Merging two DISTINCT things
// is the failure this file must never commit — a jetted pocket and a besom
// pocket are one concept because the sources say so; a type II and a type
// III jacket are two, because the construction differs. Each grouping is one
// row, reviewable.
//
// Pure: no I/O beyond the JSON import, no model.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {{ provenance: object, concepts: Array<{canonical:string, kind:string, family:string|null, synonyms:string[], meaning:string, era:string|null, source:string}> }} */
const DATA = require("./descriptors.json");

export const DESCRIPTOR_PROVENANCE = Object.freeze(DATA.provenance);
export const DESCRIPTOR_CONCEPTS = Object.freeze(DATA.concepts);

// the stream's own spelling rule, kept identical so a canonical form is
// always a legal descriptor tag
const TAG_RE = /^[a-z0-9][a-z0-9' -]{0,29}$/;
export function normalizeTerm(term) {
  const v = String(term ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/_/g, "-").replace(/[^a-z0-9' -]/g, "").replace(/\s+/g, " ").slice(0, 30);
  return TAG_RE.test(v) ? v : null;
}

// term (canonical or synonym) → concept
const INDEX = new Map();
for (const c of DESCRIPTOR_CONCEPTS) {
  INDEX.set(c.canonical, c);
  for (const s of c.synonyms) if (!INDEX.has(s)) INDEX.set(s, c);
}
// Lookup variants. These WIDEN the lookup only — a variant never becomes a
// canonical, so a concept's recorded spelling is unaffected by any of them.
//   plural / singular:  "welt pockets" → "welt pocket", "fade" → "fades"
//   last word only:     "flap chest pockets" → "flap chest pocket"
//   hyphen / space:     "dagger-collar" → "dagger collar", and the reverse,
//                       because sellers and models write both and several
//                       canonicals genuinely carry a hyphen ("two-way zip").
function variants(t) {
  const seeds = [t];
  if (t.includes("-")) seeds.push(t.replace(/-/g, " ").replace(/\s+/g, " ").trim());
  if (t.includes(" ")) seeds.push(t.replace(/ /g, "-"));
  const out = [];
  for (const s of seeds) {
    if (!s) continue;
    out.push(s);
    if (s.endsWith("s")) out.push(s.slice(0, -1));
    else out.push(s + "s");
    if (s.endsWith("es")) out.push(s.slice(0, -2));
    if (s.endsWith("ies")) out.push(s.slice(0, -3) + "y");
    const words = s.split(/[ -]/);
    if (words.length > 1) {
      const sep = s.includes(" ") ? " " : "-";
      const last = words[words.length - 1];
      const head = words.slice(0, -1).join(sep);
      if (last.endsWith("s")) out.push(`${head}${sep}${last.slice(0, -1)}`);
      else out.push(`${head}${sep}${last}s`);
    }
  }
  return out;
}

/**
 * The concept a free descriptor names, or null when the glossary has no
 * opinion. Never guesses: no fuzzy match, no substring.
 */
export function lookupDescriptor(term) {
  const t = normalizeTerm(term);
  if (!t) return null;
  for (const v of variants(t)) {
    const c = INDEX.get(v);
    if (c) return c;
  }
  return null;
}

/**
 * canonicalDescriptor("dagger lapels") → "dagger collar";
 * canonicalDescriptor("bull head graphic") → "bull head graphic" (unknown, unchanged).
 * Returns null only for a term that is not a legal tag at all.
 */
export function canonicalDescriptor(term) {
  const t = normalizeTerm(term);
  if (!t) return null;
  return lookupDescriptor(t)?.canonical || t;
}

/**
 * Reconcile a descriptor list — [{tag, weight, kind}] as the stream composes
 * it — so one concept is one key: spellings collapse onto the canonical
 * form, the strongest weight wins, and the glossary's kind replaces a
 * model's when the two disagree. Unknown terms pass through untouched.
 * Returns { descriptors, merged } where `merged` lists what was folded.
 */
export function reconcileDescriptors(descriptors = []) {
  const byTag = new Map();
  const merged = [];
  for (const d of descriptors) {
    if (!d || typeof d.tag !== "string") continue;
    const concept = lookupDescriptor(d.tag);
    const tag = concept ? concept.canonical : normalizeTerm(d.tag);
    if (!tag) continue;
    const kind = concept ? concept.kind : d.kind;
    const weight = Number(d.weight) || 0;
    const prev = byTag.get(tag);
    if (prev) {
      if (normalizeTerm(d.tag) !== tag) merged.push({ from: normalizeTerm(d.tag), to: tag });
      if (weight > prev.weight) prev.weight = weight;
      continue;
    }
    if (normalizeTerm(d.tag) !== tag) merged.push({ from: normalizeTerm(d.tag), to: tag });
    byTag.set(tag, { ...d, tag, kind, weight });
  }
  return { descriptors: [...byTag.values()], merged };
}

/** Every term the glossary answers to — for instruments and tests. */
export function descriptorTerms() {
  return [...INDEX.keys()];
}

/**
 * The compact sheet a prompt can carry: the preferred word for each concept
 * with its kind and one-line meaning — the words the identification step
 * should reach for first (the stream session wires it; this module only
 * provides it). Sorted by family then term; ~400 lines.
 */
export function promptVocabulary({ kinds = null } = {}) {
  const want = kinds ? new Set(kinds) : null;
  return DESCRIPTOR_CONCEPTS
    .filter((c) => !want || want.has(c.kind))
    .map((c) => ({ term: c.canonical, kind: c.kind, family: c.family, meaning: c.meaning, ...(c.era ? { era: c.era } : {}) }))
    .sort((a, b) => String(a.family).localeCompare(String(b.family)) || a.term.localeCompare(b.term));
}

/** The decade a detail reads as, when the glossary records one ("1970s"). */
export function eraOfDescriptor(term) {
  return lookupDescriptor(term)?.era || null;
}
