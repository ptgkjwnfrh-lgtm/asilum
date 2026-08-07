// tests/image-gamma.test.js — visual similarity in the gamma bridge (r27).
//
// Gamma answers "does this go WITH what you engaged with". It now has three
// kinds of evidence and this battery is about the ORDERING between them, plus
// the one property that matters most in production today:
//
//   THE FEED IS BYTE-IDENTICAL UNTIL PIXELS EXIST.
//
// The catalog carries no photographs, so visual gamma contributes nothing to
// any real request. That has to be ASSERTED, not assumed — a feature that
// quietly perturbs ranking while claiming to be inert is precisely the r14/r16
// failure this codebase spent August undoing, and the only reason it was found
// then was that someone finally checked.

import test from "node:test";
import assert from "node:assert/strict";

import { buildFeed } from "../lib/brain/index.js";
import { blendedScore, buildImgNear } from "../lib/brain/bridges.js";
import { IMAGE_EMBED_DIM } from "../lib/vision/embed.js";

// Synthetic unit vectors in the image space. Real photographs are not needed
// to test the WIRING — only vectors of the right shape with known angles
// between them, which is exactly what can be constructed honestly here.
function unitVec(seedAngle) {
  const v = new Float64Array(IMAGE_EMBED_DIM);
  v[0] = Math.cos(seedAngle);
  v[1] = Math.sin(seedAngle);
  return v;
}
const IDENTICAL = 0;                    // cos = 1.000
const CLOSE = Math.acos(0.95);          // cos = 0.950  — above the 0.80 floor
const WEAK = Math.acos(0.5);            // cos = 0.500  — below the floor

const ITEM = { id: "cand", tags: { MINIMAL: 0.8 }, brand: "X" };
const ANCHOR = "anchor-1";
const TASTE = { MINIMAL: 0.5 };
const gammaOf = (ctx) => blendedScore(ITEM, TASTE, ctx).parts.gamma;

function ctxWith(candAngle, { edges = {}, recent = [ANCHOR] } = {}) {
  const vectors = { [ANCHOR]: unitVec(0), [ITEM.id]: unitVec(candAngle) };
  return { recent, edges, imgNear: buildImgNear(recent, vectors) };
}

// ---- the property that matters in production today --------------------------

test("INERT WITHOUT PIXELS: no image vectors changes nothing at all", () => {
  const state = { profile: { long: { MINIMAL: 0.9 }, session: {}, _meta: { recent: [ANCHOR], seen: [] } }, limit: 30 };
  const base = buildFeed(structuredClone(state));
  for (const supplied of [undefined, null, {}, new Map()]) {
    const withField = buildFeed({ ...structuredClone(state), imageVectors: supplied });
    assert.deepEqual(
      withField.items.map((it) => [it.id, it._score, it._zone, it._bridge]),
      base.items.map((it) => [it.id, it._score, it._zone, it._bridge]),
      `imageVectors=${JSON.stringify(supplied)} must leave the feed byte-identical`
    );
  }
});

test("buildImgNear refuses to invent a map from nothing", () => {
  const vectors = { [ANCHOR]: unitVec(0), cand: unitVec(IDENTICAL) };
  assert.equal(buildImgNear([], vectors), null, "no recents, no anchors");
  assert.equal(buildImgNear([ANCHOR], null), null, "no vectors at all");
  assert.equal(buildImgNear(["never-seen"], vectors), null, "no anchor carries a vector");
  assert.ok(buildImgNear([ANCHOR], vectors), "...but a real anchor does produce one");
});

test("a vector of the wrong width is SKIPPED, never coerced", () => {
  // The r18/#135 lesson: a wrong-width vector is a vector from another model or
  // another version. Scoring against a stale embedding space silently is the
  // failure artifact hashing exists to prevent.
  const stale = new Float64Array(8); stale[0] = 1;
  assert.equal(buildImgNear([ANCHOR], { [ANCHOR]: stale, cand: unitVec(0) }), null,
    "a stale ANCHOR cannot anchor anything");
  const near = buildImgNear([ANCHOR], { [ANCHOR]: unitVec(0), good: unitVec(0), bad: stale });
  assert.ok(near.has("good"));
  assert.equal(near.has("bad"), false, "a stale CANDIDATE is not scored");
});

// ---- the floor --------------------------------------------------------------

test("THE FLOOR: a weak visual match contributes nothing, not a small something", () => {
  // "Both are darkish" is not a reason to recommend something. Below 0.80 the
  // source is silent rather than quietly nudging every dark item upward.
  assert.equal(gammaOf(ctxWith(WEAK)), 0, "cos 0.50 must score exactly zero gamma");
  assert.ok(gammaOf(ctxWith(CLOSE)) > 0, "cos 0.95 must count");
  assert.equal(buildImgNear([ANCHOR], { [ANCHOR]: unitVec(0), cand: unitVec(WEAK) }), null,
    "and it never even enters the map");
});

