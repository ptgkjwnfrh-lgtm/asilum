import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCultureProposal, proposeCultureEntity, reviewResearch,
  researchQueue, approvedCultureProposals, allowedCultureKinds,
  draftProposalsFromSource,
} from "../lib/asterisk/research.js";
import { CULTURE, lookupCulture, validateCompiledResearchRecord } from "../lib/asterisk/culture.js";
import { recordFact } from "../lib/asterisk/facts.js";

const proposal = (over = {}) => ({
  kind: "aesthetic",
  name: "test-core",
  aliases: ["testcore wave"],
  note: "a synthetic aesthetic for the pipeline test",
  interpretations: [{
    id: "test-core/core", label: "test-core", type: "aesthetic",
    summary: "deliberately synthetic — exists only to walk the pipeline",
    tags: ["minimal", "tailored"], colors: ["grey"], moods: ["restrained"],
    confidence: 0.6,
  }],
  ...over,
});

const SOURCES = { sourceUrls: ["https://example.com/research"], reliabilityScore: 0.5 };

test("validation is atomic and names the defect", () => {
  assert.equal(validateCultureProposal(proposal()).ok, true);
  assert.match(validateCultureProposal(proposal({ kind: "planet" })).error, /kind must be one of/);
  assert.match(validateCultureProposal(proposal({ name: "opium" })).error, /already exists/);
  assert.match(validateCultureProposal(proposal({ aliases: ["gorpcore"] })).error, /collides/);
  assert.match(validateCultureProposal(proposal({ trend: { phase: "rising" } })).error, /trends\.js/);
  assert.match(validateCultureProposal(proposal({ interpretations: [] })).error, /1-6 interpretations/);
  assert.match(validateCultureProposal(proposal({
    interpretations: [{ ...proposal().interpretations[0], tags: ["cyberpunk"] }],
  })).error, /not in the live brain tag space/);
  assert.match(validateCultureProposal(proposal({
    interpretations: [{ ...proposal().interpretations[0], confidence: 0.95 }],
  })).error, /confidence/);
  assert.match(validateCultureProposal(proposal({
    interpretations: [{ ...proposal().interpretations[0], id: "wrong/core" }],
  })).error, /must be "test-core\//);
});

test("kinds come from the live catalog", () => {
  const kinds = allowedCultureKinds();
  assert.ok(kinds.includes("aesthetic"));
  assert.ok(kinds.includes("film"));
});

test("unsourced proposals are refused at the door", async () => {
  const r = await proposeCultureEntity(proposal(), { sourceUrls: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /source URL required/);
  const insecure = await proposeCultureEntity(proposal(), { sourceUrls: ["http://example.com/x"] });
  assert.equal(insecure.ok, false);
  const privateSource = await proposeCultureEntity(proposal(), { sourceUrls: ["https://localhost/x"] });
  assert.equal(privateSource.ok, false);
});

test("research review cannot mutate an unrelated learned fact", async () => {
  const unrelated = await recordFact({ entityType: "brand", entityId: "test-brand",
    claim: "unrelated test fact", claimType: "material", sourceUrls: ["https://example.com/fact"] });
  assert.equal(unrelated.ok, true);
  const reviewed = await reviewResearch(unrelated.fact.id, "pending_verification");
  assert.equal(reviewed.ok, false);
  assert.match(reviewed.error, /research proposal not found/);
});

test("payload cap is measured in UTF-8 bytes", async () => {
  const oversized = await recordFact({ entityType: "test", entityId: "utf8", claim: "payload cap",
    claimType: "test", payload: { text: "é".repeat(5000) } });
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /8 KiB/);
});

test("full lifecycle: propose → review → approve → compile shape (memory store)", async () => {
  const staged = await proposeCultureEntity(proposal(), SOURCES);
  assert.equal(staged.ok, true, staged.error);
  assert.equal(staged.fact.verificationStatus, "discovered");
  const id = staged.fact.id;

  // No jumping the queue: discovered → approved is illegal.
  const jump = await reviewResearch(id, "approved", "tester");
  assert.equal(jump.ok, false);

  for (const [status, reviewer] of [
    ["pending_verification", null], ["machine_reviewed", null], ["human_reviewed", "tester"], ["approved", "tester"],
  ]) {
    const r = await reviewResearch(id, status, reviewer);
    assert.equal(r.ok, true, `${status}: ${r.error}`);
  }

  const queue = await researchQueue({ status: "approved" });
  assert.ok(queue.some((f) => f.id === id));

  const { records, skipped } = await approvedCultureProposals();
  const rec = records.find((r) => r.name === "test-core");
  assert.ok(rec, "approved proposal compiles");
  assert.equal(rec.interpretations[0].confidence, 0.6);
  assert.match(rec.provenance, /^research-approved-/);
  assert.deepEqual(rec.sourceUrls, SOURCES.sourceUrls);
  assert.equal(skipped.length, 0);
});

test("an approved proposal whose name was since curated is skipped, loudly", async () => {
  // "olsen twins" exists in the curated catalog — a stored approved payload
  // for it must be reported as skipped, never merged over curation.
  const staged = await proposeCultureEntity(proposal({ name: "skip-me", aliases: [],
    interpretations: [{ ...proposal().interpretations[0], id: "skip-me/core" }] }), SOURCES);
  assert.equal(staged.ok, true, staged.error);
  const id = staged.fact.id;
  for (const [status, reviewer] of [
    ["pending_verification", null], ["machine_reviewed", null], ["approved", "tester"],
  ]) assert.equal((await reviewResearch(id, status, reviewer)).ok, true);
  // Corrupt the stored payload to simulate drift: rename to a curated entity.
  const { listLearnedFacts } = await import("../lib/asterisk/facts.js");
  const [fact] = await listLearnedFacts({ id });
  const payload = JSON.parse(fact.value);
  payload.name = "olsen twins";
  fact.value = JSON.stringify(payload); // memory-store object is live
  const { records, skipped } = await approvedCultureProposals();
  assert.ok(!records.some((r) => r.name === "olsen twins"));
  assert.ok(skipped.some((s) => s.id === id && /payload name does not match staged entity/.test(s.reason)));
});

test("model drafting is honestly gated off", async () => {
  const r = await draftProposalsFromSource();
  assert.equal(r.implemented, false);
});

test("curated records stay curated after the research merge runs at load", () => {
  // The shipped culture.research.json is empty; the loader's collision guard
  // means a curated name can never resolve to a research record.
  const rec = lookupCulture("olsen twins");
  assert.ok(rec);
  assert.match(rec.interpretations[0].provenance, /^curated/);
});

test("compiled research records fail closed on malformed trusted data", () => {
  const compiled = {
    ...proposal(), factId: "fact-test", provenance: "research-approved-tester",
    sourceUrls: ["https://example.com/research"],
  };
  const options = { kinds: new Set(CULTURE.map((record) => record.kind)), taken: new Set() };
  assert.equal(validateCompiledResearchRecord(compiled, options), null);
  assert.match(validateCompiledResearchRecord({ ...compiled,
    interpretations: [{ ...compiled.interpretations[0], tags: ["invented-tag"] }] }, options), /tags/);
  assert.match(validateCompiledResearchRecord({ ...compiled, sourceUrls: ["https://localhost/research"] }, options), /source/);
});
