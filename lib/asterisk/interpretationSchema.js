// lib/asterisk/interpretationSchema.js
// Asterisk AI — the versioned interpretation contract (handoff Feature A).
// One shape every consumer (search, drawer, rails, eval harness) can pin.
// The contract is ADDITIVE over the legacy /api/interpret response — the
// deterministic router's output remains the trusted core; the orchestrator
// wraps it with method labels, alternatives, and SEPARATED confidence.

export const INTERPRETATION_CONTRACT_VERSION = 1;

// How an interpretation was produced. Honesty rule: the method is always
// stated; a composed or recovered reading may never masquerade as an exact
// catalog resolution.
export const METHODS = Object.freeze([
  "exact",        // canonical name/alias hit in the curated+research catalog
  "ambiguous",    // multiple distinct catalog candidates matched
  "composed",     // compound query decomposed into known concepts (inference)
  "recovered",    // misspelling-distance recovery to a catalog entry (labeled)
  "lexical",      // attribute best-effort from the brain lexicon (no entity)
  "none",         // honest fallthrough — standard search stands
]);

/**
 * Validate + freeze a contract payload. Throws TypeError on violation —
 * producers are trusted code; a malformed contract is a bug, not input.
 */
export function buildInterpretationResult({
  query, normalizedQuery, method, entity = null, alternatives = [],
  interpretations = [], attributes = null, confidence, assumptions = [],
  flaggedForResearch = false, personalized = false,
}) {
  if (!METHODS.includes(method)) throw new TypeError(`unknown method "${method}"`);
  if (typeof query !== "string" || typeof normalizedQuery !== "string") {
    throw new TypeError("query and normalizedQuery required");
  }
  if (!confidence || typeof confidence !== "object") throw new TypeError("confidence object required");
  for (const key of ["entityResolution", "interpretation", "evidenceCoverage", "inventoryRepresentation"]) {
    const v = confidence[key];
    if (v !== null && !(typeof v === "number" && v >= 0 && v <= 1)) {
      throw new TypeError(`confidence.${key} must be null or 0..1`);
    }
  }
  return Object.freeze({
    contractVersion: INTERPRETATION_CONTRACT_VERSION,
    query, normalizedQuery, method,
    entity, alternatives, interpretations,
    attributes, // { tags: {TAG: weight} } | null — lexical/composed readings
    confidence: Object.freeze({ ...confidence }),
    assumptions: assumptions.slice(0, 5),
    flaggedForResearch: !!flaggedForResearch,
    personalized: !!personalized,
  });
}

// Stable id for an interpretation the user can give feedback on:
// entity interpretations use their catalog id; synthetic readings use
// method-scoped ids so feedback stays attributable across versions.
export function interpretationFeedbackId(method, ref) {
  return `${INTERPRETATION_CONTRACT_VERSION}:${method}:${String(ref).slice(0, 90)}`;
}
