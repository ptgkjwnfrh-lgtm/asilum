// tests/deferred-triggers.test.js — the deferral check must be able to fire.
//
// `scripts/check-deferred-triggers.mjs` exists because two handovers carried
// "neither has triggered" by hand while admitting the figures were not
// re-measured. A check that replaces that sentence has to be trustworthy in the
// one direction that matters: it must not print `ok` when it does not know.
//
// Like `tests/deploy-drift.test.js` beside it, this reads the script as source.
// The script runs its query at import time and calls `process.exit`, so it
// cannot be imported and exercised; what CAN be pinned are the invariants that
// would make its output a lie. Each assertion below was confirmed to fail
// against a deliberately broken copy — the file is otherwise the exact shape of
// test this codebase spent the session learning to distrust.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRIPT = readFileSync(
  fileURLToPath(new URL("../scripts/check-deferred-triggers.mjs", import.meta.url)),
  "utf8",
);
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

test("the threshold is compared and printed from the SAME field", () => {
  // This was two strings for one number — a prose `threshold:` and a literal in
  // the comparison. A label reading "20" over a check testing 5 looks entirely
  // correct, and nothing would ever disagree with it. Now `at` drives both.
  assert.match(SCRIPT, /const hasFired = result\.value >= t\.at;/);
  assert.match(SCRIPT, /t\.describe\(t\.at\)/);
  // No trigger may carry its own verdict — that is the duplication returning in
  // another shape. Banning the KEY rather than a comparison pattern: the first
  // version of this assertion matched `fired: n >= 5000` and sailed past
  // `fired: (rows[0]?.n ?? 0) >= 5000`, which is the same defect spelled wider.
  assert.ok(
    !/\bfired\s*:/.test(SCRIPT),
    "a trigger must not return `fired`; the single comparison against `at` decides",
  );
});

test("a trigger that cannot be measured counts as fired, not as fine", () => {
  // The whole failure mode this replaces is a confident "neither has triggered"
  // that nobody had checked. An unreadable table must never render as `ok`.
  const block = SCRIPT.slice(SCRIPT.indexOf("COULD NOT MEASURE"));
  assert.match(block, /fired\+\+/);
  assert.ok(
    block.indexOf("fired++") < block.indexOf("continue"),
    "the unmeasurable branch must count the trigger before it skips it",
  );
});

test("firing exits non-zero, and a clean run exits zero", () => {
  assert.match(SCRIPT, /nothing has triggered/);
  assert.match(SCRIPT, /process\.exit\(0\)/);
  assert.match(SCRIPT, /deferred item\(s\) are now worth doing/);
  assert.match(SCRIPT, /process\.exit\(1\)/);
  // An absent database is not a passing check either — it says so and stops.
  assert.match(SCRIPT, /no DATABASE_URL — nothing to measure/);
});

test("it reads and never writes", () => {
  // The catalog feed writes impressions on view; this must not be that. Pure
  // SELECTs, and the pool is closed so a run cannot hang a session open.
  assert.ok(
    !/\b(insert|update|delete|truncate|drop)\s+(into|from|table)?/i.test(
      SCRIPT.replace(/^\s*\/\/.*$/gm, ""),
    ),
    "the deferral check must never write",
  );
  assert.match(SCRIPT, /pool\.end\(\)/);
});

test("it is reachable as a command, not just a file", () => {
  // A script nobody can find is the handover sentence again, one directory down.
  assert.equal(PKG.scripts["triggers:check"], "node scripts/check-deferred-triggers.mjs");
});
