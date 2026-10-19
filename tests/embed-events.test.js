// tests/embed-events.test.js — A PAID CALL IS AN EVENT.
//
// The embedding provider was called once per keyed search in production for
// weeks and wrote nothing to ai_model_events, so the steward's model-seam
// check reported the seam "off or unused". Every test here fails with the
// recording removed from lib/embeddings/index.js.

import test from "node:test";
import assert from "node:assert/strict";

import { embedText, embedTexts } from "../lib/embeddings/index.js";
import { listAiModelEvents } from "../lib/db/production.js";

const withProvider = async (fn, respond) => {
  const saved = { p: process.env.EMBEDDINGS_PROVIDER, k: process.env.EMBEDDINGS_API_KEY, fetch: globalThis.fetch };
  process.env.EMBEDDINGS_PROVIDER = "openai";
  process.env.EMBEDDINGS_API_KEY = "test-key";
  globalThis.fetch = respond;
  try { return await fn(); } finally {
    globalThis.fetch = saved.fetch;
    if (saved.p == null) delete process.env.EMBEDDINGS_PROVIDER; else process.env.EMBEDDINGS_PROVIDER = saved.p;
    if (saved.k == null) delete process.env.EMBEDDINGS_API_KEY; else process.env.EMBEDDINGS_API_KEY = saved.k;
  }
};
const okProvider = async (_url, init) => {
  const n = JSON.parse(init.body).input.length;
  return { ok: true, status: 200, json: async () => ({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [0.1, 0.2, 0.3] })) }) };
};
const deadProvider = async () => ({ ok: false, status: 503, text: async () => "upstream down" });

test("EV1 a successful query embedding is one event: feature, provider, model, shape, status ok", async () => {
  const before = (await listAiModelEvents({ feature: "search.embed", limit: 500 })).length;
  await withProvider(async () => {
    const r = await embedText("black wool coat ev1", { feature: "search.embed", userId: "u-ev1" });
    assert.equal(r.ok, true);
  }, okProvider);
  const rows = await listAiModelEvents({ feature: "search.embed", limit: 500 });
  assert.equal(rows.length, before + 1, "one provider round-trip, one row");
  const ev = rows[0];
  assert.equal(ev.status, "ok");
  assert.equal(ev.modelProvider, "openai");
  assert.ok(ev.modelName, "the model is named");
  assert.equal(ev.userId, "u-ev1");
  assert.match(ev.inputSummary, /1 text, \d+ chars/);
  assert.match(ev.outputSummary, /1 vector x 3 dims in \d+ ms/);
});

test("EV2 a memo hit is not a call and writes no row", async () => {
  await withProvider(async () => { await embedText("memo hit ev2", { feature: "search.embed" }); }, okProvider);
  const before = (await listAiModelEvents({ feature: "search.embed", limit: 500 })).length;
  await withProvider(async () => { await embedText("memo hit ev2", { feature: "search.embed" }); }, async () => { throw new Error("must not be called"); });
  const after = (await listAiModelEvents({ feature: "search.embed", limit: 500 })).length;
  assert.equal(after, before, "the second identical query came from the memo");
});

test("EV3 a provider failure is an event with status error and the reason, and the search still answers", async () => {
  const before = (await listAiModelEvents({ feature: "search.embed", limit: 500 })).length;
  await withProvider(async () => {
    const r = await embedText("upstream failure ev3", { feature: "search.embed" });
    assert.equal(r.ok, false, "notImplemented, not a throw");
  }, deadProvider);
  const rows = await listAiModelEvents({ feature: "search.embed", limit: 500 });
  assert.equal(rows.length, before + 1);
  assert.equal(rows[0].status, "error");
  assert.match(rows[0].errorMessage, /503/);
});

test("EV4 a catalog batch is one event under its own feature, sized by the batch", async () => {
  const before = (await listAiModelEvents({ feature: "catalog.embed", limit: 500 })).length;
  await withProvider(async () => {
    const r = await embedTexts(["a ev4", "b ev4", "c ev4"], { feature: "catalog.embed" });
    assert.equal(r.ok, true);
  }, okProvider);
  const rows = await listAiModelEvents({ feature: "catalog.embed", limit: 500 });
  assert.equal(rows.length, before + 1, "one round-trip for the whole batch");
  assert.match(rows[0].inputSummary, /3 texts/);
  assert.match(rows[0].outputSummary, /3 vectors x 3 dims/);
});
