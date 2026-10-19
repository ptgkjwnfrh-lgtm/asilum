// tests/style-profile.test.js — the distilled taste document, and its arithmetic.
//
// `rebuildUserStyleProfile` is read by Mood Board Brain, Search, Discover and
// the Stylist. It fuses five live sources into one document: the brain's
// long-term vector, mood-board signals, saved board items, stylist feedback and
// structured user corrections. 7 importers, 3 of them in `app/`, no tests.
//
// The weights are the whole product. They are also invisible — a wrong
// multiplier does not throw, it just quietly makes someone's taste profile
// wrong, and every surface that reads it inherits the error. So these tests
// assert the ARITHMETIC, not merely that a profile comes back.
//
// The rule that matters most: **an explicit correction overrides inference, but
// a data report is not taste.** `not-my-style` weighs 2× a stylist rejection;
// `more-like-this` reinforces at 0.3; and the `wrong-*` family — "you got the
// brand wrong" — must NEVER move taste in either direction. It routes to
// moderation instead (lib/asterisk/explain.js). A `wrong-brand` report bleeding
// into `avoidedTags` would teach the brain to hide a brand because its metadata
// was mislabelled.
//
// Runs on the in-memory store: no DATABASE_URL, no network.

import { test } from "node:test";
import assert from "node:assert/strict";

import { addBoardItem, createBoard, saveProfile } from "../lib/db/index.js";
import {
  createMoodBoardUpload, createUserCorrectionWithEvent, getUserCorrectionSignalSummary,
} from "../lib/db/production.js";
import { getUserStyleProfile, rebuildUserStyleProfile } from "../lib/ai/styleProfile.js";

let n = 0;
const user = (label) => `styleprofile-${label}-${++n}`;

const weightOf = (list, tag) => list.find((e) => e.tag === tag)?.weight;

async function correct(userId, productId, code, tags) {
  await createUserCorrectionWithEvent(
    { userId, productId, code, tags },
    { userId, type: "correction", itemId: productId },
  );
}

// ---------------------------------------------------------------- refusals

test("a rebuild without a user is refused rather than guessed at", async () => {
  for (const bad of ["", null, undefined, 0]) {
    assert.deepEqual(await rebuildUserStyleProfile(bad), { ok: false, error: "user required" });
  }
  assert.equal(await getUserStyleProfile(""), null);
});

test("a user with no signal gets an honest empty profile, not an invented one", async () => {
  const userId = user("empty");
  const { ok, profile } = await rebuildUserStyleProfile(userId);

  assert.equal(ok, true);
  assert.deepEqual(profile.dominantAesthetics, []);
  assert.deepEqual(profile.avoidedTags, []);
  assert.equal(profile.confidenceScore, 0);
  assert.equal(profile.tasteSummary, "No taste signal yet — train the moodboard or save pieces.");
  // Every list is present and empty, so readers never guard for absence.
  for (const key of ["preferredColors", "preferredSilhouettes", "preferredFabrics",
                     "preferredEras", "preferredBrands", "preferredDesigners"]) {
    assert.deepEqual(profile[key], [], key);
  }
});

// ------------------------------------------------------------- the arithmetic

test("each source contributes at its own documented weight", async () => {
  const userId = user("weights");
  // Brain long-term vector: MINIMAL 0.8, TAILORED 0.2, GORP 0.04 (below the floor).
  await saveProfile(userId, { long: { MINIMAL: 0.8, GORP: 0.04, TAILORED: 0.2 } });
  // A saved board item: brand counts once, its tags land at x0.2.
  const board = await createBoard(userId, "board");
  await addBoardItem(board.id, { id: "sp-item-a", brand: "Acme", tags: { MINIMAL: 0.5, ARCHIVAL: 1 } });
  // Corrections: a negative at x2 into avoided, a positive at x0.3 into taste.
  await correct(userId, "sp-p1", "not-my-style", ["gorp"]);
  await correct(userId, "sp-p2", "more-like-this", ["minimal"]);

  const { profile } = await rebuildUserStyleProfile(userId);

  // 0.8 brain + (0.5 x 0.2) board + (1 x 0.3) correction = 1.2
  assert.equal(weightOf(profile.dominantAesthetics, "minimal"), 1.2);
  // brain only
  assert.equal(weightOf(profile.dominantAesthetics, "tailored"), 0.2);
  // board tag only: 1 x 0.2
  assert.equal(weightOf(profile.dominantAesthetics, "archival"), 0.2);
  // one occurrence x2
  assert.equal(weightOf(profile.avoidedTags, "gorp"), 2);
  assert.deepEqual(profile.preferredBrands, [{ tag: "acme", weight: 1 }]);
});

