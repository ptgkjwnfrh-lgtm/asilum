// lib/asterisk/research.js
// Asterisk AI — research-ingestion pipeline (docs/ASTERISK-AI.md §9, P2 v1).
// The controlled path from web research to culture records — and the only
// path: proposals land as STAGED learned_facts, walk the reviewed lifecycle
// (discovered → … → approved, lib/asterisk/facts.js), and only APPROVED
// proposals are compiled — by scripts/compile-culture-research.mjs, into
// lib/asterisk/culture.research.json, landing as a reviewable git diff.
// Nothing in this module can touch a trusted record directly, and nothing
// here invents claims: every proposal carries source URLs or it cannot be
// approved (enforced downstream by reviewFact).
//
// v1 scope, honestly stated:
//   - proposals are hand-built (admin asterisk.research.propose) or model-
//     drafted behind AI_RESEARCH_ENABLED — model output is validated against
//     the same schema, confidence-capped, and lands as `discovered` like
//     everything else. No gate, no extraction: notImplemented, never faked.
//   - proposals may NOT carry trend lifecycle calls — those live solely in
//     lib/asterisk/trends.js behind their own human review (Day 14).

import { TAGS } from "../brain/tags.js";
import { CULTURE, cultureIndex } from "./culture.js";
import { recordFact, reviewFact, listLearnedFacts } from "./facts.js";
import { isPermittedSource } from "../ingest/sources.js";
import { aiEnabled } from "../ai/config.js";
import { notImplemented } from "../ai/contract.js";

export const CULTURE_PROPOSAL_ENTITY_TYPE = "culture-entity";
export const CULTURE_PROPOSAL_CLAIM_TYPE = "culture-entity-proposal";

// Proposals may only use kinds the curated catalog already speaks —
// new kinds are a curation decision, not a research submission.
export function allowedCultureKinds() {
  return [...new Set(CULTURE.map((rec) => rec.kind))].sort();
}

