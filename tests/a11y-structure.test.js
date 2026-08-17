// tests/a11y-structure.test.js — the structural accessibility claims the
// /accessibility page makes, checked against what the routes actually ship.
//
// The Aug-16 launch audit found that page promising "semantic headings", "real
// labels" and "full keyboard operability of navigation and controls" while the
// product catalog opened its detail from a bare <div onClick> — pointer only —
// and the detail overlay announced as an anonymous div. A published
// accessibility commitment that the product does not meet is a trust problem on
// top of an access one.
//
// These are STATIC source checks, not a substitute for axe or a real
// assistive-technology pass. They pin the specific regressions that were
// actually found, so the same three cannot come back unnoticed. Matches are
// bounded — the trap this suite already recorded is a regex reaching further
// than intended.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// Comments describe the fix; they must not be what satisfies the assertion.
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("every route that renders a masthead has exactly one page heading", () => {
  // /cover and /profile built their mastheads from styled spans and shipped no
  // h1 at all.
  for (const page of ["app/cover/page.js", "app/profile/page.js", "app/page.js"]) {
    const src = code(page);
    const h1s = src.match(/<h1[\s>]/g) || [];
    assert.equal(h1s.length, 1, `${page}: exactly one h1, found ${h1s.length}`);
  }
});

test("the catalog card title is a real control, not a clickable div", () => {
  const src = code("app/page.js");
  assert.match(src, /<button[^>]*className="ttl"/,
    "the catalog card title is a button — it was a div with onClick, reachable by mouse only");
  assert.ok(!/<div className="ttl" onClick/.test(src),
    "no clickable title div may remain");
});

test("the discover card title is a real link", () => {
  const src = code("app/discover/page.js");
  assert.match(src, /<a\s+className="ttl"/,
    "the discover card title is a link");
  assert.ok(!/<div className="ttl">/.test(src),
    "no inert title div may remain");
});

test("card images are presentational, so each card announces one name", () => {
  // Both the image and the title were separately clickable and separately
  // named, so a screen reader met every piece twice.
  for (const page of ["app/page.js", "app/discover/page.js"]) {
    const src = code(page);
    const imgwrap = src.match(/<div className="imgwrap"[^>]*>/g) || [];
    assert.ok(imgwrap.length > 0, `${page}: has card images`);
    for (const tag of imgwrap) {
      assert.match(tag, /aria-hidden="true"/,
        `${page}: the card image is presentational — the title carries the name`);
    }
  }
});

test("the item detail overlay is a labelled, modal dialog with a named close", () => {
  const src = code("app/page.js");
  assert.match(src, /role="dialog"/, "it announces as a dialog");
  assert.match(src, /aria-modal="true"/, "and as modal, so the page behind is inert");
  assert.match(src, /aria-labelledby="item-detail-title"/, "and it is named");
  assert.match(src, /id="item-detail-title"/, "by an element that exists");
  assert.match(src, /className="mclose"[^>]*aria-label="close item detail"/,
    "the close control has a name — × alone is not one");
});
