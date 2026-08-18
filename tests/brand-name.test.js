// tests/brand-name.test.js — the name is "*ASILUM magazine" and the word
// magazine is never dropped.
//
// Owner directive, 17 August. It was being dropped in fourteen places, all of
// them metadata: the title template, every segment layout's title and siteName,
// the piece page, the og/twitter titles. The shell wordmark had it right the
// whole time (`<i>*</i>ASILUM<em>MAGAZINE</em>`), which is exactly why nobody
// noticed — the name looked correct on every page and was wrong in every
// browser tab, every search result and every shared link.
//
// This is a naming rule, so it is enforced as one: any user-visible "*ASILUM"
// anywhere in app/ must be followed by magazine. New pages inherit the rule
// without anyone remembering it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");

function walk(dir, out = []) {
  for (const entry of readdirSync(ROOT + dir)) {
    const rel = `${dir}/${entry}`;
    if (statSync(ROOT + rel).isDirectory()) walk(rel, out);
    else if (/\.(js|jsx)$/.test(entry)) out.push(rel);
  }
  return out;
}

// Comment lines are exempt — a file header naming the project is not a reader
// surface, and app/globals.css line 1 is the same case.
const codeOnly = (src) =>
  src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

test("the word magazine is never dropped from the name", () => {
  const offenders = [];
  for (const file of walk("app")) {
    const code = codeOnly(read(file.replace(/^\//, "")));
    // The shell wordmark writes it as markup — `*` element, ASILUM, then a
    // MAGAZINE element — so it is matched on its own terms rather than exempted
    // wholesale, which would let a real regression hide in that one file.
    const stripped = code.replace(/<i>\*<\/i>ASILUM<em>MAGAZINE<\/em>/g, "");
    for (const m of stripped.matchAll(/\*ASILUM(.{0,12})/g)) {
      if (!/^\s*(magazine|MAGAZINE)/.test(m[1])) {
        offenders.push(`${file}: "*ASILUM${m[1]}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], "these drop the magazine from *ASILUM magazine");
});

test("the metadata a browser tab and a search result actually show", () => {
  // Positive assertions: the guard above would also pass if these strings were
  // simply deleted.
  const layout = read("app/layout.js");
  // "fashion intelligence OS" was retired 17 Aug — the app is a PERSONALIZED
  // FASHION TERMINAL and nothing else. tests/copy-law.test.js owns that rule.
  assert.match(layout, /default: "\*ASILUM magazine — personalized fashion terminal"/);
  assert.match(layout, /template: "%s · \*ASILUM magazine"/);
  assert.match(layout, /siteName: "\*ASILUM magazine"/);

  for (const seg of ["cover", "discover", "hotlist", "stylist"]) {
    const src = read(`app/${seg}/layout.js`);
    assert.match(src, /siteName: "\*ASILUM magazine"/, `${seg} siteName`);
    assert.match(src, /title: "[A-Z' ]+ · \*ASILUM magazine"/, `${seg} title`);
  }
  assert.match(read("app/piece/[id]/page.js"), /siteName: "\*ASILUM magazine"/);
});

test("the social card says the full name", () => {
  const card = read("app/opengraph-image.js");
  // The card sets it in two pieces — the chrome wordmark and the phosphor
  // sub-line — so the check is that BOTH are there, plus the alt text a screen
  // reader announces, which is the one place it must read as one string.
  assert.match(card, />\s*ASILUM\s*</, "the wordmark");
  assert.match(card, />\s*magazine\.com\s*</, "the sub-line — never dropped");
  assert.match(read("app/opengraph-image.js"), /alt =\s*\n?\s*"\*ASILUM magazine —/);
});
