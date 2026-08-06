// lib/asterisk/orchestrator.js
// Asterisk AI — universal interpretation orchestrator (handoff Feature A,
// Phase 1). Deterministic, layered, and honest:
//
//   layer 1  exact      — the existing queryRouter (curated+research catalog)
//   layer 2  ambiguous  — ALL catalog candidates whose name/alias contains or
//                         is contained by the query (personalization may
//                         order them, never erase them)
//   layer 3  composed   — compound queries decomposed into known concepts
//   layer 4  recovered  — bounded edit-distance recovery (labeled, never silent)
//   layer 5  lexical    — brain-lexicon attribute best-effort (no entity)
//   layer 6  none       — honest fallthrough; standard search stands
//
// The deterministic router is NOT replaced — it is layer 1 and the fallback
// when the orchestrator flag is off. No model calls anywhere in this file.

import { interpretQuery } from "./queryRouter.js";
import { cultureIndex } from "./culture.js";
import { aestheticTrend } from "./trends.js";
import { inferTags } from "../ingest/inferTags.js";
import {
  buildInterpretationResult, interpretationFeedbackId,
} from "./interpretationSchema.js";
import {
  entityResolutionConfidence, interpretationConfidence,
  evidenceCoverageConfidence, confidenceBand, shouldFlagForResearch,
} from "./confidence.js";

const MAX_QUERY = 200;
const MAX_ALTERNATIVES = 4;

export function normalizeQuery(q) {
  return String(q || "").toLowerCase().trim()
    .replace(/[<>]/g, " ")           // markup characters carry no fashion meaning
    .replace(/\s+/g, " ").slice(0, MAX_QUERY).trim();
}

// ---- layer 2: catalog-wide candidate scan -----------------------------------
// Two distinct situations, deliberately separated:
//   narrower — the QUERY is shorthand contained in candidate keys
//              ("memphis" ⊂ "memphis design")  → disambiguation material
//   contained — candidate KEYS appear inside the query
//              ("rain on concrete" ⊃ "rain","concrete") → composition material
function candidateEntities(nq) {
  const index = cultureIndex();
  const narrower = new Map();
  const contained = new Map();
  // Match whole phrases only. Plain substring checks incorrectly treated
  // unrelated words such as "rainbow" as the catalog entity "rain".
  const containsPhrase = (haystack, needle) => haystack === needle
    || haystack.startsWith(needle + " ")
    || haystack.endsWith(" " + needle)
    || haystack.includes(" " + needle + " ");
  for (const [key, rec] of index) {
    if (key === nq) continue; // exact handled by layer 1
    if (Math.min(key.length, nq.length) < 4) continue;
    if (containsPhrase(key, nq) && !narrower.has(rec.name)) narrower.set(rec.name, { record: rec, viaKey: key });
    else if (containsPhrase(nq, key) && !contained.has(rec.name)) contained.set(rec.name, { record: rec, viaKey: key });
  }
  return { narrower: [...narrower.values()], contained: [...contained.values()] };
}

// ---- layer 3: compound decomposition ----------------------------------------
const CONNECTORS = /\b(?:and|but|with|on|of|the|a|in|at|make|it|like|meets|x)\b|[,+&/]/g;
function decompose(nq) {
  const index = cultureIndex();
  const words = nq.replace(CONNECTORS, " ").split(/\s+/).filter(Boolean);
  const parts = [];
  // greedy longest-span matching over word windows
  for (let start = 0; start < words.length; start++) {
    for (let end = Math.min(words.length, start + 4); end > start; end--) {
      const span = words.slice(start, end).join(" ");
      const rec = span.length >= 4 ? index.get(span) : null;
      if (rec && !parts.some((p) => p.record.name === rec.name)) {
        parts.push({ span, record: rec });
        start = end - 1;
        break;
      }
    }
  }
  return parts;
}

// ---- layer 4: bounded misspelling recovery ----------------------------------
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function recover(nq) {
  if (nq.length < 5) return null;
  const max = nq.length <= 8 ? 1 : 2;
  const index = cultureIndex();
  let best = null;
  for (const [key, rec] of index) {
    if (Math.abs(key.length - nq.length) > max) continue;
    const d = editDistance(nq, key, max);
    if (d <= max && (!best || d < best.distance)) best = { record: rec, key, distance: d };
    if (best && best.distance === 1) break;
  }
  return best;
}

