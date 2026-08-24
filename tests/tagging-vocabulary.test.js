// tests/tagging-vocabulary.test.js — one vocabulary, and the instrument that
// keeps it one.
//
// The owner asked for the tagging system to be advanced and COHESIVE. Cohesion
// is not a property you add once; it is a property that decays every time
// somebody writes a facet name in a new file. So these are the assertions that
// fail when it starts to.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FACETS, FACET_NAMES, FACET_WEIGHTS, facetOf, facetWeight,
} from "../lib/tagging/vocabulary.js";
import { TYPE_WEIGHTS } from "../lib/search/denseQuery.js";

const root = process.cwd();
const read = (p) => readFileSync(path.join(root, p), "utf8");

test("every facet has a definition, a weight and no accidental duplicates", () => {
  assert.ok(FACET_NAMES.length >= 20, "the axes a piece can be described on");
  const seenAliases = new Map();
  for (const [name, facet] of Object.entries(FACETS)) {
    // A tag whose meaning nobody wrote down is a tag nobody can use
    // consistently — which is how `fabric` and `material` became two facets.
    assert.ok(facet.means && facet.means.length > 25,
      `${name} has no definition worth the name`);
    assert.equal(typeof facet.weight, "number");
    assert.ok(facet.weight > 0 && facet.weight <= 2, `${name}: weight out of range`);
    assert.equal(typeof facet.written, "boolean",
      `${name} must say whether anything writes it — a vocabulary that implies `
      + "coverage it does not have is the same lie one level up");
    for (const alias of facet.aliases) {
      assert.ok(!FACETS[alias], `${name}: "${alias}" is both an alias and a facet`);
      assert.ok(!seenAliases.has(alias),
        `"${alias}" is an alias of both ${seenAliases.get(alias)} and ${name}`);
      seenAliases.set(alias, name);
    }
  }
});

test("an alias resolves to its facet, and an invented facet resolves to nothing", () => {
  // THE 7.5x BUG, as an assertion. dense.js wrote wool as `material` at 0.9
  // and the ingest path wrote it as `fabric` at 0.6; the scorer knew
  // `material` (x1.5) and not `fabric` (x0.3 unknown floor). Same word, same
  // garment, 1.35 versus 0.18, decided by which code path ran.
  assert.equal(facetOf("fabric"), "material");
  assert.equal(facetOf("material"), "material");
  assert.equal(facetWeight("fabric"), facetWeight("material"),
    "the alias must be worth exactly what the facet is worth");

  assert.equal(facetOf("subcategory"), "category");
  assert.equal(facetOf("colour"), "color");
  assert.equal(facetOf("city"), "origin");
  assert.equal(facetOf("  MATERIAL "), "material", "trimmed and lowercased");

  assert.equal(facetOf("vibe"), null, "a facet nobody defined");
  assert.equal(facetOf(""), null);
  assert.equal(facetOf(null), null);
  assert.equal(facetWeight("vibe"), 0, "and it is worth nothing, not a default");
});

test("the search weight table is DERIVED from the vocabulary, not kept beside it", () => {
  assert.deepEqual(TYPE_WEIGHTS, FACET_WEIGHTS);
  // Every facet the vocabulary knows is scoreable; nothing scoreable is
  // outside the vocabulary. That biconditional is the whole point — the old
  // table knew eighteen names and had never heard of five that were being
  // written every day.
  assert.deepEqual(Object.keys(TYPE_WEIGHTS).sort(), [...FACET_NAMES].sort());
});

test("every writer goes through the vocabulary", () => {
  // The two paths that put a tag on a piece. If a third appears, it has to
  // resolve its facet the same way or this fails.
  // THREE of them, not two. `addProductTags` in lib/db/production.js accepted
  // whatever facet name a caller passed and defaulted to "aesthetic" — it was
  // missed on the first pass and the v49 CHECK is what found it, by refusing a
  // write three layers below the code that made it. A register acquires its
  // next dialect exactly that way.
  for (const file of [
    "lib/tagging/dense.js",
    "lib/ingest/adapters/normalize.js",
    "lib/db/production.js",
  ]) {
    const src = read(file);
    assert.match(src, /facetOf\(/, `${file} must resolve its facet through the vocabulary`);
  }
  for (const file of ["lib/tagging/dense.js", "lib/ingest/adapters/normalize.js"]) {
    assert.match(read(file), /if \(!tagType\) return/,
      `${file} must DROP an unknown facet rather than write it`);
  }
  assert.match(read("lib/db/production.js"), /filter\(\(t\) => t\.tag && t\.tagType\)/,
    "and the third drops it in its filter");
});

test("the database fence lists exactly the vocabulary", () => {
  // v49 is the same rule one layer down: the column takes a name from the
  // register or it takes nothing. Two lists that must agree, so a test that
  // reads both — the v2 comment claimed nineteen facets and enforced none.
  const sql = read("supabase/schema-v49-tag-facets.sql");
  const inCheck = [...sql.matchAll(/'([a-z-]+)'/g)]
    .map((m) => m[1])
    .filter((v) => v !== "tag-facets");
  assert.deepEqual([...new Set(inCheck)].sort(), [...FACET_NAMES].sort(),
    "the CHECK and the vocabulary have drifted");
});

test("a facet nothing writes says so, rather than implying coverage", () => {
  // §5's tagging law: sparse items stay honestly sparse, never padded. A
  // vocabulary that lists axes nothing fills is the same claim one level up,
  // so the ones that are aspirational are marked.
  const declaredOnly = FACET_NAMES.filter((n) => !FACETS[n].written);
  for (const name of declaredOnly) {
    assert.ok(FACETS[name].means, `${name} is declared but undefined`);
  }
  // and the ones that ARE written are the majority — a register that is mostly
  // aspiration is a wish list, not a vocabulary
  assert.ok(FACET_NAMES.length - declaredOnly.length > declaredOnly.length * 3);
});
