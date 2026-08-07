// tests/vision-embed.test.js — image embedding v0 (r27).
//
// The catalog has no photographs, so this battery cannot and does not claim the
// descriptor is good at fashion. What it CAN establish, and what everything
// later will rest on, is that the arithmetic does what the module says:
//
//   · each of the three blocks is LOAD-BEARING — there are image pairs that
//     only that block can tell apart, proved by neutralising it and watching
//     the discrimination vanish;
//   · similar things score similar and different things do not;
//   · the same pixels always give the same vector.
//
// Every image here is generated in-process with known properties, so a failure
// points at the code rather than at a photograph nobody can inspect.

import test from "node:test";
import assert from "node:assert/strict";

import {
  embedImage, imageSim, blockSimilarities, nearestByImage,
  IMAGE_EMBED_DIM, IMAGE_EMBED_VERSION, BLOCK_WEIGHTS,
  COLOR_DIM, TEXTURE_DIM, LAYOUT_DIM,
} from "../lib/vision/embed.js";

/** Build a flat RGBA buffer from a per-pixel function. */
function img(w, h, fn) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, al = 255] = fn(x, y, w, h);
      const i = (y * w + x) * 4;
      a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = al;
    }
  }
  return a;
}
const solid = (w, h, rgb) => img(w, h, () => rgb);
const DARK = [60, 60, 60], LIGHT = [200, 200, 200];
const COLOR_ONLY = { color: 1, texture: 0, layout: 0 };
const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

// ---- shape and determinism --------------------------------------------------

test("the declared layout is the layout the code produces", () => {
  assert.equal(COLOR_DIM + TEXTURE_DIM + LAYOUT_DIM, IMAGE_EMBED_DIM);
  assert.equal(IMAGE_EMBED_DIM, 50);
  assert.equal(IMAGE_EMBED_VERSION, "image-v0");
  const total = BLOCK_WEIGHTS.color + BLOCK_WEIGHTS.texture + BLOCK_WEIGHTS.layout;
  assert.ok(Math.abs(total - 1) < 1e-9, `block weights must sum to 1, got ${total}`);
});

test("a vector is unit length, correctly sized, and identical for identical pixels", () => {
  const a = embedImage(img(32, 48, (x, y) => [x * 4 % 256, y * 3 % 256, 120]), 32);
  const b = embedImage(img(32, 48, (x, y) => [x * 4 % 256, y * 3 % 256, 120]), 32);
  assert.equal(a.length, IMAGE_EMBED_DIM);
  assert.ok(Math.abs(norm(a) - 1) < 1e-9, `must be unit length, got ${norm(a)}`);
  assert.deepEqual(Array.from(a), Array.from(b), "same pixels must give the same vector");
  assert.ok(Math.abs(imageSim(a, b) - 1) < 1e-9, "and therefore cosine 1 with itself");
});

// ---- colour -----------------------------------------------------------------

test("colour: near shades score closer than far ones", () => {
  const red = embedImage(solid(24, 32, [200, 40, 40]), 24);
  const darkRed = embedImage(solid(24, 32, [130, 25, 25]), 24);
  const black = embedImage(solid(24, 32, [16, 16, 18]), 24);
  const blue = embedImage(solid(24, 32, [40, 60, 200]), 24);
  assert.ok(imageSim(red, darkRed) > imageSim(red, black),
    `red~darkRed ${imageSim(red, darkRed).toFixed(3)} must beat red~black ${imageSim(red, black).toFixed(3)}`);
  assert.ok(imageSim(red, darkRed) > imageSim(red, blue),
    "and must beat a different hue entirely");
});

// ---- texture is load-bearing ------------------------------------------------

