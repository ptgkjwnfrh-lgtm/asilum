// lib/search/ordinary.js — A WORD THE ENGINE ALREADY OWNS IS NOT A NAME.
//
// MEASURED on the live catalog (20 Sep 2026, 897 eBay listings): a listing
// whose brand field says "Black" (title: a Stone Island jacket) made the bare
// query "black" a BRAND query — 261 pieces under "reading "black" as the
// designer …" — and "leather" resolved to the one listing branded
// "casablanca leather" through the whole-word partial rule, so the 100-odd
// leather pieces in stock were never shown. Marketplace brand fields are
// free text; sooner or later one of them is an ordinary word.
//
// The houses register already carries this law for curated houses (`kb:
// false` on Hope, Toast, Gap — lib/asterisk/houses.js). This is the same law
// for the words the engine reads as CONTENT on its own: a colour, a material,
// a gender, a garment noun. Such a word, on its own, is a description; it is
// never a house name, whatever a brand field says. "Craig Green" stays a
// house — its whole name is not an ordinary word — and "green jacket" keeps
// its disclosed partial reading (tests/evidence-hygiene).
//
// A LOOKUP AGAINST THE ENGINE'S OWN LISTS, NOT A GUESS: colours from the
// colour-evidence reader, materials from the era-anchor reader, gender words
// from the dense-constraint reader, garment nouns from the vocabulary.

import { KNOWN_COLORS } from "../products.js";
import { MATERIALS } from "./eraAnchors.js";
import { GENDER_WORDS } from "./denseQuery.js";
import { GARMENT_CATEGORY, GENERIC_GARMENT_NOUNS } from "./vocabulary.js";
import { norm } from "./tokens.js";

const ORDINARY = new Set([
  ...KNOWN_COLORS,
  ...MATERIALS,
  ...Object.keys(GENDER_WORDS),
  ...Object.keys(GARMENT_CATEGORY),
  ...Object.keys(GENERIC_GARMENT_NOUNS),
].map((w) => norm(String(w))).filter(Boolean));

/** Is this whole string one word the engine reads as content on its own? */
export function isOrdinaryWord(text) {
  const n = norm(String(text || ""));
  if (!n || n.includes(" ")) return false;
  return ORDINARY.has(n);
}

/** Exported for the instrument and the tests: the words this law covers. */
export function ordinaryWords() { return [...ORDINARY].sort(); }
