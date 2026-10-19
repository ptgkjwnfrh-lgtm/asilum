// lib/asterisk/culture.js
// Asterisk AI — curated cultural knowledge v1 (films, music, cities, decades).
// These are EDITORIAL STYLE READINGS, not factual claims: no designer credits,
// no season attributions, no costume-designer facts are asserted — only how a
// reference translates into wearable fashion signals. Every interpretation is
// human-reviewed (checked in through PR review), carries its provenance, and
// maps to the LIVE brain tag space so results are real products, never costume
// replicas. Entities with multiple readings stay SEPARATE (Tyler ≠ the
// Narrator; disco ≠ punk) — never blended.
//
// THE RECORDS LIVE IN ./culture/, THE READING LIVES HERE. The catalog had
// grown to 1,826 lines in one file, which made every addition a diff against
// a wall of data and buried the three functions that actually do something.
// The parts are split by HOW THE CATALOG GREW rather than by kind, because
// each expansion landed as its own reviewable PR and — more importantly —
// because ORDER IS BEHAVIOUR: cultureIndex() lets a later record's name or
// alias overwrite an earlier one's, and cultureSuggestView() walks the array
// as it stands. Splitting by kind would have reordered 607 records and
// changed which reading some queries resolve to, silently.
//
// So the parts are concatenated here in their original order, and the split
// was verified by serialising CULTURE, the index key list and the suggestion
// view before and after: all three are byte-identical.
//
// This module stays the ONLY import point. Nothing outside imports a part
// directly, so a future re-split changes one file and no callers.
//
// Extend by adding records to the END of the part they belong to (small,
// reviewable diffs), or through the research pipeline
// (lib/asterisk/research.js): approved learned facts compile into
// culture.research.json — merged below, curated wins any collision — and
// every batch lands as its own reviewable PR. Nothing writes this file
// directly.

import RESEARCH from "./culture.research.json" with { type: "json" };
import { validateCompiledResearchRecord } from "./cultureSchema.js";
export { validateCompiledResearchRecord } from "./cultureSchema.js";

import { CORE } from "./culture/catalog-core.js";
import { EXPANSION } from "./culture/catalog-expansion.js";
import { AESTHETICS } from "./culture/catalog-aesthetics.js";
import { HIPHOP } from "./culture/catalog-hiphop.js";
import { FIGURES } from "./culture/catalog-figures.js";

export { P, P2, P3 } from "./culture/provenance.js";

/**
 * The whole catalog, in order. DO NOT REORDER THESE FIVE — see the note above;
 * the sequence decides which record wins a name collision and the order
 * suggestions are offered in.
 */
export const CULTURE = [...CORE, ...EXPANSION, ...AESTHETICS, ...HIPHOP, ...FIGURES];

// Research-approved records (P2 pipeline output, compiled by
// scripts/compile-culture-research.mjs). Treat the checked-in JSON like code:
// reject the whole module on a malformed or colliding record instead of
// quietly running with a partial catalog.
{
  const taken = new Set();
  const kinds = new Set(CULTURE.map((rec) => rec.kind));
  for (const rec of CULTURE) {
    taken.add(rec.name);
    for (const a of rec.aliases || []) taken.add(a.toLowerCase());
  }
  for (const rec of RESEARCH) {
    const error = validateCompiledResearchRecord(rec, { allowedKinds: kinds, takenNames: taken });
    if (error) throw new TypeError(`invalid compiled culture record ${rec?.name || "<unknown>"}: ${error}`);
    const names = [rec.name, ...rec.aliases];
    for (const n of names) taken.add(n);
    CULTURE.push({
      ...rec,
      interpretations: rec.interpretations.map((interpretation) => ({
        ...interpretation, provenance: rec.provenance,
      })),
    });
  }
}

// name/alias (lowercased) → record. Built once per process.
let INDEX = null;
/**
 * The name/alias -> record lookup, built once per process and memoized.
 *
 * Keys are lowercased; aliases share the table with names, so an alias resolves
 * in one step rather than through a second pass. Never mutate the returned Map
 * — every caller shares it.
 */
export function cultureIndex() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const rec of CULTURE) {
    INDEX.set(rec.name, rec);
    for (const a of rec.aliases || []) INDEX.set(a.toLowerCase(), rec);
  }
  return INDEX;
}

/**
 * Resolve a query string to a cultural record, or null.
 *
 * EXACT MATCH ONLY, after lowercasing and collapsing whitespace. Fuzzy
 * resolution belongs to the orchestrator, which decides what a near-miss
 * means; this is the table, not the reader.
 */
export function lookupCulture(query) {
  const q = String(query || "").toLowerCase().trim().replace(/\s+/g, " ");
  return cultureIndex().get(q) || null;
}

// Light view of the catalog for search autocomplete (Aug 5). An era string
// "<name> — <label>" is only worth suggesting when searching it can actually
// land on that reading, so three degenerate shapes are dropped:
//   * labels that are themselves catalog keys — "70s — disco" would resolve
//     to the standalone DISCO entity, which already suggests itself;
//   * labels contributing no tokens beyond the entity's own name ("the fresh
//     prince of bel-air — the fresh prince") — nothing left to target with;
//   * names under 4 chars ("50s") — the orchestrator's candidate scan
//     ignores keys that short unless typed exactly, so a qualified string
//     cannot resolve.
// Mirrors the orchestrator's ERA_STOP intent for the token check; kept local
// because importing the orchestrator here would be a dependency cycle.
const ERA_LABEL_STOP = new Set(["era", "style", "look", "outfit", "fit", "the", "a", "an", "of", "and", "in"]);
/**
 * The autocomplete view of the catalog — names, aliases and offerable eras.
 *
 * A SUGGESTION IS A PROMISE THAT SEARCHING IT WILL LAND SOMEWHERE, which is why
 * three degenerate era strings are dropped (see the note above). Suggesting a
 * string the engine cannot then resolve is worse than suggesting nothing.
 */
export function cultureSuggestView() {
  const index = cultureIndex();
  return CULTURE.map((r) => {
    const nameTokens = new Set(String(r.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const eras = String(r.name).length < 4 ? [] : (r.interpretations || [])
      .filter((i) => i.label && !index.has(String(i.label).toLowerCase()))
      .filter((i) => String(i.label).toLowerCase().split(/[^a-z0-9]+/)
        .some((t) => t.length >= 3 && !nameTokens.has(t) && !ERA_LABEL_STOP.has(t)))
      .map((i) => ({ id: i.id, label: i.label }));
    return { name: r.name, aliases: r.aliases || [], eras };
  });
}
