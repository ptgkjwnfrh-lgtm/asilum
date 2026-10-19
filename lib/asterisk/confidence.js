// lib/asterisk/confidence.js
// Asterisk AI — separated, honest confidence (handoff Feature A rules).
// Four independent values, NEVER averaged into one impressive number:
//   entityResolution        — how sure we are WHICH thing was meant
//   interpretation          — how sure the fashion reading of that thing is
//   evidenceCoverage        — how sourced/reviewed the underlying knowledge is
//   inventoryRepresentation — how well permitted inventory can express it
// (personalizedRanking exists only downstream in feed ranking; it is not a
// property of an interpretation and is deliberately absent here.)
//
// Calibration v0 (documented, deterministic): values derive from discrete
// evidence facts (catalog hit type, source counts, review provenance, live
// inventory counts) — not from a model's self-report. The eval dataset
// (eval/universal-queries.json) is the calibration set; the eval test pins
// each band to expected behavior. ECE/Brier tracking activates when a model
// resolver joins the orchestra (Phase 1 exit note).

const clamp = (v) => Math.max(0, Math.min(1, +v.toFixed(2)));

// Display ceiling: only deterministic exact matches with verified data may
// enter the top band, and even those cap at 0.97 — 1.0 is reserved for
// literally nothing (handoff: do not casually display 100%).
const EXACT_CAP = 0.97;
const RECOVERED_CAP = 0.7;
const COMPOSED_CAP = 0.6;
const LEXICAL_CAP = 0.5;

/**
 * HOW SURE ARE WE WHICH THING WAS MEANT? Not whether the reading of it is good
 * — that is interpretationConfidence, and the two must never be merged.
 *
 * Derived from the RESOLUTION METHOD, not from a model's self-report: an exact
 * catalog hit can reach EXACT_CAP, a fuzzy recovery is capped lower, and a
 * bare lexical guess lower still. The caps are ceilings the evidence cannot
 * argue past.
 *
 * 0 means we could not resolve the entity at all.
 */
export function entityResolutionConfidence({ method, candidateCount = 1, distance = 0, queryLength = 0 }) {
  switch (method) {
    case "exact":
      return clamp(candidateCount > 1 ? 0.75 : EXACT_CAP);
    case "ambiguous":
      // deliberately mid-band: we know the candidates, not the intent
      return clamp(0.5 / Math.max(1, candidateCount - 1) + 0.25);
    case "recovered": {
      const rel = queryLength ? distance / queryLength : 1;
      return clamp(Math.min(RECOVERED_CAP, 0.7 - rel));
    }
    case "composed":
      return clamp(COMPOSED_CAP);
    case "lexical":
      return clamp(0.3);
    default:
      return 0;
  }
}

/**
 * HOW SURE IS THE FASHION READING of the thing we resolved?
 *
 * Two ceilings stack: the record's own confidence (research provenance is
 * already capped at 0.8 upstream) and a cap for how the entity was resolved.
 * The lower wins — a superb reading reached by a weak resolution is still only
 * as trustworthy as the resolution.
 */
export function interpretationConfidence({ method, interpretations = [] }) {
  // The reading's own confidence comes from the curated/research records
  // (already capped ≤0.8 for research provenance). Method caps stack on top.
  const best = interpretations.length
    ? Math.max(...interpretations.map((i) => Number(i.confidence) || 0))
    : 0;
  const cap = method === "exact" ? EXACT_CAP
    : method === "ambiguous" ? 0.8
    : method === "recovered" ? RECOVERED_CAP
    : method === "composed" ? COMPOSED_CAP
    : method === "lexical" ? LEXICAL_CAP : 0;
  return clamp(Math.min(best || cap, cap));
}

/**
 * HOW WELL SOURCED is the knowledge behind the reading?
 *
 * About PROVENANCE, not correctness. Curated records count as reviewed by
 * virtue of living in the repo and having been read by a person; research-born
 * records carry source URLs. Sourced AND reviewed scores highest; neither
 * scores 0.3 rather than 0, because an unsourced reading is weak evidence and
 * not the absence of it.
 */
export function evidenceCoverageConfidence({ entity = null, interpretations = [] }) {
  if (!entity && !interpretations.length) return 0;
  // Research-born records carry sourceUrls + review provenance; curated
  // records are human-reviewed by living in the repo. Both count as
  // reviewed; sourced-and-reviewed scores highest.
  const sourced = (entity?.sourceUrls || []).length;
  const reviewed = !!entity || interpretations.some((i) => String(i.provenance || "").startsWith("curated"));
  if (sourced >= 2 && reviewed) return 0.9;
  if (sourced >= 1 && reviewed) return 0.8;
  if (reviewed) return 0.7; // curated editorial, no external URLs by design
  return 0.3;
}

/**
 * CAN THE CATALOG ACTUALLY SHOW THIS? A perfect reading of a piece we hold
 * nothing like is still a poor answer, and this is the value that says so.
 *
 * Ceilinged at 0.9 even when fully satisfied: matching the requested count
 * proves the shelf is not empty, never that it is the right shelf.
 */
export function inventoryRepresentationConfidence({ matchedItems = 0, requested = 24 }) {
  if (matchedItems <= 0) return 0;
  return clamp(Math.min(1, matchedItems / Math.max(1, requested)) * 0.9);
}

// The user-facing label band. Returns a phrase, never a bare percentage
// pretending to be objective truth.
export function confidenceBand(value) {
  if (value == null) return null;
  if (value >= 0.9) return "very strong match";
  if (value >= 0.7) return "strong interpretation";
  if (value >= 0.45) return "plausible interpretation";
  if (value > 0.2) return "uncertain — check the assumptions";
  return "weak signal";
}

// The documented research-flag threshold (handoff: flag below a calibrated
// threshold or with unresolved interpretation — never merely <100%).
export const RESEARCH_FLAG_THRESHOLD = 0.45;

/**
 * Should this query go on the research queue?
 *
 * Flags an unresolved entity outright, and holds weaker methods (lexical,
 * composed) to a HIGHER bar, since a shaky method reaching a decent number is
 * the case most likely to be wrong.
 *
 * NEVER "flag anything below 100%": a calibrated threshold is the rule, and
 * flagging everything would make the queue useless.
 */
export function shouldFlagForResearch({ method, interpretation }) {
  if (method === "none") return true;
  if (method === "lexical" || method === "composed") return interpretation < RESEARCH_FLAG_THRESHOLD + 0.15;
  return interpretation < RESEARCH_FLAG_THRESHOLD;
}
