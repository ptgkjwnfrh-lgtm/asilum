// tests/v2-deck-search.test.js — THE SEARCH BAR AND ITS ASTERISK BUTTON (owner, 28 Oct 2026: "the search bar
// be a little thinner and also make the asterisk button a solid red button with a negative cut out").
// Declared before measuring:
//   - the deck's search field is thinner than before (it filled the rise's 86 units, at most 44px) and
//     never under 28px (a finger's row);
//   - the ASTERISK toggle in BOTH search fields (the deck's bar and the search popup's own) is AMark solid:
//     a solid red square (--warn, red in both themes — not --red, which is green in the dark fixtures)
//     with the A cut through it by a mask (a true negative: what lies behind shows in the letter), on at
//     full strength and dimmed when off; every other AMark stays the outlined box.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel) => { const m = css.match(new RegExp("(^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}")); return m ? m[2] : ""; };

test("the search bar is a little thinner", () => {
  const f = rule(".ccfield");
  const m = f.match(/height: max\((\d+)px, calc\(var\(--u\) \* (\d+)\)\);/);
  assert.ok(m, "a measured height, not the rise's whole room");
  assert.ok(Number(m[2]) < 86, "thinner than the 86 units it filled");
  assert.ok(Number(m[1]) >= 28, "never under a finger's row");
  assert.ok(!/max-height: 44px/.test(f), "the old cap is gone");
});

test("the ASTERISK button is a solid red square with the A cut through it, in both search fields", () => {
  const am = read("app/components/AMark.jsx");
  assert.match(am, /<mask id=\{"am" \+ id\}[^>]*>\s*<rect width="20" height="20" fill="#fff" \/>\s*<text [^>]*className="amarkcut">A<\/text>\s*<\/mask>/, "a mask: white keeps, the A cuts");
  assert.match(am, /<rect width="20" height="20" rx="3\.5" fill="currentColor" mask=\{"url\(#am" \+ id \+ "\)"\} \/>/, "one solid square through the mask");
  assert.match(am, /const id = useId\(\)/, "a mask id per mark, so two on a page never collide");
  assert.match(rule(".amark.solid"), /color: var\(--warn\); opacity: 0\.42;/, "red in both themes, dimmed when off");
  assert.match(rule(".amark.solid.on"), /color: var\(--warn\); opacity: 1;/);
  assert.match(rule(".amarkcut"), /fill: black;/, "black in the mask cuts away");
  for (const f of ["app/components/ControlCenter.jsx", "app/components/SearchSheet.jsx"]) assert.match(read(f), /<AMark solid className=/, f + ": the search toggle is solid");
  for (const f of ["app/components/InfoDock.jsx", "app/settings/page.js", "app/orders/page.js"]) assert.ok(!/<AMark solid/.test(read(f)), f + ": elsewhere the mark stays the outlined box");
});