test("an anchor is never its own visual neighbour", () => {
  // Found by this battery rather than by design: without the exclusion an
  // anchor scores a perfect 1.0 against its own map, and gamma recommends the
  // reader the exact piece they just engaged with. Gamma answers "what goes
  // WITH this", and a thing does not go with itself.
  const near = buildImgNear([ANCHOR], { [ANCHOR]: unitVec(0), other: unitVec(CLOSE) });
  assert.equal(near.has(ANCHOR), false, "the anchor must not appear among its own neighbours");
  assert.ok(near.has("other"), "while a genuinely similar OTHER piece does");
  // and with only the anchor present there is nothing to recommend at all
  assert.equal(buildImgNear([ANCHOR], { [ANCHOR]: unitVec(0) }), null);
});

test("a strong visual match scores the declared discount", () => {
  assert.ok(Math.abs(gammaOf(ctxWith(IDENTICAL)) - 0.45) < 1e-9,
    "an identical-looking piece scores the full 0.45 visual ceiling");
  assert.ok(Math.abs(gammaOf(ctxWith(CLOSE)) - 0.95 * 0.45) < 1e-9);
});

// ---- the ordering between the three sources ---------------------------------

test("ORDERING: behaviour that is corroborated beats even a perfect visual match", () => {
  // Eight distinct people co-engaged these two pieces: 8/(8+2) = 0.8.
  const corroborated = ctxWith(IDENTICAL, { edges: { [ANCHOR]: { [ITEM.id]: 8 } } });
  assert.ok(Math.abs(gammaOf(corroborated) - 0.8) < 1e-9,
    `real behaviour must win: ${gammaOf(corroborated)}`);
  assert.ok(gammaOf(corroborated) > gammaOf(ctxWith(IDENTICAL)),
    "and it must beat what the visual match alone would have scored");
});

test("ORDERING: a strong visual match narrowly beats ONE unverified person's click", () => {
  // #121's law: a solo identity scores 0.333 and must never lift an item above
  // what corroborated evidence would give it. The visual floor was chosen so
  // the weakest match that counts (0.80 x 0.45 = 0.36) lands just above it —
  // derived, not picked, and asserted here so the two constants cannot drift
  // apart silently.
  const soloEdge = { [ANCHOR]: { [ITEM.id]: 1 } };
  const soloOnly = gammaOf({ recent: [ANCHOR], edges: soloEdge });
  assert.ok(Math.abs(soloOnly - 1 / 3) < 1e-9, `one contributor scores 0.333, got ${soloOnly}`);

  const atFloor = buildImgNear([ANCHOR], { [ANCHOR]: unitVec(0), [ITEM.id]: unitVec(Math.acos(0.8)) });
  const withFloorMatch = gammaOf({ recent: [ANCHOR], edges: soloEdge, imgNear: atFloor });
  assert.ok(withFloorMatch > soloOnly,
    `the weakest counting visual match (${withFloorMatch}) must edge out a solo click (${soloOnly})`);
  assert.ok(withFloorMatch < 0.37, "but only just — it is not allowed to run away with the bridge");
});

test("ORDERING: visual never outranks the text-vector ceiling", () => {
  // Text embeddings carry semantics; v0 pixels do not. The ceilings encode
  // that: 0.6 for text, 0.45 for visual. A perfect visual match must not beat
  // a merely good text match.
  const perfectVisual = gammaOf(ctxWith(IDENTICAL));
  const goodText = gammaOf({ recent: [ANCHOR], edges: {}, vecNear: new Map([[ITEM.id, 0.85]]) });
  assert.ok(goodText > perfectVisual,
    `text 0.85x0.6=${goodText.toFixed(3)} must beat visual 1.00x0.45=${perfectVisual.toFixed(3)}`);
});

test("the three sources combine by MAX, so adding one can only raise gamma", () => {
  const none = gammaOf({ recent: [ANCHOR], edges: {} });
  const visual = gammaOf(ctxWith(CLOSE));
  const both = gammaOf(ctxWith(CLOSE, { edges: { [ANCHOR]: { [ITEM.id]: 8 } } }));
  assert.equal(none, 0);
  assert.ok(both >= visual, "a new source must never LOWER the bridge");
  assert.ok(visual > none);
});

// ---- the switch -------------------------------------------------------------

test("BRAIN_IMAGE_GAMMA=0 restores the pre-r27 bridge exactly", () => {
  const vectors = { [ANCHOR]: unitVec(0), [ITEM.id]: unitVec(IDENTICAL) };
  process.env.BRAIN_IMAGE_GAMMA = "0";
  const offMap = buildImgNear([ANCHOR], vectors);
  const off = gammaOf({ recent: [ANCHOR], edges: {}, imgNear: offMap });
  delete process.env.BRAIN_IMAGE_GAMMA;
  assert.equal(offMap, null, "the switch stops the map being built at all");
  assert.equal(off, gammaOf({ recent: [ANCHOR], edges: {} }),
    "and the score is identical to a world with no image vectors");
});

test("determinism: the same vectors always give the same bridge", () => {
  const a = gammaOf(ctxWith(CLOSE));
  const b = gammaOf(ctxWith(CLOSE));
  assert.equal(a, b);
});
