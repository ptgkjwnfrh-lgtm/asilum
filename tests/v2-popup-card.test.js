// tests/v2-popup-card.test.js — EVERY POPUP IS A LARGE CARD (owner, 29 Oct 2026: "all the pop up tabs have to look like
// cards four rounded corners and it being centered in the screen, lowkey every pop up tab should be the size of a large
// card"; app/components/SheetHost.jsx, app/globals.css).
//
// Declared before measuring:
//   - one size for every view: no view asks for a taller or roomier popup, there is no EXPAND / SHRINK key, and the
//     search no longer rises flat out of the deck; the phone's bottom sheet is gone;
//   - the card: a large card's width (a phone's Feed width: the screen less 16px — the Feed's grid at 375px is 359; from
//     560px half the screen less 28px, the twelve-column Feed's large card, at most 460px) and its height (the Feed's
//     own --ed-feed-large, 80% of the screen), centred in the screen, four corners a card's (--radius-card);
//   - it stays clear of the Masthead and the deck: its height gives way to the larger of the two clearances, at both
//     ends, so it stays centred; the deck's height is read as it stands (folded ticker, risen search);
//   - a field in focus lifts the card under the Masthead, the same size (a phone's keyboard).
//   Measured in the page (29 Oct 2026, below in the README of the proof): the card's box against a large card's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const host = read("app/components/SheetHost.jsx");

test("one size for every view", () => {
  const views = host.slice(host.indexOf("const VIEWS = {"), host.indexOf("};", host.indexOf("const VIEWS = {")));
  assert.ok(!/roomy|tall:/.test(views), "no view asks for its own height");
  const code = host.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(!/EXPAND|SHRINK|expand the popup|setTall/.test(code), "no EXPAND / SHRINK key");
  assert.match(host, /className=\{"sheet lgrx" \+ \(typing \? " typing" : ""\)\}/, "the one class, and the lift for a field in focus");
  assert.ok(!/\.sheet\.(roomy|tall|deckrise)\b/.test(css), "no taller, roomier or risen variant");
  assert.ok(!/@media \(max-width: 760px\) \{[^}]*\.sheet \{/.test(css), "no bottom sheet on a phone");
});

test("a large card's size, centred, a card's corners", () => {
  assert.match(css, /:root \{ --pop-w: calc\(100vw - 16px\); \}/, "a phone's Feed width");
  assert.match(css, /@media \(min-width: 560px\) \{ :root \{ --pop-w: min\(calc\(50vw - 28px\), 460px\); \} \}/, "the twelve-column Feed's large card");
  assert.match(css, /--pop-h: min\(var\(--ed-feed-large, 80svh\), calc\(100svh - 2 \* var\(--pop-clear\)\)\);/, "the Feed's own large height, giving way only to the fixtures");
  assert.match(css, /\.sheet \{\n  width: var\(--pop-w\); height: var\(--pop-h\); max-height: none;[^}]*border-radius: var\(--radius-card\);/s, "a card's four corners");
  assert.match(css, /\.sheetscrim \{\n  position: fixed; inset: 0; z-index: 64; display: flex; align-items: center; justify-content: center;\n  padding: 0;/, "in the middle of the screen");
  // the same arithmetic as the Feed: 375 → 359 (the grid's width there), 800 → 372, 1280 → 460 (the Feed's is 449 there, beside its rail)
  const w = (vw) => (vw < 560 ? vw - 16 : Math.min(vw / 2 - 28, 460));
  assert.equal(w(375), 359); assert.equal(w(800), 372); assert.equal(w(1280), 460);
  assert.match(css, /\.fgrid \{[^}]*grid-auto-rows: calc\(\(var\(--ed-feed-large, 80svh\) - 5 \* var\(--fgap\)\) \/ 6\);/s, "the Feed's large card is that height");
});

test("clear of the Masthead and the deck, centred all the same; a field lifts it", () => {
  assert.match(css, /--pop-clear: max\(calc\(var\(--head-h\) \+ 8px\), calc\(var\(--cc-row-h\) \+ var\(--cc-bottom\) \+ 8px\)\);/, "the larger clearance, both ends");
  assert.match(css, /body:has\(\.ccenter\[data-ad="line"\]\) \.sheetscrim \{ --cc-row-h: var\(--dk-h\); \}/, "the deck as it stands, its ticker folded");
  assert.match(css, /body:has\(\.ccenter\.ccsearching\[data-ad="line"\]\) \.sheetscrim \{ --cc-row-h: calc\(var\(--dk-h\) \+ var\(--dk-rise\)\); \}/, "and risen for the search");
  assert.match(css, /\.sheet\.typing \{ align-self: flex-start; margin-top: calc\(var\(--head-h\) \+ 8px\); \}/);
  assert.match(host, /if \(e\.target && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(e\.target\.tagName\)\) setTyping\(true\);/);
});
