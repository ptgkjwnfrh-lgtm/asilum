// tests/ai-search-interpretation.test.js — the model parses the sentence,
// never the catalog.
//
// WHAT THIS REPLACED: lib/ai/search-adapter.js was a pass-through wrapper that
// NOTHING imported — three grep hits, not one of them an import — and
// AI_SEARCH_ENABLED was an orphan flag read only by that file. Flipping it
// changed nothing anywhere in the app while lib/search/index.js carried two
// comments describing the capability as merely switched off.
//
// THE CONTRACT UNDER TEST is the closed-vocabulary rule: every list the model
// may draw from is handed to it, anything outside is DROPPED and recorded, and
// the worst a mis-parse can produce is a constraint the deterministic engine
// could have produced itself. The model is never asked for a product, a house
// that is not stocked, a fact about a garment, or a confidence in its own work.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateSearchInterpretationOutput } from "../lib/ai/validate.js";
import { interpretQueryWithModel, aiSearchEnabled } from "../lib/ai/search-adapter.js";
import { PROVIDERS } from "../lib/ai/adapter.js";
import { searchProducts, GARMENT_CATEGORY } from "../lib/search/index.js";
import { ORIGIN_WORDS } from "../lib/search/origin.js";
import { SIZE_LETTERS } from "../lib/search/size.js";
import { TAGS } from "../lib/brain/tags.js";

const VOCAB = {
  garments: new Set(Object.keys(GARMENT_CATEGORY)),
  aesthetics: new Set(TAGS.map((t) => t.toLowerCase())),
  origins: new Set(ORIGIN_WORDS),
  sizes: new Set(SIZE_LETTERS),
};

const AI_KEYS = ["AI_FEATURES_ENABLED", "AI_PROVIDER", "AI_MODEL_NAME", "AI_API_KEY",
                 "AI_SEARCH_ENABLED", "AI_USER_HOURLY_LIMIT", "AI_GLOBAL_HOURLY_LIMIT"];
const ON = {
  AI_FEATURES_ENABLED: "true", AI_PROVIDER: "openai", AI_API_KEY: "k",
  AI_MODEL_NAME: "test-model", AI_SEARCH_ENABLED: "true",
};

