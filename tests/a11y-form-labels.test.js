// tests/a11y-form-labels.test.js — every form control announces what it is.
//
// Companion to `tests/a11y-structure.test.js`, which pinned the headings, the
// card controls and the item dialog. This one closes the other half of the same
// launch-audit finding: the `/accessibility` page promised "real labels" while
// **43 of 62 form controls across 18 files shipped with no accessible name at
// all**. A screen reader announced them as "edit text, blank" — the search
// field, the sign-up handle, the wardrobe entry form, the business application,
// every filter on the catalog.
//
// A placeholder is NOT a label. It is not exposed as the accessible name by
// every combination of browser and screen reader, and it disappears the moment
// the user types — so a person who tabs back to a half-filled field is told
// nothing about what it holds.
//
// This test is a STATIC source check, not a substitute for axe or a real
// assistive-technology pass — the same caveat `a11y-structure` carries. What it
// guarantees is that a new control cannot be added without a name, which is how
// all 43 arrived in the first place: one at a time, each looking fine on screen.
//
// A control counts as named when it has `aria-label`, `aria-labelledby`, or is
// wrapped in a `<label>` (an implicit association, which 16 controls already
// used correctly and which the first draft of this scan wrongly reported as a
// failure).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `fileURLToPath`, never `url.pathname` — this repo's directory name has spaces.
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const p = d + "/" + entry;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.jsx?$/.test(entry)) out.push(p);
    }
  })(dir);
  return out;
}

// Walks the opening tag brace-aware, so a JSX expression containing ">"
// (`onChange={(e) => …}`) does not end the tag early. Getting this wrong makes
// the scan silently miss attributes and under-report.
function openingTagAttrs(src, start) {
  let i = start, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) break;
    i++;
  }
  return src.slice(start, i);
}

// Inside an unclosed <label>? That is a valid implicit association.
function insideLabel(src, index) {
  const before = src.slice(0, index);
  const open = before.lastIndexOf("<label");
  if (open === -1) return false;
  return before.lastIndexOf("</label>") < open;
}

function formControls() {
  const found = [];
  for (const file of sourceFiles(ROOT + "app")) {
    const src = readFileSync(file, "utf8");
    const re = /<(input|select|textarea)\b/g;
    let m;
    while ((m = re.exec(src))) {
      const attrs = openingTagAttrs(src, m.index + m[0].length);
      // Hidden inputs carry no user-facing meaning; submit/button inputs take
      // their name from `value`.
      if (/type\s*=\s*"(hidden|submit|button)"/.test(attrs)) continue;
      found.push({
        file: file.slice(ROOT.length),
        line: src.slice(0, m.index).split("\n").length,
        tag: m[1],
        named: /aria-label\s*=|aria-labelledby\s*=/.test(attrs) || insideLabel(src, m.index),
        placeholderOnly: /placeholder\s*=/.test(attrs)
          && !/aria-label\s*=|aria-labelledby\s*=/.test(attrs)
          && !insideLabel(src, m.index),
      });
    }
  }
  return found;
}

test("every form control in app/ has an accessible name", () => {
  const controls = formControls();

  // Not vacuous: if the scan ever stops finding controls it fails here rather
  // than passing on an empty list.
  assert.ok(controls.length >= 55, `scanned ${controls.length} form controls`);

  const unnamed = controls.filter((c) => !c.named)
    .map((c) => `${c.file}:${c.line} <${c.tag}>`);
  assert.deepEqual(unnamed, [],
    "a control with no aria-label, aria-labelledby or wrapping <label> announces as \"blank\"");
});

test("no control relies on its placeholder to be understood", () => {
  // The specific shape the audit found: a field that looks self-explanatory on
  // screen and is silent to a screen reader, then silent to everyone once it
  // has content in it.
  const placeholderOnly = formControls().filter((c) => c.placeholderOnly)
    .map((c) => `${c.file}:${c.line} <${c.tag}>`);
  assert.deepEqual(placeholderOnly, [], "a placeholder is not a label");
});

test("the scan reads code, not comments, and sees whole opening tags", () => {
  // Guards the guard, in both directions. The brace-aware walk is the part that
  // matters: a naive scan to the first ">" stops inside `onChange={(e) => …}`
  // and reports a labelled control as unnamed.
  const sample = `
    <input aria-label="named" onChange={(e) => setX(e.target.value)} />
    <label>wrapped<input value={y} onChange={(e) => setY(e.target.value)} /></label>
    <input placeholder="bare" onChange={(e) => setZ(e.target.value)} />
  `;
  const results = [];
  const re = /<(input|select|textarea)\b/g;
  let m;
  while ((m = re.exec(sample))) {
    const attrs = openingTagAttrs(sample, m.index + m[0].length);
    results.push(/aria-label\s*=/.test(attrs) || insideLabel(sample, m.index));
  }
  assert.deepEqual(results, [true, true, false],
    "aria-label survives an arrow function in the same tag; a wrapped input counts; a bare one does not");
});
