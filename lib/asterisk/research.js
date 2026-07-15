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

import { CULTURE, cultureIndex } from "./culture.js";
import { normalizeCultureProposal, RESEARCH_CONFIDENCE_CAP } from "./cultureSchema.js";
import { recordFact, reviewFact, listLearnedFacts } from "./facts.js";
import { isPermittedSource } from "../ingest/sources.js";
import { aiEnabled } from "../ai/config.js";
import { notImplemented } from "../ai/contract.js";
import { readBytes } from "../security/http.js";
import { safeExternalUrl } from "../url.js";

export const CULTURE_PROPOSAL_ENTITY_TYPE = "culture-entity";
export const CULTURE_PROPOSAL_CLAIM_TYPE = "culture-entity-proposal";

// Proposals may only use kinds the curated catalog already speaks —
// new kinds are a curation decision, not a research submission.
export function allowedCultureKinds() {
  return [...new Set(CULTURE.map((rec) => rec.kind))].sort();
}

/**
 * Validate a proposed culture entity against the live catalog and the live
 * brain tag space. Returns { ok, proposal } with a normalized copy, or
 * { ok: false, error } naming the first defect — a proposal is atomic.
 */
export function validateCultureProposal(input = {}) {
  return normalizeCultureProposal(input, {
    allowedKinds: new Set(allowedCultureKinds()), takenNames: cultureIndex(),
  });
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
    .map((u) => safeExternalUrl(String(u))).filter(Boolean);
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

// Keep the research endpoint scoped to research facts. Without this guard, an
// operator who pasted the wrong ID could advance an unrelated learned fact.
export async function reviewResearch(id, nextStatus, reviewedBy = null) {
  const [fact] = await listLearnedFacts({ id, limit: 1 });
  if (!fact || fact.entityType !== CULTURE_PROPOSAL_ENTITY_TYPE ||
      fact.claimType !== CULTURE_PROPOSAL_CLAIM_TYPE) {
    return { ok: false, error: "research proposal not found" };
  }
  return reviewFact(id, nextStatus, reviewedBy);
}

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
  const approved = [];
  for (let offset = 0; ; offset += 500) {
    const page = await listLearnedFacts({ entityType: CULTURE_PROPOSAL_ENTITY_TYPE,
      status: "approved", limit: 500, offset });
    approved.push(...page.filter((f) => f.claimType === CULTURE_PROPOSAL_CLAIM_TYPE));
    if (page.length < 500) break;
  }
  const records = [];
  const skipped = [];
  const compiledNames = new Set();
  for (const fact of approved) {
    let parsed = null;
    try { parsed = JSON.parse(fact.value); } catch {}
    if (!parsed) { skipped.push({ id: fact.id, reason: "unparseable payload" }); continue; }
    if (parsed.name !== fact.entityId) {
      skipped.push({ id: fact.id, reason: "payload name does not match staged entity" }); continue;
    }
    const validated = validateCultureProposal(parsed);
    if (!validated.ok) { skipped.push({ id: fact.id, reason: validated.error }); continue; }
    const names = [validated.proposal.name, ...validated.proposal.aliases];
    if (names.some((name) => compiledNames.has(name))) {
      skipped.push({ id: fact.id, reason: "name or alias collides with another approved proposal" }); continue;
    }
    for (const name of names) compiledNames.add(name);
    const reviewer = String(fact.reviewedBy || "unknown").trim().toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "unknown";
    records.push({
      ...validated.proposal,
      provenance: "research-approved-" + reviewer,
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
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (!/^(?:text\/(?:html|plain)|application\/xhtml\+xml)\b/.test(type)) {
    return { ok: false, error: "source must return HTML or plain text" };
  }
  let body;
  try {
    body = new TextDecoder().decode(await readBytes(res, 2 * 1024 * 1024));
  } catch (e) {
    return { ok: false, error: e instanceof RangeError ? "response exceeds 2 MB" : "response read failed" };
  }
  maxChars = Math.max(1, Math.min(100_000, Number.isFinite(Number(maxChars)) ? Math.trunc(Number(maxChars)) : 20_000));
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

export const _internals = { PROPOSAL_CONFIDENCE_CAP: RESEARCH_CONFIDENCE_CAP };
