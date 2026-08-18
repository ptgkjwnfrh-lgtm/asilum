// tests/type-stack.test.js — two faces, and the digi-cam face never comes back.
//
// Owner directive, 17 August: "get rid of the digi cam font, only the main font
// from now on." The digi-cam face was OSD (VT323), an LCD/pixel face that had
// spread to TWENTY-FIVE rules — counters, clocks, wire handles, the passport
// machine zone, breadcrumbs, the MAGAZINE line of the wordmark. It is gone, and
// everything it painted now uses the main font.
//
// What survives is deliberate and is not the same call: Michroma stays as the
// display face. It is the wordmark and every headline, and it is the face in the
// owner's own reference comp — retiring it would be a different instruction than
// the one given.
//
// This is a small file on purpose. A font that has been removed comes back one
// rule at a time, and the only reliable moment to stop that is the moment
// somebody types the name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");

test("the type stack is exactly two faces", () => {
  const css = read("app/globals.css");
  const faces = [...css.matchAll(/@font-face \{ font-family: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(faces.sort(), ["Michroma", "STM"],
    "a third @font-face means a face was added without a decision");

  // Michroma is the display voice, STM is everything else.
  assert.match(css, /--mich:\s*"Michroma", var\(--helv\)/);
  assert.match(css, /--helv:\s*"STM"/);
  assert.match(css, /--serif:\s*"STM"/);
});

test("the digi-cam face is gone, by name and by file", () => {
  // Comments may name it — one explains why the passport MRZ was resized when
  // the face changed, and that history is worth more than the purity of a
  // grep. Rules may not.
  const css = read("app/globals.css")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/--osd\b/.test(css), "the --osd token must not exist");
  assert.ok(!/"OSD"/.test(css), "the OSD family must not be declared");
  assert.ok(!/vt323/i.test(css), "no rule may reference the retired face");

  for (const f of ["vt323.woff2", "vt323.ttf", "OFL-vt323.txt"]) {
    assert.ok(!existsSync(ROOT + "public/fonts/" + f), `public/fonts/${f} must be deleted`);
  }
});

test("nothing in app/ or lib/ still asks for it", () => {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(ROOT + dir)) {
      const rel = `${dir}/${entry}`;
      if (statSync(ROOT + rel).isDirectory()) walk(rel);
      else if (/\.(js|jsx|css)$/.test(entry)) files.push(rel);
    }
  })("app");
  (function walk(dir) {
    for (const entry of readdirSync(ROOT + dir)) {
      const rel = `${dir}/${entry}`;
      if (statSync(ROOT + rel).isDirectory()) walk(rel);
      else if (/\.(js|jsx|css)$/.test(entry)) files.push(rel);
    }
  })("lib");

  // Comments may still explain the retirement — that history is worth keeping.
  // BLOCK comments have to go first: a `{/* … */}` in JSX has continuation lines
  // that start with neither "//" nor "*", so the line filter alone let a comment
  // in app/opengraph-image.js read as live code and failed this test.
  const codeOnly = (src) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");

  const offenders = [];
  for (const file of files) {
    const code = codeOnly(read(file.replace(/^\//, "")));
    if (/var\(--osd\)|"VT323"|vt323/i.test(code)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], "these still reference the retired face");
});

test("the font files that ship are only the two faces, in both formats", () => {
  const shipped = readdirSync(ROOT + "public/fonts").sort();
  assert.deepEqual(shipped, [
    "OFL-michroma.txt", "OFL-sharetechmono.txt",
    "michroma.ttf", "michroma.woff2",
    "sharetech.ttf", "sharetech.woff2",
  ].sort(), "public/fonts must hold exactly the two faces and their licences");
});
