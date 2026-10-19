// tests/match-floor-check.test.js — the floor check must measure the REAL floor.
//
// `scripts/measure-match-floor.mjs` guards ruling 8 from silently reverting: the
// 75 floor is only a gate while the composite distribution keeps landing around
// it, and that distribution depends on the live catalog, which no test asserts.
//
// The failure this file is really about is subtler than the script being wrong.
// The script carries its own `FLOOR = 75` because it cannot import a constant
// that lives inside a route module. If someone changes `MATCH_FLOOR` in
// `app/api/outfits/route.js`, the check goes on measuring 75 and goes on
// printing "the floor is a real gate" about a floor the product no longer uses.
// It would be green, confident and about nothing — the same shape as the inert
// floor ruling 8 removed. So the two numbers are pinned to each other here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const SCRIPT = read("../scripts/measure-match-floor.mjs");
const ROUTE = read("../app/api/outfits/route.js");
const PKG = JSON.parse(read("../package.json"));

// Assertions about what the script DOES must not read its prose. Both of the
// banned strings below appear legitimately in its comments — "cannot use
// Math.random" and the `app/api/outfits/route.js` cross-reference — and the
// first draft of this file failed on exactly that, which is trap 20 landing in
// the test written to avoid it. Strips trailing `//` as well as whole lines.
const CODE = SCRIPT.replace(/^\s*\/\/.*$/gm, "").replace(/(^|\s)\/\/.*$/gm, "$1");

test("the check's floor is the floor the route actually enforces", () => {
  const inRoute = ROUTE.match(/const MATCH_FLOOR = (\d+);/);
  const inCheck = SCRIPT.match(/const FLOOR = (\d+);/);
  assert.ok(inRoute, "app/api/outfits/route.js must declare MATCH_FLOOR");
  assert.ok(inCheck, "the check must declare FLOOR");
  assert.equal(
    inCheck[1], inRoute[1],
    "the floor check is measuring a number the stylist no longer enforces",
  );
});

test("it fails in BOTH directions, not just the inert one", () => {
  // "Make the floor stricter" is the tempting change, and it starves the page —
  // §M4's promise is that a generation never empties. A guard that only catches
  // the floor going inert would wave that through.
  assert.match(SCRIPT, /REJECT_MIN = 0?\.\d+/);
  assert.match(SCRIPT, /REJECT_MAX = 0?\.\d+/);
  assert.equal((SCRIPT.match(/process\.exit\(1\)/g) || []).length, 2,
    "one exit for inert, one for starving");
  assert.match(SCRIPT, /decoration again/);
  assert.match(SCRIPT, /starves/);
});

test("the sweep is deterministic, so a changed number means changed reality", () => {
  // Math.random would make two runs incomparable and turn every drift argument
  // into "run it again". A seeded LCG keeps the vectors fixed.
  assert.ok(!/Math\.random/.test(CODE), "the sweep must not use Math.random");
  assert.match(CODE, /function lcg\(/);
});

test("it reads and never writes, and never serves a look", () => {
  assert.ok(!/\b(insert|update|delete|truncate)\s+(into|from|table)?/i.test(CODE),
    "the floor check must never write");
  // The catalog feed writes impressions on view. Measuring must not go near it.
  assert.ok(!/\/api\/|fetch\(/.test(CODE), "measure in-process; do not call the app");
});

test("it is reachable as a command", () => {
  assert.equal(PKG.scripts["floor:check"], "node scripts/measure-match-floor.mjs");
});
