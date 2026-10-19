// tests/constraints.test.js
// THE FILTERS NOBODY SET.
//
// ASILUM has no filter dropdowns because the sentence already carries the
// constraints. This module shows a reader what their sentence became and lets
// them take one back — and the tests are mostly about the two ways that could
// go wrong: creating a constraint (which would be a filter control by another
// name), and mangling the query on release.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readConstraints, releaseConstraint, hasConstraints } from "../lib/search/constraints.js";
import { searchProducts } from "../lib/search/index.js";

const SRC = readFileSync("lib/search/constraints.js", "utf8");

async function readOf(query) {
  const r = await searchProducts(query, { limit: 1, log: false });
  return { interpreted: r.interpreted, constraints: readConstraints(r.interpreted) };
}

test("a sentence's constraints are shown back", async () => {
  const { constraints } = await readOf("1990s helmut lang size L not leather");
  const kinds = constraints.map((c) => c.kind);
  assert.ok(kinds.includes("era"), "the era was read");
  assert.ok(kinds.includes("size"), "the size was read");
  assert.ok(kinds.includes("exclusions"), "the exclusion was read");
});

test("NOTHING IS SHOWN when the sentence carried no constraints", async () => {
  // An empty constraint row is the empty state the third law forbids — and it
  // would advertise that a filter mechanism exists at all.
  const { interpreted, constraints } = await readOf("black wool coat");
  assert.deepEqual(constraints, []);
  assert.equal(hasConstraints(interpreted), false);
});

test("RELEASE REMOVES THE WORDS, and the rest of the sentence survives", async () => {
  const q = "1990s helmut lang size L not leather";
  const { constraints } = await readOf(q);
  const era = constraints.find((c) => c.kind === "era");
  assert.equal(releaseConstraint(q, era), "helmut lang size L not leather");
  const size = constraints.find((c) => c.kind === "size");
  assert.equal(releaseConstraint(q, size), "1990s helmut lang not leather");
});

test("an exclusion takes its negator with it", async () => {
  // Removing only "leather" from "not leather" leaves a dangling "not", which
  // the parser then reads as part of whatever follows.
  const q = "1990s helmut lang size L not leather";
  const { constraints } = await readOf(q);
  const excl = constraints.find((c) => c.kind === "exclusions");
  assert.equal(releaseConstraint(q, excl), "1990s helmut lang size L");
  assert.doesNotMatch(releaseConstraint(q, excl), /\bnot\b/);
});

test("word boundaries — releasing 'no' must not gut 'nordic'", () => {
  const out = releaseConstraint("nordic boots no leather",
    { kind: "exclusions", phrase: "leather", releasable: true });
  assert.match(out, /nordic/, "a word that merely contains a negator survives");
  assert.equal(out, "nordic boots");
});

test("RELEASING NEVER YIELDS AN EMPTY SEARCH", () => {
  // If taking the words out would erase the sentence there is nothing left to
  // ask, so the release does not happen. A no-op beats a blank query.
  const out = releaseConstraint("japanese",
    { kind: "origin", phrase: "japanese", releasable: true });
  assert.equal(out, "japanese");
});

test("an unreleasable constraint is a no-op, not a mangling", () => {
  const q = "some sentence";
  for (const bad of [null, {}, { releasable: false, phrase: "x" }, { releasable: true }]) {
    assert.equal(releaseConstraint(q, bad), q);
  }
  assert.equal(releaseConstraint("", { releasable: true, phrase: "x" }), "");
});

test("a constraint with no recoverable phrase is SHOWN but not releasable", () => {
  // Seeing what the system understood is the point; a chip that silently does
  // nothing when pressed is worse than one that says it cannot.
  const [c] = readConstraints({ size: { kind: "fit", fits: "L", label: "size L" } });
  assert.equal(c.label, "size L");
  assert.equal(c.releasable, false);
});

test("IT NEVER CREATES A CONSTRAINT — it only reveals and releases", () => {
  // The line between this and a filter dropdown. Nothing here may add to a
  // query; the sentence is the only way a constraint comes into being.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\+\s*["'`]\s*\w/, "no module here appends to a query");
  assert.doesNotMatch(code, /addConstraint|applyFilter|setFilter/i);
  // Release only ever shortens.
  const q = "1990s japanese boots";
  const out = releaseConstraint(q, { kind: "origin", phrase: "japanese", releasable: true });
  assert.ok(out.length < q.length, "release removes, never adds");
});

test("releasing is idempotent", () => {
  const c = { kind: "origin", phrase: "japanese", releasable: true };
  const once = releaseConstraint("japanese wool coat", c);
  assert.equal(releaseConstraint(once, c), once, "releasing twice changes nothing further");
});
