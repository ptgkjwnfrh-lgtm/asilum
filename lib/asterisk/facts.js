// lib/asterisk/facts.js
// Asterisk AI — learned-fact pipeline. External research / model output lands
// here as STAGED claims with sources and scores; it NEVER writes directly to
// trusted records. Facts move through an explicit lifecycle, transitions are
// validated, and every change is timestamped. Unknown stays unknown until
// evidence exists.

import { createLearnedFact, updateLearnedFactStatus, listLearnedFacts } from "../db/production.js";
import { safeExternalUrl } from "../url.js";

export const FACT_STATUSES = [
  "discovered", "pending_verification", "machine_reviewed",
  "human_reviewed", "approved", "rejected", "superseded", "archived",
];

// Allowed lifecycle moves — no jumping straight from discovered to approved.
const TRANSITIONS = {
  discovered: ["pending_verification", "rejected", "archived"],
  pending_verification: ["machine_reviewed", "rejected", "archived"],
  machine_reviewed: ["human_reviewed", "approved", "rejected", "archived"],
  human_reviewed: ["approved", "rejected", "archived"],
  approved: ["superseded", "archived"],
  rejected: ["archived"],
  superseded: ["archived"],
  archived: [],
};

const score = (v) => (typeof v === "number" && v >= 0 && v <= 1 ? +v.toFixed(3) : 0);

/**
 * Record a claim. Sources are required metadata, not optional decoration:
 * a claim with no sources stays at reliability 0 and cannot be approved.
 * @returns {ok, fact} | {ok:false, error}
 */
export async function recordFact(input = {}) {
  const claim = String(input.claim || "").trim().slice(0, 500);
  const entityType = String(input.entityType || "").trim().slice(0, 40);
  const entityId = String(input.entityId || "").trim().slice(0, 80);
  const claimType = String(input.claimType || "").trim().slice(0, 60);
  if (!claim || !entityType || !entityId || !claimType) {
    return { ok: false, error: "claim, entityType, entityId, claimType required" };
  }
  const sourceUrls = (Array.isArray(input.sourceUrls) ? input.sourceUrls : [])
    .map((u) => safeExternalUrl(String(u))).filter(Boolean).slice(0, 10);
  // Structured claims (e.g. culture-entity proposals) ride in `payload` as
  // JSON — bounded like event payloads and REJECTED over the cap, never
  // truncated (a sliced JSON document is corruption, not thrift).
  let value = input.value == null ? null : String(input.value).slice(0, 300);
  if (input.payload !== undefined) {
    const json = JSON.stringify(input.payload);
    if (Buffer.byteLength(json, "utf8") > 8192) return { ok: false, error: "payload exceeds 8 KiB" };
    value = json;
  }
  const fact = await createLearnedFact({
    entityType, entityId, claim, claimType,
    value,
    sourceUrls,
    sourceTypes: (Array.isArray(input.sourceTypes) ? input.sourceTypes : []).map((v) => String(v).slice(0, 80)).slice(0, 10),
    publicationDates: (Array.isArray(input.publicationDates) ? input.publicationDates : []).map((v) => String(v).slice(0, 40)).slice(0, 10),
    retrievedAt: input.retrievedAt || new Date().toISOString(),
    reliabilityScore: sourceUrls.length ? score(input.reliabilityScore) : 0,
    confidenceScore: score(input.confidenceScore),
    verificationStatus: "discovered",
    modelVersion: input.modelVersion || null,
  });
  return { ok: true, fact };
}

/**
 * Move a fact through the lifecycle. Approval REQUIRES at least one recorded
 * source and a reviewer identity — no anonymous, sourceless approvals.
 */
export async function reviewFact(id, nextStatus, reviewedBy = null) {
  if (!FACT_STATUSES.includes(nextStatus)) return { ok: false, error: "unknown status" };
  const [fact] = await listLearnedFacts({ id });
  if (!fact) return { ok: false, error: "fact not found" };
  const allowed = TRANSITIONS[fact.verificationStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return { ok: false, error: `illegal transition ${fact.verificationStatus} → ${nextStatus}` };
  }
  if (nextStatus === "approved") {
    if (!(fact.sourceUrls || []).length) return { ok: false, error: "cannot approve a fact with no sources" };
    if (!reviewedBy) return { ok: false, error: "approved requires reviewedBy" };
  }
  if (["human_reviewed", "rejected"].includes(nextStatus) && !reviewedBy) {
    return { ok: false, error: `${nextStatus} requires reviewedBy` };
  }
  const reviewer = reviewedBy == null ? null : String(reviewedBy).trim().slice(0, 120);
  if (["approved", "human_reviewed", "rejected"].includes(nextStatus) && !reviewer) {
    return { ok: false, error: `${nextStatus} requires reviewedBy` };
  }
  const updated = await updateLearnedFactStatus(id, nextStatus, reviewer, fact.verificationStatus);
  if (!updated) return { ok: false, error: "fact changed during review; reload and retry" };
  return { ok: true, fact: updated };
}

export { listLearnedFacts };
