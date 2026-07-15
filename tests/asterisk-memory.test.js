// tests/asterisk-memory.test.js — Asterisk memory facade (ADR-001 v1).
// Mem-mode: contract shape, measurements privacy (status only, never raw
// values), preferences validation, follows CRUD + cap, purge and adoption
// coverage of the two v14 domains.

import { test } from "node:test";
import assert from "node:assert/strict";

import { asteriskMemory, MEMORY_CONTRACT_VERSION, MEMORY_SECTIONS } from "../lib/asterisk/memory.js";
import {
  saveMemoryPreferences, getMemoryPreferences,
  setFollow, listFollows,
  saveUserMeasurements, purgePersonalizationData, adoptAccountData,
} from "../lib/db/production.js";

const U = "u-memory-test-1";

test("facade returns the versioned contract with all sections", async () => {
  const r = await asteriskMemory(U);
  assert.equal(r.ok, true);
  const m = r.memory;
  assert.equal(m.contractVersion, MEMORY_CONTRACT_VERSION);
  for (const key of ["explicit", "inferred", "global", "uncertainty", "controls", "preferences"]) {
    assert.ok(m[key], `missing ${key}`);
  }
  assert.equal(m.explicit.craving.persisted, false);
  assert.ok(Array.isArray(m.uncertainty.openQuestions));
  assert.ok(m.controls.forget.every((f) => f.endpoint.startsWith("/api/")));
});

test("facade requires a user", async () => {
  const r = await asteriskMemory("");
  assert.equal(r.ok, false);
});

test("measurements surface presence only — raw values never appear", async () => {
  const user = "u-memory-meas";
  await saveUserMeasurements(user, {
    usualSize: "M", preferredUnit: "in",
    inches: { chest: 39, waist: 32, hips: 38, inseam: 31, height: 70 },
  });
  const r = await asteriskMemory(user);
  assert.equal(r.memory.explicit.measurements.set, true);
  const flat = JSON.stringify(r.memory);
  for (const raw of [39, 32, 38, 31, 70]) {
    assert.ok(!new RegExp(`\\b${raw}\\b`).test(flat.replace(/"signalCount":\d+/, "")),
      `raw measurement ${raw} leaked into the memory payload`);
  }
  await purgePersonalizationData(user);
});

test("preferences roundtrip through the facade", async () => {
  await saveMemoryPreferences(U, ["global"]);
  const r = await asteriskMemory(U);
  assert.deepEqual(r.memory.preferences.hiddenSections, ["global"]);
  await saveMemoryPreferences(U, []);
  assert.deepEqual((await getMemoryPreferences(U)).hiddenSections, []);
});

test("MEMORY_SECTIONS is the drawer's exact section list", () => {
  assert.deepEqual([...MEMORY_SECTIONS], ["explicit", "inferred", "global", "uncertainty"]);
});

test("follows: set, list newest-first, unset, kind validation, cap", async () => {
  const user = "u-memory-follows";
  await setFollow(user, "brand", "Auralee", true);
  await setFollow(user, "user", "@vex.archive", true);
  let follows = await listFollows(user);
  assert.equal(follows.length, 2);
  assert.equal(follows[0].target, "@vex.archive");
  await setFollow(user, "user", "@vex.archive", false);
  follows = await listFollows(user);
  assert.deepEqual(follows.map((f) => f.target), ["Auralee"]);
  await assert.rejects(() => setFollow(user, "board", "b-1", true), TypeError);
  await assert.rejects(() => setFollow(user, "brand", "", true), TypeError);
  for (let i = 0; i < 60; i++) await setFollow(user, "brand", `brand-${i}`, true);
  const capped = await setFollow(user, "brand", "one-too-many", true);
  assert.equal(capped.ok, false);
  await purgePersonalizationData(user);
});

test("purge erases both v14 domains", async () => {
  const user = "u-memory-purge";
  await setFollow(user, "brand", "Bode", true);
  await saveMemoryPreferences(user, ["explicit"]);
  await purgePersonalizationData(user);
  assert.equal((await listFollows(user)).length, 0);
  assert.deepEqual((await getMemoryPreferences(user)).hiddenSections, []);
});

test("adoption moves follows and preferences; account side wins conflicts", async () => {
  const from = "u-memory-adopt-from";
  const to = "sb-memory-adopt-to";
  await setFollow(from, "brand", "Dries Van Noten", true);
  await setFollow(to, "brand", "Dries Van Noten", true); // duplicate — must not double
  await setFollow(from, "brand", "Lemaire", true);
  await saveMemoryPreferences(from, ["global"]);
  await saveMemoryPreferences(to, ["inferred"]); // account side wins
  await adoptAccountData(from, to);
  const follows = await listFollows(to);
  assert.deepEqual([...new Set(follows.map((f) => f.target))].sort(), ["Dries Van Noten", "Lemaire"]);
  assert.equal(follows.length, 2);
  assert.equal((await listFollows(from)).length, 0);
  assert.deepEqual((await getMemoryPreferences(to)).hiddenSections, ["inferred"]);
  assert.deepEqual((await getMemoryPreferences(from)).hiddenSections, []);
  await purgePersonalizationData(to);
});
