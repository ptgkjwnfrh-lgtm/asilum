// lib/brands/cases.js — brand verification & impersonation cases (Feature G
// groundwork). The Shopify/OAuth half of Feature G is externally gated; this
// is the case machinery every claim must pass through regardless of how the
// evidence eventually arrives.
//
// Honesty rules (the learned_facts doctrine, applied to trust):
//   - The status machine is ENFORCED — no jumping open → verified.
//   - `verified` and `upheld` require at least one https evidence URL and a
//     named actor. There is no machine path to a verified badge.
//   - Every transition is CAS-guarded (expectedStatus) so competing
//     reviewers cannot double-move a case, and every move writes an
//     append-only brand_case_events row in the same transaction.
//   - BRAND_VERIFICATION_ENABLED gates PUBLIC badge surfaces only (none
//     ship here); the admin machinery works regardless.

import { safeExternalUrl } from "../url.js";

export const CASE_KINDS = Object.freeze(["verification", "impersonation"]);
export const SUBJECT_TYPES = Object.freeze(["brand", "product", "profile_room", "source"]);

// One vocabulary; kind-specific outcomes are guarded in validateTransition.
//   verification:  open → under_review → verified | rejected
//                  verified → revoked · rejected → appealed → under_review
//   impersonation: open → under_review → upheld | dismissed
//                  upheld → enforced · dismissed → appealed → under_review
export const TRANSITIONS = Object.freeze({
  open: ["under_review", "archived"],
  under_review: ["verified", "rejected", "upheld", "dismissed", "archived"],
  verified: ["revoked", "archived"],
  rejected: ["appealed", "archived"],
  upheld: ["enforced", "archived"],
  dismissed: ["appealed", "archived"],
  appealed: ["under_review", "archived"],
  enforced: ["archived"],
  revoked: ["archived"],
  archived: [],
});
export const CASE_STATUSES = Object.freeze(Object.keys(TRANSITIONS));

const VERIFICATION_ONLY = new Set(["verified", "revoked"]);
const IMPERSONATION_ONLY = new Set(["upheld", "dismissed", "enforced"]);
// Reaching a trust-granting outcome demands evidence on file.
const EVIDENCE_REQUIRED = new Set(["verified", "upheld"]);

export function brandVerificationEnabled() {
  return process.env.BRAND_VERIFICATION_ENABLED === "1";
}

function text(value, max, label) {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t.length || t.length > max) throw new TypeError(`${label} must be a 1-${max} char string`);
  return t;
}

// Evidence is {urls: [https...], note?} — every URL must survive
// safeExternalUrl (https, public host, no credentials).
export function validateEvidence(evidence) {
  if (evidence === undefined || evidence === null) return { urls: [] };
  if (typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("evidence must be an object");
  }
  const urls = [];
  const rawUrls = evidence.urls === undefined ? [] : evidence.urls;
  if (!Array.isArray(rawUrls) || rawUrls.length > 12) {
    throw new TypeError("evidence.urls must be an array of up to 12 URLs");
  }
  for (const raw of rawUrls) {
    const safe = safeExternalUrl(raw);
    if (!safe) throw new TypeError(`evidence URL refused: ${String(raw).slice(0, 80)}`);
    if (!urls.includes(safe)) urls.push(safe);
  }
  const out = { urls };
  if (evidence.note !== undefined) out.note = text(evidence.note, 500, "evidence.note");
  return out;
}

export function validateOpenCase({ kind, brandName, subjectType, subjectId, openedBy, evidence } = {}) {
  if (!CASE_KINDS.includes(kind)) throw new TypeError("kind must be verification or impersonation");
  const out = {
    kind,
    brandName: text(brandName, 120, "brandName"),
    openedBy: text(openedBy, 80, "openedBy"),
    evidence: validateEvidence(evidence),
    subjectType: null,
    subjectId: null,
  };
  if (subjectType !== undefined && subjectType !== null) {
    if (!SUBJECT_TYPES.includes(subjectType)) throw new TypeError("unknown subjectType");
    out.subjectType = subjectType;
    out.subjectId = text(subjectId, 80, "subjectId");
  }
  return out;
}

// Pure legality check — the DB layer runs the CAS + ledger write.
export function validateTransition(kase, { to, actor, evidence, resolution } = {}) {
  if (!kase) throw new TypeError("case required");
  const allowed = TRANSITIONS[kase.status] || [];
  if (!allowed.includes(to)) {
    throw new TypeError(`illegal transition ${kase.status} -> ${to}`);
  }
  if (kase.kind === "verification" && IMPERSONATION_ONLY.has(to)) {
    throw new TypeError(`${to} is an impersonation outcome — this is a verification case`);
  }
  if (kase.kind === "impersonation" && VERIFICATION_ONLY.has(to)) {
    throw new TypeError(`${to} is a verification outcome — this is an impersonation case`);
  }
  const out = { to, actor: text(actor, 80, "actor") };
  const mergedEvidence = evidence === undefined
    ? validateEvidence(kase.evidence)
    : validateEvidence(evidence);
  if (EVIDENCE_REQUIRED.has(to) && !mergedEvidence.urls.length) {
    throw new TypeError(`${to} requires at least one https evidence URL on file`);
  }
  if (evidence !== undefined) out.evidence = mergedEvidence;
  if (to === "enforced") {
    out.resolution = text(resolution, 500, "resolution — enforcement must say what was done");
  } else if (resolution !== undefined) {
    out.resolution = text(resolution, 500, "resolution");
  }
  return out;
}
