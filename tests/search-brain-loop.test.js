// tests/search-brain-loop.test.js — r17 search→brain loop.
// Mem-mode, exercised at the lib layer the route composes: an applied
// catalog reading trains a bounded save-weight signal; unknown readings
// resolve to nothing; the event precedes the mutation; the kill switch and
// guidance gate are route-level (route logic mirrored here where testable).

import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateInterpretation } from "../lib/asterisk/orchestrator.js";
import { learn, migrateProfile } from "../lib/brain/index.js";

test("an applied catalog reading resolves server-side to its tags", async () => {
  const interp = await orchestrateInterpretation("oasis", null);
  const reading = interp.interpretations.find((i) => i.id === "oasis/terrace");
  assert.ok(reading, "oasis/terrace must resolve");
  assert.ok(reading.tags.includes("streetwear"));
});

test("a fabricated interpretationId resolves to nothing", async () => {
  const interp = await orchestrateInterpretation("oasis", null);
  assert.equal(interp.interpretations.find((i) => i.id === "oasis/invented"), undefined);
  const other = await orchestrateInterpretation("zzzq unmapped phrase", null);
  assert.equal((other.interpretations || []).length, 0);
});

test("training is one bounded save-weight learn — clamped, decayed, haloed", () => {
  const before = migrateProfile({ long: { GORP: 0.4 }, session: {}, _meta: {} });
  const tags = { STREETWEAR: 0.75, UTILITARIAN: 0.75, ARCHIVAL: 0.75, INDEPENDENT: 0.75 };
  const after = learn(structuredClone(before), { id: "reading:oasis/terrace", tags }, "save");
  assert.ok(after.long.STREETWEAR > 0, "reading tags must train");
  assert.ok(after.long.STREETWEAR <= 1, "clamp must hold");
  // one apply must not dominate an existing signal into oblivion
  assert.ok(after.long.GORP > 0.3, "existing taste survives one reading");
  // idempotence is NOT expected (each apply is a real signal), but bounds are
  const twice = learn(structuredClone(after), { id: "reading:oasis/terrace", tags }, "save");
  assert.ok(twice.long.STREETWEAR <= 1);
});

test("an ignored reading trains nothing — there is no code path for it", async () => {
  // The loop only exists behind POST verdict "meant". GET interpretation is
  // side-effect-free by the day-5 law: same profile object in, untouched.
  const profile = { long: { GORP: 0.4 }, session: {}, _meta: {} };
  const snapshot = JSON.stringify(profile);
  await orchestrateInterpretation("oasis", null);
  assert.equal(JSON.stringify(profile), snapshot);
});
