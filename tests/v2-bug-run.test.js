// tests/v2-bug-run.test.js — THE BUG RUN (owner, 29 Oct 2026: "do another run through for bugs"). What the run found
// in the evening's work (the EQ, DISCOVER, the craving, the one frame, the ground's ink) and what keeps each one fixed.
// Declared before fixing, each check failing with its bug in place:
//   1. DISCOVER hears a craving changed elsewhere (it stays mounted when it closes);
//   2. a popup never stacks a second live copy of a view it holds — DISCOVER pressed twice, a rail tapped over
//      search, a character typed with DISCOVER on top all go back to the step that is there;
//   3. a held craving loads the Feed once, not twice; a cleared one leaves the reader's source as it was;
//   4. the ink's watchers keep what they watch to themselves, so a second mount watches again;
//   5. the EQ names its panel only while there is one, gives the focus back on Escape and on CLEAR, and asks one
//      more frame when its key moves;
//   6. the motion row asks a refused centre video again.
// (The packer's top-row strip is in tests/feed-tetris.test.js; the overlay sheets in tests/v2-popup-card.test.js.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as D from "../lib/dockstate.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const views = () => (D.getDock().sheet ? D.getDock().sheet.stack.map((s) => s.view) : []);

test("2. a popup goes back to a view it holds rather than stacking a second live copy", () => {
  D.closeSheet();
  D.openSheet("search");
  D.goSheet("discover", { title: "DISCOVER" });
  assert.deepEqual(views().slice(-2), ["search", "discover"], "DISCOVER over search");
  D.goSheet("discover", { title: "DISCOVER" });
  assert.deepEqual(views().slice(-2), ["search", "discover"], "pressed again: still one DISCOVER");
  D.goSheet("search", { title: "SEARCH" });
  assert.equal(views().filter((v) => v === "search").length, 1, "a rail tapped: back to the one SEARCH");
  assert.equal(views().at(-1), "search");
  D.goSheet("listing", { title: "LISTING" });
  assert.equal(views().at(-1), "listing", "a view it does not hold is a step added");
  D.closeSheet();
  D.goSheet("discover", { title: "DISCOVER" });
  assert.ok(D.getDock().sheet, "with no popup up, it opens one");
  D.closeSheet();
  // every way in uses it
  const cc = read("app/components/ControlCenter.jsx"), ss = read("app/components/SearchSheet.jsx"), ds = read("app/components/DiscoverSheet.jsx");
  assert.match(cc, /goSheet\("discover", \{ title: "DISCOVER" \}\)/, "the deck's DISCOVER key");
  assert.ok(!/openSheet\("search"\)/.test(cc), "the deck's field never stacks a second SEARCH");
  assert.match(ss, /goSheet\("discover"/, "the search popup's line");
  assert.match(ds, /goSheet\("search"/, "a rail tapped");
  assert.ok(!/pushSheet\("search"/.test(ds), "never pushed");
});

test("1. DISCOVER hears a craving pointed or cleared elsewhere", () => {
  const ds = read("app/components/DiscoverSheet.jsx");
  assert.match(ds, /window\.addEventListener\(CRAVING_EVENT, heard\)/, "it listens");
  assert.match(ds, /window\.removeEventListener\(CRAVING_EVENT, heard\)/, "and stops listening");
  assert.match(ds, /const heard = \(e\) => \{ const c = normalCraving\(e && e\.detail\); setHeld\(c\); setDraft\(c\);/, "what it hears is what it shows");
});

test("3. a held craving loads the Feed once; a cleared one leaves the source alone", () => {
  const page = read("app/page.js");
  assert.match(page, /if \(cravingActive\(held\)\) \{ cravingHeldRef\.current = true; setCraving\(held\); \}/, "the held craving is marked");
  assert.match(page, /if \(!cravingHeldRef\.current\) await loadFeed\(user\);/, "the boot leaves the load to the craving's reload");
  assert.match(page, /if \(cravingActive\(c\)\) setTab\("curated"\); setCraving\(c\);/, "only a craving pointed turns the Feed to FOR YOU");
  assert.ok(!/const heard = \(e\) => \{ setTab\("curated"\)/.test(page), "never every event");
  assert.match(page, /else if \(data\.craving\) setNotice\(CRAVING_NOTE\);\s*(\/\/[^\n]*\n\s*)*else setNotice\(\(n\) => \(n === CRAVING_NOTE \? "" : n\)\);/, "a Feed without a craving takes its notice down, only that one");
});

test("4. the ink's watchers keep what they watch to themselves", () => {
  for (const f of ["app/components/InkWatch.jsx", "app/components/GroundInk.jsx"]) {
    const src = read(f);
    assert.ok(!/\.__ink\b|\.__ground\b/.test(src), f + ": no mark left on the element");
    assert.match(src, /const watched = new WeakSet\(\);/, f + ": its own set");
    assert.match(src, /if \(!watched\.has\((z|el)\)\) \{ watched\.add\(\1\); io\.observe\(\1\); \}/, f + ": watched once per observer");
  }
});

test("5. the EQ: its panel named only while open, the focus kept, a frame more when its key moves", () => {
  const eq = read("app/components/FeedEq.jsx");
  assert.match(eq, /aria-controls=\{open \? id : undefined\}/, "aria-controls names a panel that is there");
  assert.match(eq, /useEscape\(\(\) => \{ if \(panelRef\.current && panelRef\.current\.contains\(document\.activeElement\) && keyRef\.current\) keyRef\.current\.focus\(\); close\(\); \}, open\);/, "Escape gives the focus to the key");
  assert.match(eq, /querySelector\("\.eqsrc\.on"\);[\s\S]{0,80}onClearCraving\(\);\s*if \(src\) src\.focus\(\);/, "CLEAR gives it to the source playing");
  assert.match(eq, /el\.style\.transform = offset \? [^;]+; requestFrame\(\); \}/, "a frame more when the key moves");
});

test("6. the motion row asks a refused centre video again", () => {
  const mr = read("app/components/MotionRail.jsx");
  assert.match(mr, /if \(now === was\) \{[\s\S]*?if \(v && v\.paused\) \{ const p = v\.play\(\);[\s\S]*?return;\s*\}/, "a paused centre video in view is played again");
});