test("TEXTURE: two images with IDENTICAL colour histograms, told apart only by busyness", () => {
  // Both are exactly half dark and half light pixels — the colour block cannot
  // distinguish them even in principle.
  const stripes = img(32, 48, (x) => (x % 2 === 0 ? DARK : LIGHT));
  const halves = img(32, 48, (x, y, w) => (x < w / 2 ? DARK : LIGHT));
  const a = embedImage(stripes, 32), b = embedImage(halves, 32);

  const blocks = blockSimilarities(a, b);
  assert.ok(blocks.color > 0.999,
    `colour must be blind to the difference: ${blocks.color.toFixed(4)}`);
  // 0.85, not the 0.6 I first guessed. MEASURED at 0.7222 — the block
  // separates the pair decisively against colour's 0.9993, but a 2-pixel
  // stripe and a single edge share more gradient structure than I expected.
  // The bound is set from the measurement and the guess is recorded rather
  // than quietly overwritten; the MUTANT below is what actually proves the
  // block is load-bearing, and it does not depend on this number at all.
  assert.ok(blocks.texture < 0.85,
    `texture must see it clearly: ${blocks.texture.toFixed(4)}`);
  assert.ok(imageSim(a, b) < 0.95, "so the vectors are meaningfully apart");

  // MUTANT: neutralise texture and layout. If the pair is now indistinguishable,
  // the texture block is doing the work rather than riding along.
  const am = embedImage(stripes, 32, { weights: COLOR_ONLY });
  const bm = embedImage(halves, 32, { weights: COLOR_ONLY });
  assert.ok(imageSim(am, bm) > 0.999,
    `without texture these MUST collapse together: ${imageSim(am, bm).toFixed(4)}`);
});

// ---- layout is load-bearing -------------------------------------------------

test("LAYOUT: same colours, same busyness, opposite arrangement", () => {
  // One horizontal edge each, 50/50 colour split each. Only WHERE differs.
  const darkTop = img(32, 48, (x, y, w, h) => (y < h / 2 ? DARK : LIGHT));
  const lightTop = img(32, 48, (x, y, w, h) => (y < h / 2 ? LIGHT : DARK));
  const a = embedImage(darkTop, 32), b = embedImage(lightTop, 32);

  const blocks = blockSimilarities(a, b);
  assert.ok(blocks.color > 0.999, `colour is blind here too: ${blocks.color.toFixed(4)}`);
  assert.ok(blocks.texture > 0.999, `and so is texture: ${blocks.texture.toFixed(4)}`);
  assert.ok(blocks.layout < 0.95, `layout must carry it alone: ${blocks.layout.toFixed(4)}`);

  // MUTANT: with layout neutralised, a garment that is dark on top and one that
  // is dark on the bottom become the same object.
  const am = embedImage(darkTop, 32, { weights: COLOR_ONLY });
  const bm = embedImage(lightTop, 32, { weights: COLOR_ONLY });
  assert.ok(imageSim(am, bm) > 0.999,
    `without layout these MUST collapse together: ${imageSim(am, bm).toFixed(4)}`);
});

// ---- resolution ------------------------------------------------------------

test("all three blocks survive a PROPORTIONAL resolution change", () => {
  // I expected to be asserting the opposite here. The reasoning was that a
  // gradient histogram counts adjacent-pixel differences, so doubling the
  // resolution should halve every local step and shift the distribution.
  // MEASURED, texture holds at 0.9922 — because when the STRUCTURE scales with
  // the image, the ratio of edge pairs to flat pairs is preserved. The
  // prediction was wrong and the test now records what happens instead.
  //
  // What this does NOT establish, and no test here can: a photograph carries
  // fine detail at a fixed pixel scale (weave, grain, sensor noise) that does
  // not scale with the frame, and that is exactly the case this fixture cannot
  // build. Embedding everything at one canonical size therefore stays the
  // house rule — now as prudence about an untested case rather than as a
  // proven necessity.
  const pattern = (x, y, w, h) => ((Math.floor(x / (w / 8)) + Math.floor(y / (h / 8))) % 2 ? DARK : LIGHT);
  const small = embedImage(img(32, 48, pattern), 32);
  const big = embedImage(img(64, 96, pattern), 64);
  const blocks = blockSimilarities(small, big);
  assert.ok(blocks.color > 0.99, `colour: ${blocks.color.toFixed(4)}`);
  assert.ok(blocks.layout > 0.99, `layout: ${blocks.layout.toFixed(4)}`);
  assert.ok(blocks.texture > 0.99, `texture, contrary to my expectation: ${blocks.texture.toFixed(4)}`);
  assert.ok(imageSim(small, big) > 0.99, "so the same picture at two sizes is the same vector");
});

