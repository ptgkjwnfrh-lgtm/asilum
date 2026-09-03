// tests/stamp-recognition.test.js
// THE INVISIBLE MACHINERY LAW, as assertions (docs/INVISIBLE-MACHINERY.md).
//
// The feature is easy to keep working and easy to RUIN — one helpful "no
// matches found", one progress spinner, one "reverse image search" label, and
// the thing that made it worth building is gone. The mechanism is a commodity;
// the restraint is the product. So the restraint is what gets tested.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { dhashFromGray, hammingHex, DHASH_HAMMING_THRESHOLD } from "../lib/images/dhash.js";

const BOARD = readFileSync("app/board/page.js", "utf8");
const ROUTE = readFileSync("app/api/moodboard/route.js", "utf8");
const READER = readFileSync("lib/vision/stampReading.js", "utf8");
const CSS = readFileSync("app/globals.css", "utf8");

test("the same hash function runs on the server and in the browser", () => {
  // The whole feature rests on this. A stamp hashed in a canvas has to land on
  // the same 16 characters as a catalog image hashed by sharp, or nothing ever
  // matches — which is why the maths lives in a module with no sharp lineage.
  const grid = new Uint8Array(72);
  for (let i = 0; i < 72; i++) grid[i] = (i * 7) % 256;
  const hash = dhashFromGray(grid, 9, 8);
  assert.match(hash, /^[0-9a-f]{16}$/, "a dhash is 16 hex characters");
  assert.equal(dhashFromGray(grid, 9, 8), hash, "and it is deterministic");
  assert.equal(hammingHex(hash, hash), 0, "a hash matches itself exactly");
});

test("lib/images/dhash.js carries no server-only lineage", () => {
  // It is imported into the browser bundle. A `sharp` import here — even a
  // dynamic one — fails the client build, which is exactly how this split
  // came about.
  // The header legitimately EXPLAINS why sharp is absent, so prose is not the
  // test — what the module actually pulls in is.
  const src = readFileSync("lib/images/dhash.js", "utf8");
  const imports = src.split("\n").filter((l) => /^\s*(import|export .* from|const .*require\()/.test(l));
  assert.deepEqual(imports, [], "the pure hash module must import nothing at all");
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /sharp|node:fs|node:child_process/,
    "and no code path may reach for anything a browser lacks");
});

test("THE PHOTOGRAPH NEVER LEAVES THE DEVICE", () => {
  // The privacy property, and the reason the invisible version was also the
  // only respectful one. Only hashes may be posted.
  assert.match(BOARD, /stamps,/, "the board sends the stamps field");
  assert.doesNotMatch(BOARD, /body:\s*file|FormData\(|\.arrayBuffer\(\)/,
    "no file bytes may be posted from the stamp flow");
  assert.match(READER, /createImageBitmap/, "decoding happens on the device");
});

test("the server accepts only hashes, and only a handful", () => {
  assert.match(ROUTE, /\^\[0-9a-f\]\{16\}\$\/i\.test/,
    "stamps must be validated as 16-char hashes, never trusted");
  assert.match(ROUTE, /\.slice\(0, 6\)/, "and bounded");
});

test("NO EMPTY STATE — silence is the answer when there is nothing", () => {
  // "No results" is a confession that a search took place. The whole block is
  // absent, not empty.
  assert.match(BOARD, /recognized\.length > 0 &&/,
    "the recognition block renders only when there is something to show");
  assert.match(ROUTE, /\.\.\.\(recognized\.length \? \{ recognized \} : \{\}\)/,
    "and the key is absent from the response entirely when empty");
  for (const phrase of [/no matches/i, /nothing found/i, /no results/i, /0 matches/i]) {
    assert.doesNotMatch(BOARD, phrase, "the passport never reports an absence");
  }
});

test("NO VOCABULARY — the mechanism is never named to the reader", () => {
  // Everything a reader can see. Comments are stripped first, because the
  // source SHOULD explain itself; only the visible strings must stay innocent.
  const visible = BOARD
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const banned = [
    /reverse image/i, /image search/i, /\bdhash\b/i, /perceptual/i,
    /fingerprint/i, /hamming/i, /\bembedding/i, /similarity score/i,
  ];
  for (const word of banned) {
    assert.doesNotMatch(visible, word,
      `the reader must never see ${word} — see docs/INVISIBLE-MACHINERY.md`);
  }
});

test("NO CONTROL — there is no button that offers this", () => {
  const visible = BOARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // The trigger is the upload the person was already doing.
  assert.doesNotMatch(visible, /search by image|find similar|scan image|match image/i,
    "no affordance may advertise this capability");
});

test("the smallest true sentence, with no ceremony", () => {
  assert.match(BOARD, /the archive holds this one\./,
    "it states what is now true, not what the system did");
  // Scoped to the block a reader actually sees. `analyzePalette` elsewhere in
  // the file is an identifier, not a sentence — testing the whole file would
  // be measuring the wrong thing.
  const block = BOARD.slice(BOARD.indexOf('className="stampknow"'),
                            BOARD.indexOf("stampknow-row") + 400);
  assert.doesNotMatch(block, /searching|analyz|scanning|processing|match/i,
    "the visible block never narrates its own work");
});

test("it speaks only at the SAME-PHOTOGRAPH threshold", () => {
  // A recognition that is sometimes wrong is not magic, it is a bug with good
  // lighting. findImageCollisions defaults to this, and the route does not
  // loosen it.
  assert.equal(DHASH_HAMMING_THRESHOLD, 6);
  assert.doesNotMatch(ROUTE, /maxHamming:\s*(1[0-9]|[7-9])/,
    "the route must not widen the threshold to find more");
});

test("it arrives like noticing, not like a result", () => {
  assert.match(CSS, /@keyframes stampknow-in/, "it settles in rather than snapping");
  assert.match(CSS, /prefers-reduced-motion[\s\S]*?\.stampknow \{ animation: none/,
    "and respects reduced motion");
});