// ---- era targeting -----------------------------------------------------------
// When the query carries tokens beyond the entity's own name that name one of
// its interpretations ("kanye west polo era", "kanye west leather", a clicked
// "kanye west — polo era" suggestion), that reading moves first. Matching is
// against interpretation LABEL and id tokens only — summaries share ordinary
// words across eras and would misfire. Ordering only: readings are never
// erased (the queryRouter brief), and with no leftover-token match the
// existing taste/confidence order stands untouched.
// SEARCH_ERA_TARGETING=0 disables without a deploy.
const ERA_STOP = new Set(["era", "style", "look", "outfit", "fit", "the", "a", "an", "of", "and", "in"]);
export function targetEraInterpretation(nq, matchedKey, interpretations) {
  if (process.env.SEARCH_ERA_TARGETING === "0") return { interpretations, targeted: null };
  if (!Array.isArray(interpretations) || interpretations.length < 2) {
    return { interpretations, targeted: null };
  }
  const keyTokens = new Set(String(matchedKey || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const leftover = String(nq || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !keyTokens.has(t) && !ERA_STOP.has(t));
  if (!leftover.length) return { interpretations, targeted: null };
  let best = null;
  for (const interp of interpretations) {
    const own = new Set(
      (String(interp.label || "") + " " + String(interp.id || "").split("/").pop().replace(/-/g, " "))
        .toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !ERA_STOP.has(t))
    );
    const hits = leftover.filter((t) => own.has(t)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { interp, hits };
  }
  if (!best) return { interpretations, targeted: null };
  return {
    interpretations: [best.interp, ...interpretations.filter((i) => i !== best.interp)],
    targeted: best.interp.label || best.interp.id,
  };
}

// ---- entity shaping (mirrors queryRouter's public shape) ---------------------
function entityView(rec) {
  return {
    name: rec.name, kind: rec.kind, note: rec.note || null,
    trend: aestheticTrend(rec.name),
    knowledge: rec.provenance ? {
      provenance: rec.provenance, sourceUrls: rec.sourceUrls || [], approvedAt: rec.approvedAt || null,
    } : null,
    sourceUrls: rec.sourceUrls || [],
  };
}

/**
 * The Phase-1 interpretation entry point. `feedback` is THIS USER's prior
 * verdicts for this normalized query (array of { interpretationId, verdict })
 * — "not-meant" demotes an interpretation for that user immediately; global
 * knowledge changes only via the research pipeline.
 * Deterministic; never throws on user input.
 */
export async function orchestrateInterpretation(rawQuery, userId = null, feedback = []) {
  const nq = normalizeQuery(rawQuery);
  // Suppression keys on the RAW reading ref (audit #6). The stored
  // interpretationId may arrive as a raw id ("carti/opium", what the shipped
  // discover client posts and what training in the interpret route matches on)
  // or as a versioned feedbackId ("1:exact:carti/opium", what the contract
  // tests post) — strip the "<version>:<method>:" prefix so both forms
  // canonicalize to the same key. Matching on the raw ref (not feedbackId)
  // also keeps a rejection stable across spellings: the same reading reached
  // via a typo has a different feedbackId (method "recovered" vs "exact") but
  // the same raw id, so it stays suppressed.
  const rejected = new Set(
    feedback.filter((f) => f.verdict === "not-meant")
      .map((f) => String(f.interpretationId || "").replace(/^\d+:[a-z-]+:/, ""))
  );
  // The echoed query is markup-stripped defense-in-depth; the ORIGINAL text
  // lives only in the caller's own logs subject to retention (handoff A.1).
  const base = { query: String(rawQuery || "").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY), normalizedQuery: nq };

  const scan = nq.length >= 4 ? candidateEntities(nq) : { narrower: [], contained: [] };

  // Layer 1 — the trusted deterministic router. Exact hits stay
  // authoritative, but genuinely distinct sibling candidates (e.g. "cher"
  // the figure vs "cher horowitz") ride along as non-blocking alternatives.
  const routed = nq ? await interpretQuery(nq, userId) : { entity: null, interpretations: [], personalized: false };
  if (routed.entity) {
    const interpretations = routed.interpretations.map((i) => ({
      ...i, feedbackId: interpretationFeedbackId("exact", i.id),
    }));
    const kept = interpretations.filter((i) => !rejected.has(i.id));
    const siblings = scan.narrower
      .filter(({ record }) => record.name !== routed.entity.name)
      .slice(0, MAX_ALTERNATIVES)
      .map(({ record, viaKey }) => ({
        name: record.name, kind: record.kind, via: viaKey,
        feedbackId: interpretationFeedbackId("ambiguous", record.name),
      }))
      .filter((a) => !rejected.has(a.name));
    const method = "exact";
    const conf = {
      entityResolution: entityResolutionConfidence({ method, candidateCount: 1 + siblings.length }),
      interpretation: interpretationConfidence({ method, interpretations: kept.length ? kept : interpretations }),
      evidenceCoverage: evidenceCoverageConfidence({ entity: routed.entity, interpretations }),
      inventoryRepresentation: null, // filled by the API layer against live inventory
    };
    return buildInterpretationResult({
      ...base, method, entity: routed.entity,
      interpretations: kept.length ? kept : interpretations,
      alternatives: siblings,
      confidence: conf,
      assumptions: [
        ...(siblings.length ? [`"${nq}" could also mean ${siblings.map((s) => s.name).join(" or ")}`] : []),
        // Only claim a hiding when one actually happened: some but not all
        // readings were rejected. When ALL were rejected we fall back to the
        // full list (kept.length ? kept : interpretations) and hide nothing,
        // so the claim would be false (audit #25).
        ...(kept.length > 0 && kept.length < interpretations.length ? ["a previously rejected reading was hidden for you"] : []),
      ],
      flaggedForResearch: false,
      personalized: routed.personalized,
    });
  }

  // Layer 2 — composition first: the query CONTAINS ≥2 known concepts.
  const containedParts = scan.contained;
  const decomposed = decompose(nq);
  const compositionParts = decomposed.length >= 2 ? decomposed
    : containedParts.length >= 2 ? containedParts.map(({ record, viaKey }) => ({ span: viaKey, record })) : [];

  // Layer 2b — ambiguity: the query is shorthand for multiple candidates.
  if (!compositionParts.length) {
    const alternatives = scan.narrower.slice(0, MAX_ALTERNATIVES).map(({ record, viaKey }) => ({
      name: record.name, kind: record.kind, via: viaKey,
      feedbackId: interpretationFeedbackId("ambiguous", record.name),
    })).filter((a) => !rejected.has(a.name));
    if (alternatives.length >= 2) {
      const method = "ambiguous";
      const conf = {
        entityResolution: entityResolutionConfidence({ method, candidateCount: alternatives.length }),
        interpretation: interpretationConfidence({ method, interpretations: [] }),
        evidenceCoverage: 0.7,
        inventoryRepresentation: null,
      };
      return buildInterpretationResult({
        ...base, method, entity: null, alternatives, interpretations: [],
        confidence: conf,
        assumptions: [`"${nq}" matches ${alternatives.length} distinct references — pick one`],
        flaggedForResearch: false, personalized: false,
      });
    }
    const single = alternatives.length === 1
      ? scan.narrower.find((c) => c.record.name === alternatives[0].name)
      : scan.contained.length === 1 ? scan.contained[0] : null;
    if (single) return resolvedVia("recovered", base, single.record, { distance: 0, nq, rejected, matchedKey: single.viaKey });
  }

  // Layer 3 — compound decomposition.
  // Era-qualified references beat composition (Aug 5): "david bowie berlin
  // era" is not david bowie × berlin — the remaining words name one of the
  // entity's OWN readings, so the user qualified a single reference. Only
  // fires when exactly ONE candidate entity era-matches its leftover tokens;
  // any ambiguity falls through to the existing composition unchanged.
  const parts = compositionParts;
  if (parts.length >= 2 && process.env.SEARCH_ERA_TARGETING !== "0") {
    const uniq = new Map();
    for (const { record, viaKey } of [...scan.contained, ...parts.map((p) => ({ record: p.record, viaKey: p.span || p.record.name }))]) {
      if (!uniq.has(record.name)) uniq.set(record.name, { record, viaKey });
    }
    let eraMatched = [];
    for (const { record, viaKey } of uniq.values()) {
      const era = targetEraInterpretation(nq, viaKey, record.interpretations || []);
      if (era.targeted) eraMatched.push({ record, viaKey });
    }
    if (eraMatched.length > 1) {
      // "k-pop idol airport idol" era-matches both "k-pop idol" and "k-pop";
      // the entity whose name claims MORE of the query is the reference the
      // user qualified. Only a unique longest key decides — a true tie stays
      // ambiguous and composition proceeds.
      const longest = Math.max(...eraMatched.map((m) => m.viaKey.length));
      const top = eraMatched.filter((m) => m.viaKey.length === longest);
      eraMatched = top.length === 1 ? top : [];
    }
    if (eraMatched.length === 1) {
      return resolvedVia("recovered", base, eraMatched[0].record, { distance: 0, nq, rejected, matchedKey: eraMatched[0].viaKey });
    }
  }
  if (parts.length >= 2) {
    const tags = {};
    for (const { record } of parts) {
      for (const i of record.interpretations || []) {
        for (const t of i.tags || []) tags[t.toUpperCase()] = Math.max(tags[t.toUpperCase()] || 0, Number(i.confidence) || 0.4);
      }
    }
    const method = "composed";
    return buildInterpretationResult({
      ...base, method, entity: null,
      alternatives: parts.map(({ record }) => ({
        name: record.name, kind: record.kind, via: "composition",
        feedbackId: interpretationFeedbackId("composed", record.name),
      })),
      interpretations: [], attributes: { tags },
      confidence: {
        entityResolution: entityResolutionConfidence({ method }),
        interpretation: interpretationConfidence({ method, interpretations: [] }),
        evidenceCoverage: 0.6, inventoryRepresentation: null,
      },
      assumptions: [`read as a composition of ${parts.map((p) => p.record.name).join(" + ")} — an inference, not a documented aesthetic`],
      flaggedForResearch: shouldFlagForResearch({ method, interpretation: 0.6 }),
      personalized: false,
    });
  }

  // Layer 4 — misspelling recovery.
  const recovered = recover(nq);
  if (recovered) {
    return resolvedVia("recovered", base, recovered.record, { distance: recovered.distance, nq, rejected, matchedKey: recovered.key });
  }

  // Layer 5 — lexicon best-effort attributes.
  const vec = nq ? inferTags(nq) : null;
  const tagEntries = Object.entries((vec && (vec.long || vec)) || {}).filter(([, v]) => typeof v === "number" && v > 0.05);
  if (tagEntries.length) {
    const tags = Object.fromEntries(tagEntries.map(([t, v]) => [t.toUpperCase(), +Math.min(1, v).toFixed(2)]));
    const method = "lexical";
    return buildInterpretationResult({
      ...base, method, entity: null, alternatives: [], interpretations: [],
      attributes: { tags },
      confidence: {
        entityResolution: entityResolutionConfidence({ method }),
        interpretation: interpretationConfidence({ method, interpretations: [] }),
        evidenceCoverage: 0.3, inventoryRepresentation: null,
      },
      assumptions: ["no known cultural reference — reading the words as style attributes"],
      flaggedForResearch: true, personalized: false,
    });
  }

  // Layer 6 — honest fallthrough.
  return buildInterpretationResult({
    ...base, method: "none", entity: null, alternatives: [], interpretations: [],
    confidence: { entityResolution: 0, interpretation: 0, evidenceCoverage: 0, inventoryRepresentation: null },
    assumptions: [], flaggedForResearch: nq.length >= 3, personalized: false,
  });
}

async function resolvedVia(method, base, rec, { distance, nq, rejected, matchedKey = null }) {
  const routed = await interpretQuery(rec.name, null);
  let interpretations = (routed.interpretations || []).map((i) => ({
    ...i, feedbackId: interpretationFeedbackId(method, i.id),
  })).filter((i) => !rejected.has(i.id));
  const era = targetEraInterpretation(nq, matchedKey || rec.name, interpretations);
  interpretations = era.interpretations;
  const conf = {
    entityResolution: entityResolutionConfidence({ method, distance, queryLength: nq.length }),
    interpretation: interpretationConfidence({ method, interpretations }),
    evidenceCoverage: evidenceCoverageConfidence({ entity: routed.entity, interpretations }),
    inventoryRepresentation: null,
  };
  return buildInterpretationResult({
    ...base, method, entity: routed.entity, interpretations, alternatives: [],
    confidence: conf,
    assumptions: [
      `interpreted as "${rec.name}"${distance ? ` (recovered from "${nq}")` : ""} — correct this if wrong`,
      ...(era.targeted ? [`your words pointed at the "${era.targeted}" reading — it leads`] : []),
    ],
    flaggedForResearch: shouldFlagForResearch({ method, interpretation: conf.interpretation }),
    personalized: false,
  });
}

export { confidenceBand };