// ---- degenerate inputs ------------------------------------------------------

test("nothing describable returns null, never a zero vector", () => {
  // A zero vector would score cosine 0 against everything and read as
  // "maximally different" rather than "unknown" — a silent wrong answer.
  assert.equal(embedImage(new Uint8ClampedArray(0), 0), null, "empty");
  assert.equal(embedImage(solid(1, 40, [10, 10, 10]), 1), null, "one pixel wide has no neighbours");
  assert.equal(embedImage(img(20, 20, () => [10, 10, 10, 0]), 20), null, "fully transparent");
  // 9 opaque pixels, under the floor of 16. (My first version used 4x4 = 16
  // exactly and failed on the boundary being inclusive — worth keeping the
  // case just off it rather than on it.)
  assert.equal(embedImage(img(3, 3, () => [10, 10, 10]), 3), null, "below the opaque-pixel floor");
  assert.equal(imageSim(null, embedImage(solid(20, 20, [1, 2, 3]), 20)), 0, "similarity with null is 0");
  assert.equal(blockSimilarities(null, null), null);
});

test("transparent pixels are excluded, not counted as black", () => {
  const opaqueRed = embedImage(solid(24, 32, [200, 40, 40]), 24);
  // The same red, with a transparent margin that would read as a huge black
  // region if alpha were ignored.
  const withMargin = embedImage(
    img(24, 32, (x, y, w, h) => (x < 4 || x >= w - 4 ? [0, 0, 0, 0] : [200, 40, 40, 255])), 24);
  assert.ok(blockSimilarities(opaqueRed, withMargin).color > 0.99,
    "a transparent border must not change what colour the image is");
});

// ---- retrieval --------------------------------------------------------------

test("nearest-by-appearance retrieves the right piece from a gallery", () => {
  const W = 32, H = 48;
  const gallery = [
    { id: "black-smooth", rgba: solid(W, H, [22, 22, 26]) },
    { id: "red-smooth", rgba: solid(W, H, [200, 40, 40]) },
    { id: "olive-textured", rgba: img(W, H, (x, y) => ((x + y) % 3 ? [88, 94, 58] : [70, 76, 44])) },
    { id: "cream-striped", rgba: img(W, H, (x, y) => (y % 4 < 2 ? [232, 222, 200] : [205, 190, 160])) },
  ].map((g) => ({ id: g.id, vector: embedImage(g.rgba, W) }));

  // A query that is the olive piece photographed slightly differently: same
  // aesthetic, small shifts in every channel.
  const query = embedImage(img(W, H, (x, y) => ((x + y) % 3 ? [94, 100, 63] : [76, 82, 49])), W);
  const hits = nearestByImage(query, gallery, { limit: 4 });
  assert.equal(hits[0].id, "olive-textured", `got ${hits.map((h) => h.id).join(" > ")}`);
  assert.ok(hits[0].sim > hits[1].sim, "and it wins by a margin, not a tie");

  assert.deepEqual(nearestByImage(null, gallery), [], "no query, no guesses");
  assert.equal(nearestByImage(query, gallery, { floor: 0.999 }).length <= 1,
    true, "the similarity floor is honoured");
});

test("blockSimilarities explains WHY two images match", () => {
  const a = embedImage(img(32, 48, (x) => (x % 2 ? DARK : LIGHT)), 32);
  const b = embedImage(img(32, 48, (x, y, w) => (x < w / 2 ? DARK : LIGHT)), 32);
  const why = blockSimilarities(a, b);
  assert.deepEqual(Object.keys(why).sort(), ["color", "layout", "texture"]);
  for (const v of Object.values(why)) assert.ok(v >= -1 && v <= 1, "cosines stay in range");
  // The engine explains every other decision it makes; a visual match that
  // could not say "same colour, different texture" would be the one opaque
  // thing in it.
  assert.ok(why.color > why.texture, "and here the honest answer is: same colours, different texture");
});