async function withStub(response, fn, env = ON) {
  const saved = Object.fromEntries(AI_KEYS.map((k) => [k, process.env[k]]));
  for (const k of AI_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const savedProvider = PROVIDERS.openai;
  PROVIDERS.openai = async () => (typeof response === "string" ? response : JSON.stringify(response));
  try { return await fn(); } finally {
    PROVIDERS.openai = savedProvider;
    for (const k of AI_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}

// ---- the closed-vocabulary rule -------------------------------------------

test("anything outside the given lists is dropped, and recorded", () => {
  const out = validateSearchInterpretationOutput({
    garments: ["jacket", "spacesuit"],
    aesthetics: ["minimal", "cottagecore"],
    origins: ["japanese", "atlantean"],
    size: "XXXXL",
    reading: "quiet evening clothes",
  }, VOCAB);
  assert.deepEqual(out.garments, ["jacket"]);
  assert.deepEqual(out.aesthetics, ["minimal"]);
  assert.deepEqual(out.origins, ["japanese"]);
  assert.equal(out.size, null);
  assert.deepEqual(out.dropped.sort(), ["XXXXL", "atlantean", "cottagecore", "spacesuit"]);
});

test("numbers are bounded, and a reversed era is put the right way round", () => {
  const era = validateSearchInterpretationOutput({ era: { minYear: 2005, maxYear: 1995 } }, VOCAB).era;
  assert.deepEqual(era, { minYear: 1995, maxYear: 2005 });
  assert.equal(validateSearchInterpretationOutput({ era: { minYear: 1200, maxYear: 1300 } }, VOCAB), null);
  const money = validateSearchInterpretationOutput({ minPrice: -5, maxPrice: 400.4 }, VOCAB);
  assert.equal(money.minPrice, null);
  assert.equal(money.maxPrice, 400);
});

test("an empty answer is a null, not an empty constraint set", () => {
  assert.equal(validateSearchInterpretationOutput({ reading: "no idea" }, VOCAB), null);
  assert.equal(validateSearchInterpretationOutput(null, VOCAB), null);
  assert.equal(validateSearchInterpretationOutput("nope", VOCAB), null);
});

test("the model is not asked for, and cannot supply, a confidence in itself", () => {
  const out = validateSearchInterpretationOutput(
    { aesthetics: ["minimal"], confidence: 1, confidenceScore: 1 }, VOCAB);
  assert.equal(out.confidence, undefined);
  assert.equal(out.confidenceScore, undefined);
});

// ---- the adapter -----------------------------------------------------------

test("off is the normal state and it says how to turn it on", async () => {
  assert.equal(aiSearchEnabled(), false);
  const out = await interpretQueryWithModel("something quiet", VOCAB);
  assert.equal(out.ok, false);
  assert.equal(out.implemented, false);
  assert.match(out.hint, /AI_SEARCH_ENABLED/);
});

test("the adapter returns provenance, not just data", async () => {
  await withStub({ aesthetics: ["minimal"], reading: "quiet clothes" }, async () => {
    const out = await interpretQueryWithModel("something quiet for a rainy evening", VOCAB);
    assert.equal(out.ok, true);
    assert.equal(out.provider, "openai");
    assert.equal(out.promptVersion, "search-interpretation-v1");
    assert.deepEqual(out.data.aesthetics, ["minimal"]);
  });
});

// ---- the engine ------------------------------------------------------------

test("assistance is off unless BOTH the call and the feature ask for it", async () => {
  // Flags on, opt-in absent.
  await withStub({ aesthetics: ["minimal"] }, async () => {
    const r = await searchProducts("something quiet for a rainy evening", { limit: 24 });
    assert.equal(r.interpreted.assist, null);
  });
  // Opt-in present, flags absent.
  const r = await searchProducts("something quiet for a rainy evening", { limit: 24, assist: true });
  assert.equal(r.interpreted.assist, null);
});

test("an assisted rack honours what the model parsed, and says what applied", async () => {
  await withStub({
    garments: ["jacket"], aesthetics: ["minimal"], origins: ["japanese"],
    era: { minYear: 2018, maxYear: 2025 }, reading: "quiet japanese outerwear",
  }, async () => {
    const r = await searchProducts("something quiet for a rainy evening in tokyo", { limit: 24, assist: true });
    assert.equal(r.interpreted.assist.used, true);
    assert.equal(r.interpreted.assist.promptVersion, "search-interpretation-v1");
    assert.ok(r.results.length > 0);
    for (const it of r.results) {
      assert.ok(it.era.year >= 2018 && it.era.year <= 2025, `${it.id} ${it.era.year}`);
    }
    assert.match(r.note, /model-assisted reading/);
    assert.match(r.note, /the model read this as "quiet japanese outerwear"/);
  });
});

test("the model cannot smuggle in a house this catalog does not stock", async () => {
  await withStub({ origins: ["atlantean"], aesthetics: ["cottagecore"], garments: ["spacesuit"] }, async () => {
    const r = await searchProducts("zzqx vvbnm", { limit: 24, assist: true });
    // Nothing it returned survived validation, so nothing was applied.
    assert.equal(r.interpreted.assist, null);
  });
});

test("a row that only a model-proposed aesthetic earned says so, and is capped", async () => {
  await withStub({ aesthetics: ["gorp"], reading: "technical outdoor clothes" }, async () => {
    const r = await searchProducts("something for walking in the hills", { limit: 24, assist: true });
    assert.equal(r.interpreted.assist.used, true);
    const assisted = r.results.filter((it) => it.matchReason === "assisted read");
    assert.ok(assisted.length > 0, "an aesthetic-only rack is an assisted read");
    for (const it of assisted) assert.ok(it.confidenceScore <= 0.4, `${it.id} ${it.confidenceScore}`);
  });
});

test("the model is never called for a query the engine already understands", async () => {
  let called = 0;
  const saved = Object.fromEntries(AI_KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, ON);
  const savedProvider = PROVIDERS.openai;
  PROVIDERS.openai = async () => { called++; return JSON.stringify({ aesthetics: ["minimal"] }); };
  try {
    for (const q of ["90s jacket", "japanese coat", "medium knit", "jun takahashi",
                     "no logo hoodie", "jacket under 400", "rick owens", "gorpcore"]) {
      const r = await searchProducts(q, { limit: 24, assist: true });
      assert.equal(r.interpreted.assist, null, `${q} should not need the model`);
    }
    assert.equal(called, 0, "the deterministic engine answered all of them");
  } finally {
    PROVIDERS.openai = savedProvider;
    for (const k of AI_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
});

test("a refusing model leaves the rack exactly as it was", async () => {
  const plain = await searchProducts("something quiet for a rainy evening", { limit: 24 });
  await withStub("not json", async () => {
    const r = await searchProducts("something quiet for a rainy evening", { limit: 24, assist: true });
    assert.equal(r.interpreted.assist, null);
    assert.deepEqual(r.results.map((it) => it.id), plain.results.map((it) => it.id));
  });
});
