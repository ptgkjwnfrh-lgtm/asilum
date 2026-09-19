// Fit hints reach the ladder (V.2, 19 Sep 2026).
//
// Law 1: "too small" on a house's piece reads that house's pieces one size
//        smaller for THIS reader — the label stays, the fit moves, and it
//        moves in every consumer: the feed ladder filter, the stylist's fit
//        score, the fit sentence.
// Law 2: a hint is scoped to the brand (and the category when it has one),
//        votes cancel on a tie, and nothing outside fit moves.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fitHintFor, applyFitHint, sizeWithHints, poolWithFitHints } from "../lib/brain/fitHints.js";
import { fitAssessment, fitPhrase, sizeRecord } from "../lib/brain/sizing.js";
import { recordCorrection } from "../lib/asterisk/explain.js";
import { getUserRecommendationExclusions } from "../lib/db/production.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { callRoute, loadRoute, newDevice } from "./helpers/route.js";

// a house with no curated BRAND_BIAS in sizing.js, so the hint is the only thing moving the fit
const HOUSE = "Atelier Nobody";
const hints = [{ direction: "runs-small", brand: HOUSE, category: "tops" }];

test("law 2: a hint matches its brand and category, votes cancel on a tie, and never leaks to another house", () => {
  assert.equal(fitHintFor(HOUSE, "tops", hints).direction, "runs-small");
  assert.equal(fitHintFor(HOUSE.toLowerCase(), "tops", hints).direction, "runs-small", "brand folds");
  assert.equal(fitHintFor("Atelier Nobodý", "tops", hints).direction, "runs-small", "accents fold");
  assert.equal(fitHintFor(HOUSE, "outerwear", hints), null, "a category hint speaks for its category only");
  assert.equal(fitHintFor("Gucci", "tops", hints), null);
  assert.equal(fitHintFor(HOUSE, "tops", [{ direction: "runs-small", brand: HOUSE, category: null }]).direction, "runs-small", "a house-wide hint");
  assert.equal(fitHintFor(HOUSE, "tops", [...hints, { direction: "runs-large", brand: HOUSE, category: "tops" }]), null, "a tie says nothing");
  assert.equal(fitHintFor(HOUSE, "tops", []), null);
  assert.equal(fitHintFor(null, "tops", hints), null);
});

test("law 1: the label stays, the fit moves one step, and the record says so", () => {
  const rec = sizeRecord("M", { category: "tops" });
  const read = applyFitHint(rec, fitHintFor(HOUSE, "tops", hints));
  assert.equal(read.label, "M");
  assert.equal(read.fitsLikeUS, "S");
  assert.equal(read.runsBias, 1, "positive = runs small, as sizing.js defines it");
  assert.deepEqual(read.hint, { direction: "runs-small", brand: HOUSE, category: "tops", from: "M", to: "S" });
  assert.equal(rec.fitsLikeUS, "M", "the original record is untouched");
  const large = applyFitHint(rec, { direction: "runs-large", steps: 1, brand: HOUSE, category: null });
  assert.equal(large.fitsLikeUS, "L");
  const floor = applyFitHint(sizeRecord("XXS", { category: "tops" }), fitHintFor(HOUSE, "tops", hints));
  assert.equal(floor.fitsLikeUS, "XXS", "the ladder clamps at its end");
  const item = { brand: HOUSE, category: "tops", size: rec };
  assert.equal(sizeWithHints(item, hints).fitsLikeUS, "S");
  assert.equal(sizeWithHints({ brand: "Gucci", category: "tops", size: rec }, hints), rec, "no hint, the same object");
  const pool = poolWithFitHints([item, { brand: "Gucci", size: rec }], hints);
  assert.equal(pool[0].size.fitsLikeUS, "S");
  assert.equal(pool[1].size, rec);
  assert.equal(poolWithFitHints([item], []).length, 1);
});

test("law 1: the assessment and the sentence read the corrected fit, and the sentence says why", () => {
  const rec = sizeRecord("M", { category: "tops", brand: HOUSE });
  assert.equal(rec.brand, HOUSE, "a size record now carries its brand");
  const profile = { usualSize: "S", measurements: {}, fitHints: hints };
  const plain = fitAssessment(rec, { usualSize: "S", measurements: {} });
  assert.equal(plain.status, "close", "without the hint, M against S is one step off");
  const hinted = fitAssessment(rec, profile);
  assert.equal(hinted.status, "size-match", "with the hint, this house's M reads as an S");
  assert.equal(hinted.hint.direction, "runs-small");
  const sentence = fitPhrase(rec, profile);
  assert.match(sentence, /matches your usual size/);
  assert.match(sentence, /read one size smaller for you/);
  assert.doesNotMatch(fitPhrase(rec, { usualSize: "S", measurements: {} }), /read one size/);
  // an unrelated house is not read through the hint
  const gucci = sizeRecord("M", { category: "tops", brand: "Gucci" });
  assert.equal(fitAssessment(gucci, profile).status, "close");
});

test("law 1: a recorded 'too small' becomes a hint the feed ladder and the measurements route hand out", async () => {
  const me = newDevice();
  const piece = CATALOG.find((it) => it.size && typeof it.size === "object" && it.size.fitsLikeUS === "M" && it.brand && it.category);
  assert.ok(piece, "a catalog M");
  const r = await recordCorrection(me.uid, { productId: piece.id, code: "too-small" });
  assert.equal(r.ok, true, r.error);
  const ex = await getUserRecommendationExclusions(me.uid);
  assert.equal(ex.fitHints.length, 1);
  const read = sizeWithHints(piece, ex.fitHints);
  assert.equal(read.fitsLikeUS, "S", "the piece the reader corrected now reads as an S for them");
  const measurements = await loadRoute("app/api/measurements/route.js");
  const res = await callRoute(measurements.GET, { path: "/api/measurements", cookies: me.cookies, query: { user: me.uid } });
  assert.equal(res.status, 200);
  assert.equal(res.body.fitHints.length, 1, "the client's fit profile can carry the hint");
  assert.equal(res.body.fitHints[0].brand, piece.brand);
  const other = newDevice();
  const stranger = await callRoute(measurements.GET, { path: "/api/measurements", cookies: other.cookies, query: { user: me.uid } });
  assert.equal(stranger.status, 200);
  assert.deepEqual(stranger.body.fitHints, [], "a claim of someone else's id resolves to the caller's own cookie — their own (empty) hints, never mine");
  // the feed reads the pool through the hints before its ladder filter
  const feed = fs.readFileSync(new URL("../app/api/feed/route.js", import.meta.url), "utf8");
  assert.match(feed, /poolWithFitHints\(pool, exclusions/);
  const outfits = fs.readFileSync(new URL("../app/api/outfits/route.js", import.meta.url), "utf8");
  assert.match(outfits, /fitHints: exclusions/);
  const stylist = fs.readFileSync(new URL("../lib/brain/stylist.js", import.meta.url), "utf8");
  assert.match(stylist, /fitScore\(sizeWithHints\(item, fitProfile\?\.fitHints\), fitProfile\)/);
});
