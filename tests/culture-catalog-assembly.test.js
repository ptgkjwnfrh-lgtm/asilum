// tests/culture-catalog-assembly.test.js
// THE CATALOG IS SPLIT ACROSS FILES, AND ITS ORDER IS BEHAVIOUR.
//
// lib/asterisk/culture.js concatenates five parts. That is a formatting
// decision with a behavioural edge: cultureIndex() lets a LATER record's name
// or alias overwrite an earlier one's, and cultureSuggestView() walks the array
// as it stands. Reorder the parts — or split a part by kind to tidy it — and
// some queries quietly resolve to a different reading.
//
// Nothing about that is visible in a diff, and no existing test would fail. So
// these assertions exist to make the next re-split fail loudly instead.

import test from "node:test";
import assert from "node:assert/strict";

import { CULTURE, cultureIndex, lookupCulture } from "../lib/asterisk/culture.js";
import { CORE } from "../lib/asterisk/culture/catalog-core.js";
import { EXPANSION } from "../lib/asterisk/culture/catalog-expansion.js";
import { AESTHETICS } from "../lib/asterisk/culture/catalog-aesthetics.js";
import { HIPHOP } from "../lib/asterisk/culture/catalog-hiphop.js";
import { FIGURES } from "../lib/asterisk/culture/catalog-figures.js";

const PARTS = [CORE, EXPANSION, AESTHETICS, HIPHOP, FIGURES];

test("every part contributes, and nothing is dropped in assembly", () => {
  for (const part of PARTS) assert.ok(part.length > 0, "an empty part means a dropped import");
  const curated = PARTS.reduce((n, part) => n + part.length, 0);
  // CULTURE also carries the compiled research records, appended after the
  // curated parts — so it is at least the sum, never less.
  assert.ok(CULTURE.length >= curated,
    `assembled ${CULTURE.length} < ${curated} curated records — a part was lost`);
});

test("the parts appear IN ORDER, and the order is the one that shipped", () => {
  // Walk the assembled catalog and check each part's records appear as a
  // contiguous run, in sequence. This is the assertion that fails if somebody
  // reorders the spread in culture.js or re-splits the parts by kind.
  let at = 0;
  for (const part of PARTS) {
    for (const record of part) {
      assert.equal(CULTURE[at].name, record.name,
        `record ${at} should be "${record.name}" — the parts are out of order`);
      at++;
    }
  }
  assert.equal(CULTURE[0].name, CORE[0].name, "the core set still opens the catalog");
});

test("a name collision resolves to the LAST record that claims it", () => {
  // The property the ordering actually protects. Asserted against the index
  // rather than assumed, because this is what a reorder would silently change.
  const index = cultureIndex();
  const byName = new Map();
  for (const record of CULTURE) byName.set(record.name, record);
  for (const [name, record] of byName) {
    assert.equal(index.get(name), record,
      `"${name}" must resolve to the last record claiming it`);
  }
});

test("the catalog is reachable through culture.js alone", () => {
  // Nothing outside lib/asterisk/culture/ should import a part directly; the
  // assembler is the contract. A spot check that the front door works.
  assert.ok(lookupCulture("fight club"), "a core record resolves");
  assert.equal(lookupCulture("FIGHT CLUB")?.name, "fight club", "lookup is case-insensitive");
  assert.equal(lookupCulture("nothing-is-filed-here"), null, "an unknown key is null, not a guess");
});
