// tests/shared-constants.test.js — trap 27, applied as a sweep.
//
// "A check that carries a COPY of a constant must be pinned to the original.
// Whenever a value is duplicated across a boundary the language cannot cross,
// the test IS the boundary." That was written for `measure-match-floor.mjs`
// carrying its own `FLOOR = 75` because it cannot import a route's constant.
// It is not the only place the codebase does this.
//
// `lib/brain/memory.js` declares `TASTE_LONG = 0.6` under the comment
//
//     // must mirror lib/brain/index.js blend weights
//
// which is the whole problem in one line: a prose instruction standing where an
// assertion should be. Nothing fails if someone tunes the blend in `index.js`.
// The taste vector the engine ranks with and the one `vizState` draws for the
// reader would simply stop being the same vector, and the page would keep
// claiming to show the brain's own state.
//
// The two that would cost the most are in a BACKFILL script.
// `scripts/backfill-edge-contributors.mjs` re-declares `CONTRIB_CAP` and
// `CO_ENGAGE_SPAN`, and it REWRITES PRODUCTION ROWS with them. If either drifts
// from the live path in `lib/brain/edges.js` and `app/api/interaction/route.js`,
// backfilled edges and live-computed edges disagree, permanently and quietly,
// with every test still green — the corroboration weights would just be wrong
// for whichever half of the data was written by the other rule.
//
// So: any ALL-CAPS constant declared with a literal in more than one file must
// agree everywhere. Exemptions are listed by name AND file below, because a
// blanket name exemption would let a real pair drift under cover of a false one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// name → the reason two files may legitimately disagree. Each entry names the
// files, so adding a THIRD declaration of an exempt name still fails.
const INDEPENDENT = {
  // Adapter identity — each adapter is a different source by definition.
  SOURCE: ["lib/ingest/adapters/ebayAdapter.js", "lib/ingest/adapters/woocommerceAdapter.js"],
  // Different features that happen to share a noun: a business account's
  // verification statement, and a profile room's statement module. Neither
  // bounds the other's input; both are imported by their own callers rather
  // than re-declared, which is the pattern this file is asking for.
  STATEMENT_MAX: ["lib/business.js", "lib/profile/rooms.js"],
};

function walk(dir, out = []) {
  for (const entry of readdirSync(ROOT + dir)) {
    const rel = `${dir}/${entry}`;
    if (rel.includes("node_modules") || rel.includes("/.next")) continue;
    if (statSync(ROOT + rel).isDirectory()) walk(rel, out);
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(rel);
  }
  return out;
}

// `const NAME = <literal>;` — only ALL-CAPS names, only primitive literals.
// Anything computed is out of scope: this is about copied values, not copied
// logic, and a copied expression is a different (harder) problem.
const DECL = /^\s*(?:export\s+)?const ([A-Z][A-Z0-9_]{2,})\s*=\s*([0-9][0-9_]*(?:\.[0-9]+)?|"[^"]{1,40}"|'[^']{1,40}')\s*;/gm;

function declarations() {
  const byName = new Map();
  for (const f of [...walk("lib"), ...walk("app"), ...walk("scripts")]) {
    for (const m of readFileSync(ROOT + f, "utf8").matchAll(DECL)) {
      const name = m[1];
      const value = m[2].replace(/_/g, "");
      if (!byName.has(name)) byName.set(name, new Map());
      const byValue = byName.get(name);
      if (!byValue.has(value)) byValue.set(value, []);
      byValue.get(value).push(f);
    }
  }
  return byName;
}

test("a constant declared in two files carries the same value in both", () => {
  const conflicts = [];
  for (const [name, byValue] of declarations()) {
    if (byValue.size < 2) continue;
    const files = [...byValue.values()].flat().sort();
    const exempt = INDEPENDENT[name];
    if (exempt && exempt.length === files.length && exempt.every((f, i) => f === files[i])) continue;
    conflicts.push(`${name}: ` + [...byValue].map(([v, fs]) => `${v} in ${fs.join(" + ")}`).join("  vs  "));
  }
  assert.deepEqual(conflicts, [],
    "a copied constant drifted — import it, or add a documented exemption naming both files");
});

test("the copies that agree today are named, so a new one is noticed", () => {
  // Agreement is not safety; it is the state before the drift. Listing them
  // means adding a fourth copy of CONTRIB_CAP, or a first copy of something
  // else, shows up as a diff on this file rather than as nothing at all.
  const copied = [];
  for (const [name, byValue] of declarations()) {
    const files = [...byValue.values()].flat();
    // The COUNT is part of the record. An earlier version stored only
    // `name=value`, so a third copy carrying the same value changed nothing and
    // slipped through — while the comment above claimed it would be caught.
    if (files.length > 1 && byValue.size === 1) {
      copied.push(`${name}=${[...byValue.keys()][0]} in ${files.length} files`);
    }
  }
  assert.deepEqual(copied.sort(), [
    "CONTRIB_CAP=8 in 2 files",
    "CO_ENGAGE_SPAN=5 in 2 files",
    "FETCH_TIMEOUT_MS=10000 in 3 files",
    "MAX_SLOT=999 in 2 files",
    "TASTE_LONG=0.6 in 2 files",
    "TASTE_SESSION=0.4 in 2 files",
  ], "the set of duplicated constants changed — import it instead, or record it here");
});

test("the scanner still sees the declarations it is about", () => {
  // If DECL stops matching — a reformat, a move to `export const {…}` — every
  // assertion above passes by finding nothing. That is trap 22, and this file
  // is exactly the kind that would sit green for months.
  const byName = declarations();
  assert.ok(byName.size > 40, `expected many constants, found ${byName.size}`);
  for (const name of ["CONTRIB_CAP", "CO_ENGAGE_SPAN", "TASTE_LONG"]) {
    assert.ok(byName.has(name), `${name} is declared in this repo and must be seen`);
  }
});