const PROPOSAL_CONFIDENCE_CAP = 0.8; // research never outranks curation
const SLUG = /^[a-z0-9][a-z0-9 '&.-]{1,59}$/;

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * Validate a proposed culture entity against the live catalog and the live
 * brain tag space. Returns { ok, proposal } with a normalized copy, or
 * { ok: false, error } naming the first defect — a proposal is atomic.
 */
export function validateCultureProposal(input = {}) {
  const kinds = allowedCultureKinds();
  const kind = clean(input.kind, 40).toLowerCase();
  if (!kinds.includes(kind)) return { ok: false, error: `kind must be one of: ${kinds.join(", ")}` };

  const name = clean(input.name, 60).toLowerCase();
  if (!SLUG.test(name)) return { ok: false, error: "name must be 2-60 chars, lowercase [a-z0-9 '&.-]" };

  const index = cultureIndex();
  if (index.has(name)) return { ok: false, error: `"${name}" already exists in the culture catalog` };

  const aliases = (Array.isArray(input.aliases) ? input.aliases : [])
    .map((a) => clean(a, 60).toLowerCase()).filter(Boolean).slice(0, 8);
  for (const alias of aliases) {
    if (!SLUG.test(alias)) return { ok: false, error: `alias "${alias}" is malformed` };
    if (index.has(alias)) return { ok: false, error: `alias "${alias}" collides with the culture catalog` };
  }

  if (input.trend !== undefined) {
    return { ok: false, error: "proposals may not carry trend lifecycle calls — those live in lib/asterisk/trends.js behind their own review" };
  }

  const interps = Array.isArray(input.interpretations) ? input.interpretations : [];
  if (interps.length < 1 || interps.length > 6) {
    return { ok: false, error: "1-6 interpretations required" };
  }
  const interpretations = [];
  const seenIds = new Set();
  for (const raw of interps) {
    const id = clean(raw?.id, 90).toLowerCase();
    if (!id.startsWith(name + "/") || id.length <= name.length + 1) {
      return { ok: false, error: `interpretation id "${id}" must be "${name}/<slug>"` };
    }
    if (seenIds.has(id)) return { ok: false, error: `duplicate interpretation id "${id}"` };
    seenIds.add(id);
    const label = clean(raw?.label, 60);
    const summary = clean(raw?.summary, 200);
    if (!label || !summary) return { ok: false, error: `${id}: label and summary required` };
    const tags = (Array.isArray(raw?.tags) ? raw.tags : []).map((t) => clean(t, 20).toLowerCase());
    if (tags.length < 1 || tags.length > 5) return { ok: false, error: `${id}: 1-5 tags required` };
    for (const t of tags) {
      if (!TAGS.includes(t.toUpperCase())) {
        return { ok: false, error: `${id}: tag "${t}" is not in the live brain tag space` };
      }
    }
    const confidence = Number(raw?.confidence);
    if (!(confidence > 0 && confidence <= PROPOSAL_CONFIDENCE_CAP)) {
      return { ok: false, error: `${id}: confidence must be in (0, ${PROPOSAL_CONFIDENCE_CAP}] for research proposals` };
    }
    interpretations.push({
      id, label, type: clean(raw?.type, 30) || kind, summary, tags,
      colors: (Array.isArray(raw?.colors) ? raw.colors : []).map((c) => clean(c, 20).toLowerCase()).filter(Boolean).slice(0, 6),
      moods: (Array.isArray(raw?.moods) ? raw.moods : []).map((m) => clean(m, 20).toLowerCase()).filter(Boolean).slice(0, 6),
      confidence: +confidence.toFixed(2),
    });
  }

  return {
    ok: true,
    proposal: {
      kind, name, aliases,
      note: clean(input.note, 160) || null,
      interpretations,
    },
  };
}

/**
 * Stage a culture-entity proposal as a learned fact (status: discovered).
 * Source URLs are REQUIRED here — an unsourced proposal is refused at the
 * door rather than parked at reliability 0.
 */
export async function proposeCultureEntity(input = {}, meta = {}) {
  const validated = validateCultureProposal(input);
  if (!validated.ok) return validated;
  const sourceUrls = (Array.isArray(meta.sourceUrls) ? meta.sourceUrls : [])
    .map(String).filter((u) => /^https:\/\//.test(u));
  if (!sourceUrls.length) return { ok: false, error: "at least one https source URL required" };
  return recordFact({
    entityType: CULTURE_PROPOSAL_ENTITY_TYPE,
    entityId: validated.proposal.name,
    claim: `culture entity proposal: ${validated.proposal.name} (${validated.proposal.kind}, ${validated.proposal.interpretations.length} interpretations)`,
    claimType: CULTURE_PROPOSAL_CLAIM_TYPE,
    payload: validated.proposal,
    sourceUrls,
    sourceTypes: meta.sourceTypes,
    publicationDates: meta.publicationDates,
    reliabilityScore: meta.reliabilityScore,
    confidenceScore: Math.max(...validated.proposal.interpretations.map((i) => i.confidence)),
    modelVersion: meta.modelVersion || null,
  });
}

// The review queue and lifecycle moves are the shared fact machinery —
// re-exported so admin callers deal with one module.
export { reviewFact as reviewResearch };

export async function researchQueue({ status = null, limit = 100 } = {}) {
  const facts = await listLearnedFacts({ entityType: CULTURE_PROPOSAL_ENTITY_TYPE, status, limit });
  return facts.filter((f) => f.claimType === CULTURE_PROPOSAL_CLAIM_TYPE);
}

/**
 * APPROVED proposals, parsed and re-validated against the CURRENT catalog —
 * exactly what the compile script emits. A stored proposal that no longer
 * validates (e.g. its name was since curated by hand) is reported, not
 * silently included or dropped.
 */
export async function approvedCultureProposals() {
  const approved = await researchQueue({ status: "approved", limit: 500 });
  const records = [];
  const skipped = [];
  for (const fact of approved) {
    let parsed = null;
    try { parsed = JSON.parse(fact.value); } catch {}
    if (!parsed) { skipped.push({ id: fact.id, reason: "unparseable payload" }); continue; }
    const validated = validateCultureProposal(parsed);
    if (!validated.ok) { skipped.push({ id: fact.id, reason: validated.error }); continue; }
    records.push({
      ...validated.proposal,
      provenance: "research-approved-" + String(fact.reviewedBy || "unknown"),
      factId: fact.id,
      sourceUrls: fact.sourceUrls || [],
      approvedAt: fact.updatedAt || fact.createdAt || null,
    });
  }
  return { records, skipped };
}

/**
 * Guarded source fetch for the research workflow: exact-host allowlist
 * (INGEST_ALLOWED_HOSTS, default-deny), https-only, no redirects, bounded.
 * Returns a plain-text excerpt for the OPERATOR to read and cite — this
 * function asserts nothing about the content.
 */
export async function fetchResearchSource(url, { maxChars = 20000 } = {}) {
  if (!isPermittedSource(url)) return { ok: false, error: "source host not allowlisted (INGEST_ALLOWED_HOSTS)" };
  let res = null;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    return { ok: false, error: "fetch failed: " + (e?.name || "error") };
  }
  if (!res.ok) return { ok: false, error: `source responded ${res.status}` };
  const length = Number(res.headers.get("content-length") || 0);
  if (length > 2 * 1024 * 1024) return { ok: false, error: "response exceeds 2 MB" };
  const body = await res.text();
  if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) return { ok: false, error: "response exceeds 2 MB" };
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
  return { ok: true, url, chars: text.length, text };
}

/**
 * Model-assisted proposal drafting — HONESTLY gated. Until AI_RESEARCH_ENABLED
 * is on (and a provider is configured), this returns notImplemented; there is
 * no local heuristic pretending to read fashion journalism. When enabled it
 * must still land drafts through proposeCultureEntity like everyone else.
 */
export async function draftProposalsFromSource() {
  if (!aiEnabled("research")) {
    return notImplemented("asterisk.research.draft",
      "set AI_FEATURES_ENABLED=1 and AI_RESEARCH_ENABLED=1 with a configured provider; until then, submit proposals via asterisk.research.propose");
  }
  // Provider-backed extraction is Day 16+ work: prompt version, output
  // validation, and an evaluation set come first. Refuse rather than wing it.
  return notImplemented("asterisk.research.draft",
    "model extraction path not yet implemented — the gate exists, the prompt/validation work does not");
}

export const _internals = { PROPOSAL_CONFIDENCE_CAP };