test("a faint brain signal is not a taste, and the floor is 0.05", async () => {
  const userId = user("floor");
  await saveProfile(userId, { long: { MINIMAL: 0.051, GORP: 0.05, LOUD: 0.04 } });
  const { profile } = await rebuildUserStyleProfile(userId);
  const tags = profile.dominantAesthetics.map((d) => d.tag);

  assert.ok(tags.includes("minimal"), "0.051 is above the floor");
  assert.equal(tags.includes("gorp"), false, "0.05 exactly is not above it");
  assert.equal(tags.includes("loud"), false, "0.04 is noise");
});

test("a data report is not a taste signal — `wrong-*` never moves the profile", async () => {
  // The rule this module can most easily get wrong. "You got the brand wrong"
  // is a correction to the DATA, not a statement about what the user likes.
  const userId = user("datareport");
  await saveProfile(userId, { long: { MINIMAL: 0.5 } });
  await correct(userId, "sp-w1", "wrong-brand", ["acme"]);
  await correct(userId, "sp-w2", "wrong-color", ["black"]);

  const { profile } = await rebuildUserStyleProfile(userId);

  assert.equal(weightOf(profile.avoidedTags, "acme"), undefined, "not pushed toward avoided");
  assert.equal(weightOf(profile.dominantAesthetics, "acme"), undefined, "nor toward liked");
  assert.equal(weightOf(profile.avoidedTags, "black"), undefined);
  assert.deepEqual(profile.avoidedTags, [], "a data report leaves taste untouched");
  // The brain signal that WAS there is unaffected too.
  assert.equal(weightOf(profile.dominantAesthetics, "minimal"), 0.5);
});

test("mood-board tags land at half weight for taste and full weight for colour", async () => {
  const userId = user("moodboard");
  await createMoodBoardUpload({
    userId, kind: "upload",
    tags: [
      { tag: "minimal", tag_type: "aesthetic", confidence: 0.6 },
      { tag: "black", tag_type: "color", confidence: 0.8 },
    ],
  });

  const { profile } = await rebuildUserStyleProfile(userId);
  // Aesthetic tags are discounted — a board is a mood, not a declaration.
  assert.equal(weightOf(profile.dominantAesthetics, "minimal"), 0.3, "0.6 x 0.5");
  // Colour is carried through as observed.
  assert.equal(weightOf(profile.preferredColors, "black"), 0.8);
  assert.equal(profile.sources.moodBoardUploads, 1);
  // And the colour clause appears in the summary only when there is one.
  assert.match(profile.tasteSummary, /^Leans minimal in black\./);
});

test("the data-report exclusion is enforced upstream, in the signal summary", async () => {
  // WHERE THE GUARD ACTUALLY LIVES. Mutating styleProfile's own
  // `NEGATIVE_CORRECTION_CODES` check does not leak data reports into taste,
  // because `wrong-*` codes never reach it — `getUserCorrectionSignalSummary`
  // filters to the shaping codes first. So the rule is pinned here, at the
  // layer that enforces it, as well as end-to-end above.
  const userId = user("upstream");
  await correct(userId, "sp-u1", "wrong-brand", ["acme"]);
  await correct(userId, "sp-u2", "wrong-color", ["black"]);
  await correct(userId, "sp-u3", "not-my-style", ["gorp"]);

  const summary = await getUserCorrectionSignalSummary(userId);
  assert.deepEqual(summary.signals, [{ code: "not-my-style", tag: "gorp", occurrences: 1 }]);
  assert.equal(summary.count, 1, "both data reports were filtered out before taste saw them");

  // NOTE, from mutation-testing this file: widening `styleProfile`'s own
  // `NEGATIVE_CORRECTION_CODES.has(signal.code)` to `signal.code !==
  // "more-like-this"` is an EQUIVALENT MUTANT and no test can kill it. Only the
  // four shaping codes ever reach that loop, so for every reachable input the
  // two conditions agree. The assertion above is the one that bites: widen
  // `CORRECTION_SIGNAL_CODES` and it fails immediately.
});

test("a negative correction outweighs a positive one, and repeats accumulate", async () => {
  const userId = user("negative");
  await correct(userId, "sp-n1", "not-my-style", ["gorp"]);
  await correct(userId, "sp-n2", "less-like-this", ["gorp"]);
  await correct(userId, "sp-n3", "more-like-this", ["minimal"]);

  const { profile } = await rebuildUserStyleProfile(userId);

  // Two negative occurrences on the same tag, each worth 2.
  assert.equal(weightOf(profile.avoidedTags, "gorp"), 4);
  // One positive occurrence, worth 0.3 — deliberately gentler.
  assert.equal(weightOf(profile.dominantAesthetics, "minimal"), 0.3);
  assert.ok(weightOf(profile.avoidedTags, "gorp") > weightOf(profile.dominantAesthetics, "minimal") * 2,
    "an explicit rejection is the louder signal");
});

