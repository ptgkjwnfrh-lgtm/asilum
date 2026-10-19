// lib/asterisk/unknownQueries.js
// Asterisk AI — unknown-query aggregation (handoff Feature A, Phase 1).
// An unresolved or research-flagged query becomes a normalized, demand-
// counted record — nothing more. Promotion into research is an ADMIN action
// through the reviewed learned_facts pipeline; one adversarial query can
// never trigger automatic permanent learning.
//
// Recording is flag-gated (ASTERISK_UNKNOWN_QUERIES_ENABLED) until the
// owner sets retention (docs/DATA-INVENTORY.md, DRAFT 180 days).

import { createHash } from "node:crypto";
import {
  recordUnknownQuery, listUnknownQueries, updateUnknownQueryStatus,
} from "../db/production.js";

const truthy = (v) => v === "true" || v === "1";
/** Feature flag: is the unknown-query ledger recording? OFF BY DEFAULT — this
 *  one opts IN (explicit "true"/"1"), unlike the BRAIN_* flags, because it
 *  starts a store of what people searched for and did not find. */
export function unknownQueriesEnabled() {
  return truthy(process.env.ASTERISK_UNKNOWN_QUERIES_ENABLED);
}

// The documented demand bar before a query is even ELIGIBLE for research
// promotion (repeated demand from distinct identities — handoff rule 3).
export const RESEARCH_DEMAND_THRESHOLD = 3;

// Abuse screening: bounded length, must contain a word character, no
// control chars, not an obvious repetition blob.
export function screenUnknownQuery(nq) {
  if (typeof nq !== "string") return false;
  if (nq.length < 3 || nq.length > 200) return false;
  if (!/[\p{L}\p{N}]/u.test(nq)) return false;
  if (/[\u0000-\u001f]/.test(nq)) return false;
  const squashed = nq.replace(/(.)\1{4,}/g, "$1");
  if (squashed.length < Math.max(3, nq.length / 4)) return false;
  return true;
}

/**
 * Record an unresolved/flagged query. Identity is hashed — the table holds
 * demand shape, not a browsing log. Fire-and-forget safe: never throws.
 */
export async function noteUnknownQuery(nq, identity, method = "none") {
  try {
    if (!unknownQueriesEnabled()) return null;
    if (!screenUnknownQuery(nq)) return null;
    const identityHash = createHash("sha256").update(String(identity || "anonymous")).digest("hex");
    return await recordUnknownQuery(nq, identityHash, method);
  } catch {
    return null;
  }
}

/**
 * The review queue, each row tagged `researchEligible`.
 *
 * Eligibility is repeated demand from DISTINCT IDENTITIES, not raw count — one
 * person searching the same thing thirty times is one person's interest, and
 * counting hits instead would let a single user set the research agenda.
 */
export async function unknownQueryQueue({ status = "observed", limit = 50 } = {}) {
  const rows = await listUnknownQueries({ status, limit });
  return rows.map((r) => ({ ...r, researchEligible: r.distinctIdentities >= RESEARCH_DEMAND_THRESHOLD }));
}

/**
 * Admin promotion: marks research_created and hands the operator the
 * normalized query. The actual proposal still travels the FULL reviewed
 * pipeline (asterisk.research.propose → lifecycle → compile) — this
 * function grants no trust and writes no knowledge.
 */
export async function promoteUnknownQuery(id, reviewedBy) {
  if (!reviewedBy) return { ok: false, error: "reviewedBy required" };
  const row = await updateUnknownQueryStatus(id, "research_created", {
    reviewedBy,
    minimumDistinctIdentities: RESEARCH_DEMAND_THRESHOLD,
    expectedStatus: "observed",
  });
  if (!row) return {
    ok: false,
    error: `unknown query must be observed with at least ${RESEARCH_DEMAND_THRESHOLD} distinct identities`,
  };
  return { ok: true, unknownQuery: row, next: "submit a sourced proposal via asterisk.research.propose, then mark resolved" };
}

/** Close a query as answered. `reviewedBy` is required — every state change
 *  here names the person who made it. Optionally links the research fact that
 *  answered it. Returns `{ ok, ... }`; it never throws. */
export async function resolveUnknownQuery(id, reviewedBy, researchFactId = null) {
  if (!reviewedBy) return { ok: false, error: "reviewedBy required" };
  const row = await updateUnknownQueryStatus(id, "resolved", { reviewedBy, researchFactId });
  return row ? { ok: true, unknownQuery: row } : { ok: false, error: "unknown query not found" };
}

/** Close a query as not worth answering — noise, abuse, or out of scope.
 *  Also requires `reviewedBy`: a dismissal is a decision, and the ledger keeps
 *  who made it. */
export async function dismissUnknownQuery(id, reviewedBy) {
  if (!reviewedBy) return { ok: false, error: "reviewedBy required" };
  const row = await updateUnknownQueryStatus(id, "dismissed", { reviewedBy });
  return row ? { ok: true, unknownQuery: row } : { ok: false, error: "unknown query not found" };
}
