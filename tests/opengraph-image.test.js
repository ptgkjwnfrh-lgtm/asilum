// tests/opengraph-image.test.js — the social card is drawn from the real tokens
// and says what the page says.
//
// Satori resolves no CSS variables and reads no stylesheet, so
// app/opengraph-image.js hardcodes five colours. That is a second copy of the
// design language, and this repo has already watched a palette move twice in two
// days for contrast (#216 moved --sig, #218/#219 moved --red and --p2). A copy
// nothing checks is a copy that goes stale, so these tests READ app/globals.css
// and fail if the card and the stylesheet disagree — the same discipline as
// tests/theme-contrast.test.js, which recomputes its ratios from the stylesheet
// rather than trusting a number written down next to them.
//
// The card was also verified as a real artifact, not just as source: served from
// a running server it returns `content-type: image/png`, a valid PNG signature,
// and 1200x630 read out of the IHDR chunk.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");

const card = () => read("app/opengraph-image.js");

// The :root block only — a token also defined under [data-theme="light"] must
// not be read from there, and this is bounded to the first block rather than
// reaching across the file.
function rootTokens() {
  const css = read("app/globals.css");
  const start = css.indexOf(":root {");
  assert.ok(start >= 0, "globals.css must have a :root block");
  const block = css.slice(start, css.indexOf("}", start));
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

test("every colour on the card is the live token value", () => {
  const tokens = rootTokens();
  const src = card();
  // name in the card -> token in globals.css
  const pairs = [["BG", "bg"], ["INK", "ink"], ["RED", "red"], ["SIG", "sig"], ["GREY", "grey"]];
  for (const [constant, token] of pairs) {
    const declared = src.match(new RegExp(`const ${constant} = "([^"]+)";`));
    assert.ok(declared, `the card must declare ${constant}`);
    assert.equal(declared[1].toLowerCase(), tokens[token].toLowerCase(),
      `${constant} on the card has drifted from --${token} in globals.css`);
  }
});

test("the card declares the size a large summary card needs", () => {
  const src = card();
  assert.match(src, /export const size = \{ width: 1200, height: 630 \};/);
  assert.match(src, /export const contentType = "image\/png";/);
  // alt is not decoration — it is what a screen reader announces for the card.
  assert.match(src, /export const alt =/);
});

test("the card carries the same honesty the catalog page does", () => {
  const src = card();
  // A shared link reaches people who have not seen the page's DEMO banner. If
  // this ever has to go, docs/seo-notes.md has to change in the same commit.
  assert.match(src, /the taste engine is real — the clothes are not/);
  assert.match(src, /A DEMO ARCHIVE OF SYNTHETIC SAMPLE RECORDS/);
  // And it must not claim inventory. `real` appears in the honest sentence, so
  // the check is for the specific promises, not for a bare word.
  for (const claim of ["shop now", "buy now", "in stock", "free shipping"]) {
    assert.ok(!src.toLowerCase().includes(claim), `the card must not promise "${claim}"`);
  }
});

test("the card and the twitter card size ship together", () => {
  // The pairing, from this side. tests/seo.test.js holds the other side.
  assert.ok(existsSync(ROOT + "app/opengraph-image.js"));
  assert.match(read("app/layout.js"), /card:\s*"summary_large_image"/);
});

test("the card does not claim a typeface it cannot load", () => {
  const src = card();
  // Satori reads TTF/OTF/WOFF; the brand faces are WOFF2, so no font is passed
  // and a fontFamily/fontWeight declaration would be inert — describing a card
  // that does not render. Both were removed after looking at the output.
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  assert.ok(!/fontFamily/.test(code), "fontFamily is ignored — no font is loaded");
  assert.ok(!/fontWeight/.test(code), "the built-in face ships one weight");
  assert.ok(!/\.woff2/.test(code), "Satori cannot read WOFF2");
});
