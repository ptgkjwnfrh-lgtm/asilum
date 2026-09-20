// tests/search-reading-record.test.js — THE READING GOES ON RECORD.
//
// The search log kept four fields of the interpretation and none of the
// answer, so the steward could count empty searches but never say why.
// Every test here fails with the `reading` record removed from logSearch.

import test from "node:test";
import assert from "node:assert/strict";

import { searchProducts } from "../lib/search/index.js";
import { listSearchLogs } from "../lib/db/production.js";
import { upsertItems } from "../lib/db/index.js";
import { searchAnswerRate } from "../lib/steward/checks.js";

const settle = () => new Promise((r) => setTimeout(r, 20)); // logSearch is fire-and-forget
const lastLog = async (q) => { await settle(); return (await listSearchLogs({ limit: 50 })).find((l) => l.query === q); };

test("R1 an empty rack names its own reason", async () => {
  await upsertItems([
    { id: "rr-1", title: "Womens silk slip dress", brand: "Unbranded", price: 450, category: "dresses", tags: { SEDUCTIVE: 0.5 } },
    { id: "rr-2", title: "Mens wool overcoat", brand: "Unbranded", price: 90, category: "outerwear", tags: { MINIMAL: 0.4 } },
    { id: "rr-3", title: "Womens linen blazer", brand: "Unbranded", price: 120, category: "outerwear", tags: { TAILORED: 0.5 } },
  ]);
  await searchProducts("zzq", { userId: null });
  assert.equal((await lastLog("zzq")).interpreted.emptyReason, "fragment");

  await searchProducts("under $500 over $900", { userId: null });
  const conflict = await lastLog("under $500 over $900");
  assert.equal(conflict.interpreted.emptyReason, "constraint-conflict");
  assert.deepEqual(conflict.interpreted.constraints, ["under $500", "over $900"]);

  await searchProducts("qwxzvb", { userId: null });
  const unknown = await lastLog("qwxzvb");
  assert.equal(unknown.interpreted.emptyReason, "unknown-words");
  assert.deepEqual(unknown.interpreted.unmatchedTokens, ["qwxzvb"]);
  assert.match(unknown.interpreted.note, /qwxzvb/);
});

test("R2 a served rack records what applied and no empty reason", async () => {
  await searchProducts("womens under 200", { userId: null });
  const l = await lastLog("womens under 200");
  assert.equal(l.interpreted.emptyReason, null);
  assert.ok(l.resultCount >= 1, "rr-3 is womenswear under $200");
  assert.deepEqual(l.interpreted.constraints, ["womenswear", "under $200"]);
  assert.equal(l.interpreted.semantic.engaged, false, "unkeyed here — and it says so");
  assert.equal(typeof l.interpreted.cultural, "boolean");
  assert.ok(Array.isArray(l.interpreted.mappedTags), "the four original fields are still there");
});

test("R3 the steward says what kind of nothing it was, and stops blaming the culture index for fragments", async () => {
  const fake = (rows) => async (sql) => {
    if (sql.includes("emptyReason")) return { rows };
    if (sql.includes("search_logs")) return { rows: [{ total: 100, zero: 12 }] };
    throw new Error("unstubbed: " + sql.slice(0, 40));
  };
  const explained = await searchAnswerRate.run({ query: fake([
    { reason: "fragment", n: 8 }, { reason: "constraint-conflict", n: 2 }, { reason: "unknown-words", n: 2 },
  ]) });
  assert.equal(explained.state, "ok", "12% empty, every one explained by the engine itself");
  assert.match(explained.evidence, /8 prefix fragments, 2 two constraints no piece satisfies together, 2 words this catalog does not carry/);
  assert.match(explained.action, /debounce/);

  const dark = await searchAnswerRate.run({ query: fake([{ reason: "unrecorded", n: 12 }]) });
  assert.equal(dark.state, "note", "12% empty and none explained: the old reading stands");
  assert.match(dark.action, /SEARCH_CULTURE_FALLBACK/);
  assert.match(dark.evidence, /12 logged before the engine recorded reasons/);
});
