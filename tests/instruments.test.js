// tests/instruments.test.js — the seven instruments run in CI, every push.
//
// They were written in the comprehension rounds of 21–22 August and they ran
// when somebody remembered. An instrument nobody runs is a document: this
// spawns all seven through the same runner the steward uses
// (lib/steward/instruments.js), so a regression in what the search engine
// reads fails the build instead of waiting for the next person to be curious.
//
// ~20s on a laptop. They run against the in-memory catalog (DATABASE_URL is
// blanked by the runner), so CI needs nothing it does not already have.

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { INSTRUMENTS, runInstruments } from "../lib/steward/instruments.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("every instrument the runner names exists", () => {
  for (const i of INSTRUMENTS) assert.ok(existsSync(ROOT + i.script), `${i.script} is missing`);
  assert.equal(INSTRUMENTS.length, 7);
});

test("the seven instruments pass", { timeout: 600000 }, async () => {
  const run = await runInstruments({ root: ROOT });
  const failed = run.results.filter((r) => !r.ok);
  assert.deepEqual(
    failed.map((r) => `${r.id} (exit ${r.code}${r.defects != null ? `, ${r.defects} defects` : ""}): ${r.last}`),
    [],
    "an instrument reported a defect — read its own output, it names the query");
  assert.equal(run.pass, 7);
});
