// tests/brand-cases.test.js — brand verification/impersonation case
// machinery (Feature G groundwork), mem mode. The status machine is
// enforced, trust outcomes demand evidence, transitions are CAS-guarded,
// and every move lands in the append-only ledger.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CASE_KINDS, TRANSITIONS, brandVerificationEnabled,
  validateOpenCase, validateTransition, validateEvidence,
} from "../lib/brands/cases.js";
import {
  insertBrandCase, getBrandCase, applyBrandCaseTransition,
  listBrandCases, listBrandCaseEvents,
} from "../lib/db/production.js";

test("badge flag defaults OFF — machinery is operator tooling only", () => {
  assert.equal(brandVerificationEnabled(), false);
  process.env.BRAND_VERIFICATION_ENABLED = "1";
  assert.equal(brandVerificationEnabled(), true);
  delete process.env.BRAND_VERIFICATION_ENABLED;
});

test("open-case validation: kinds, names, subjects, evidence URLs", () => {
  const v = validateOpenCase({ kind: "verification", brandName: " Helmut Lang ", openedBy: "admin",
    evidence: { urls: ["https://helmutlang.com/about"] } });
  assert.equal(v.brandName, "Helmut Lang");
  assert.deepEqual(v.evidence.urls, ["https://helmutlang.com/about"]);
  assert.throws(() => validateOpenCase({ kind: "vibe-check", brandName: "x", openedBy: "a" }), TypeError);
  assert.throws(() => validateOpenCase({ kind: "verification", brandName: "", openedBy: "a" }), TypeError);
  assert.throws(() => validateOpenCase({ kind: "impersonation", brandName: "x", openedBy: "a",
    subjectType: "moodboard", subjectId: "1" }), TypeError);
  assert.throws(() => validateEvidence({ urls: ["http://insecure.example"] }), TypeError,
    "http evidence refused");
  assert.throws(() => validateEvidence({ urls: ["https://localhost/x"] }), TypeError,
    "private hosts refused");
});

test("machine: legal walk to verified, illegal jumps and cross-kind outcomes refused", async () => {
  const kase = await insertBrandCase(validateOpenCase({
    kind: "verification", brandName: "Case Study", openedBy: "admin" }));
  assert.equal(kase.status, "open");

  assert.throws(() => validateTransition(kase, { to: "verified", actor: "admin" }),
    /illegal transition/, "no jumping open -> verified");

  let t = validateTransition(kase, { to: "under_review", actor: "admin" });
  let moved = await applyBrandCaseTransition(kase.id, "open", t);
  assert.equal(moved.status, "under_review");

  assert.throws(() => validateTransition(moved, { to: "verified", actor: "admin" }),
    /at least one https evidence URL/, "verified demands evidence");
  assert.throws(() => validateTransition(moved, { to: "upheld", actor: "admin",
    evidence: { urls: ["https://example.com/proof"] } }),
    /impersonation outcome/, "kind guard holds");

  t = validateTransition(moved, { to: "verified", actor: "reviewer-1",
    evidence: { urls: ["https://example.com/proof"] } });
  moved = await applyBrandCaseTransition(moved.id, "under_review", t);
  assert.equal(moved.status, "verified");
  assert.deepEqual(moved.evidence.urls, ["https://example.com/proof"]);

  const events = await listBrandCaseEvents(moved.id);
  assert.deepEqual(events.map((e) => e.toStatus), ["open", "under_review", "verified"],
    "every move is in the ledger");
});

test("CAS: a competing move surfaces as case-moved, never a silent overwrite", async () => {
  const kase = await insertBrandCase(validateOpenCase({
    kind: "impersonation", brandName: "Faux Lang", openedBy: "admin",
    subjectType: "product", subjectId: "syn-0001" }));
  const t = validateTransition(kase, { to: "under_review", actor: "admin" });
  await applyBrandCaseTransition(kase.id, "open", t);
  await assert.rejects(() => applyBrandCaseTransition(kase.id, "open", t), /case-moved/);
});

test("impersonation walk: upheld needs evidence, enforced needs a resolution", async () => {
  let kase = await insertBrandCase(validateOpenCase({
    kind: "impersonation", brandName: "Faux Margiela", openedBy: "reporter-x",
    evidence: { urls: ["https://example.com/listing"] } }));
  kase = await applyBrandCaseTransition(kase.id, "open",
    validateTransition(kase, { to: "under_review", actor: "admin" }));
  kase = await applyBrandCaseTransition(kase.id, "under_review",
    validateTransition(kase, { to: "upheld", actor: "admin" }));
  assert.throws(() => validateTransition(kase, { to: "enforced", actor: "admin" }),
    /resolution/, "enforcement must say what was done");
  kase = await applyBrandCaseTransition(kase.id, "upheld",
    validateTransition(kase, { to: "enforced", actor: "admin", resolution: "listings delisted, source suspended" }));
  assert.equal(kase.status, "enforced");
  assert.equal(kase.resolution, "listings delisted, source suspended");
  assert.equal(kase.resolvedBy, "admin");

  const list = await listBrandCases({ kind: "impersonation", brandName: "faux margiela" });
  assert.equal(list.length, 1, "brand filter is case-insensitive");
});

test("vocabulary sanity: every transition target is a known status", () => {
  const known = new Set(Object.keys(TRANSITIONS));
  for (const [from, tos] of Object.entries(TRANSITIONS)) {
    for (const to of tos) assert.ok(known.has(to), `${from} -> ${to}`);
  }
  assert.deepEqual(CASE_KINDS, ["verification", "impersonation"]);
});