// ------------------------------------------------------------- shape & scoring

test("confidence rises with signal count and is capped at 0.9", async () => {
  const sparse = user("sparse");
  await saveProfile(sparse, { long: { MINIMAL: 0.5, TAILORED: 0.4, ARCHIVAL: 0.3 } });
  const thin = await rebuildUserStyleProfile(sparse);
  assert.equal(thin.profile.sources.brainTags, 3);
  assert.equal(thin.profile.confidenceScore, 0.06, "3 signals x 0.02");

  // Enough signal to exceed the ceiling, which must clamp rather than climb.
  const rich = user("rich");
  const many = {};
  for (let i = 0; i < 60; i++) many["TAG" + i] = 0.5;
  await saveProfile(rich, { long: many });
  const dense = await rebuildUserStyleProfile(rich);
  assert.equal(dense.profile.sources.brainTags, 60);
  assert.equal(dense.profile.confidenceScore, 0.9, "60 x 0.02 = 1.2, clamped to 0.9");
});

test("every ranked list is sorted by weight and capped at six", async () => {
  const userId = user("ranking");
  const long = {};
  for (let i = 0; i < 10; i++) long["TAG" + i] = 0.1 * (i + 1);
  await saveProfile(userId, { long });

  const { profile } = await rebuildUserStyleProfile(userId);
  assert.equal(profile.dominantAesthetics.length, 6, "capped at six");
  assert.equal(profile.dominantAesthetics[0].tag, "tag9", "heaviest first");

  const weights = profile.dominantAesthetics.map((d) => d.weight);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a), "descending");
  // Weights are rounded for storage rather than carrying float noise.
  for (const { weight } of profile.dominantAesthetics) {
    assert.equal(weight, +weight.toFixed(3));
  }
});

test("the summary names the leading aesthetics and admits it is deterministic", async () => {
  const userId = user("summary");
  await saveProfile(userId, { long: { MINIMAL: 0.9, TAILORED: 0.8, ARCHIVAL: 0.7, GORP: 0.6 } });
  const { profile } = await rebuildUserStyleProfile(userId);

  assert.match(profile.tasteSummary, /^Leans minimal, tailored, archival\./, "the top three, in order");
  assert.equal(profile.tasteSummary.includes("gorp"), false, "and only three");
  // It must not pass itself off as written intelligence.
  assert.match(profile.tasteSummary, /Deterministic summary from live signals/);
});

test("the sources block counts what the profile was actually built from", async () => {
  const userId = user("sources");
  await saveProfile(userId, { long: { MINIMAL: 0.5 } });
  const board = await createBoard(userId, "board");
  await addBoardItem(board.id, { id: "sp-item-b", brand: "Acme", tags: {} });
  await addBoardItem(board.id, { id: "sp-item-c", brand: "Beta", tags: {} });
  await correct(userId, "sp-s1", "not-my-style", ["gorp"]);

  const { profile } = await rebuildUserStyleProfile(userId);
  assert.equal(profile.sources.savedItems, 2);
  assert.equal(profile.sources.brainTags, 1);
  assert.equal(profile.sources.corrections, 1);
  assert.equal(profile.sources.feedback, 0);
  // confidence is derived from exactly this block, so the two must agree.
  const total = Object.values(profile.sources).reduce((s, x) => s + x, 0);
  assert.equal(profile.confidenceScore, Math.min(0.9, +(total * 0.02).toFixed(2)));
});

// -------------------------------------------------------------- read + cache

test("a fresh profile is served from storage rather than rebuilt", async () => {
  const userId = user("cache");
  await saveProfile(userId, { long: { MINIMAL: 0.5 } });
  const first = await getUserStyleProfile(userId);
  assert.ok(first, "a profile is produced on first read");

  // Change the underlying signal, then read again inside the freshness window.
  await saveProfile(userId, { long: { MINIMAL: 0.5, TAILORED: 0.9 } });
  const cached = await getUserStyleProfile(userId);
  assert.equal(cached.dominantAesthetics.length, first.dominantAesthetics.length,
    "the stored document is reused, not recomputed");

  // Asking for a zero-length freshness window forces the rebuild.
  const rebuilt = await getUserStyleProfile(userId, { maxAgeMs: -1 });
  assert.equal(weightOf(rebuilt.dominantAesthetics, "tailored"), 0.9, "now it sees the new signal");
});
