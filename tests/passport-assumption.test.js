// tests/passport-assumption.test.js — the influenced-assumption clause (r10).
// Mem-mode: the clause must be inert for anonymous users, inert on
// garment-noun queries, honest about why it declined, kill-switchable, and
// must never thin the rack below its floor.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveSearchAssumption, applyPassportAssumption, assumptionEnabled } from "../lib/search/passportAssumption.js";
import { saveProfile } from "../lib/db/index.js";

const GLAM_UID = "u-test-assumption-glam";

test("anonymous users keep the broad slate", async () => {
  const resolved = await resolveSearchAssumption("madonna", null);
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, "anonymous");
});

test("garment-noun queries never narrow — literal category evidence wins", async () => {
  await saveProfile(GLAM_UID, { long: { SEDUCTIVE: 3, STATEMENT: 2.5 }, session: {}, _meta: {} });
  const resolved = await resolveSearchAssumption("madonna dress", GLAM_UID);
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, "garment-noun query");
});

test("non-cultural queries decline honestly", async () => {
  const resolved = await resolveSearchAssumption("zzzq unmapped phrase", GLAM_UID);
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, "no cultural entity");
});

test("a taste-overlapping Passport applies the taste-favored reading", async () => {
  await saveProfile(GLAM_UID, { long: { SEDUCTIVE: 3, STATEMENT: 2.5 }, session: {}, _meta: {} });
  const resolved = await resolveSearchAssumption("madonna", GLAM_UID);
  assert.equal(resolved.applied, true, `declined: ${resolved.reason}`);
  assert.equal(resolved.entity, "madonna");
  assert.ok(resolved.tasteAffinity > 0);
  assert.ok(resolved.tags.includes("SEDUCTIVE") || resolved.tags.includes("STATEMENT"));
});

test("a flat Passport is influence-free", async () => {
  const uid = "u-test-assumption-flat";
  await saveProfile(uid, { long: {}, session: {}, _meta: {} });
  const resolved = await resolveSearchAssumption("madonna", uid);
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, "no taste overlap");
});

test("applyPassportAssumption narrows to tag hits but never below the floor", () => {
  const mk = (id, tags) => ({ id, tags });
  const slate = [
    ...Array.from({ length: 8 }, (_, i) => mk(`hit-${i}`, { SEDUCTIVE: 0.7 })),
    ...Array.from({ length: 8 }, (_, i) => mk(`miss-${i}`, { GORP: 0.7 })),
  ];
  const assumption = { applied: true, tags: ["SEDUCTIVE"], reason: "taste-favored reading" };
  const applied = applyPassportAssumption(slate, assumption);
  assert.equal(applied.items.length, 8);
  assert.ok(applied.items.every((it) => it.id.startsWith("hit-")));

  const thin = slate.slice(0, 3).concat(slate.slice(8));
  const declined = applyPassportAssumption(thin, assumption);
  assert.equal(declined.items.length, thin.length, "thin narrowing must fall back to the broad slate");
  assert.equal(declined.assumption.applied, false);
  assert.equal(declined.assumption.reason, "narrowed slate too thin");
});

test("SEARCH_PASSPORT_ASSUMPTION=0 kills the clause", async () => {
  process.env.SEARCH_PASSPORT_ASSUMPTION = "0";
  try {
    assert.equal(assumptionEnabled(), false);
    const resolved = await resolveSearchAssumption("madonna", GLAM_UID);
    assert.equal(resolved.applied, false);
    assert.equal(resolved.reason, "disabled");
  } finally {
    delete process.env.SEARCH_PASSPORT_ASSUMPTION;
  }
});
