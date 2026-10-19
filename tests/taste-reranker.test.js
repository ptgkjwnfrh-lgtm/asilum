// tests/taste-reranker.test.js — the taste reranker's guards (V.2 brief §10):
// exact entity identity preserved, constraints preserved (no row added or
// removed), explicit stamps outweigh inferred, hidden tags count against,
// exposure is not preference, diversity and exploration in the top window,
// and every row leaves with reasons / source / uncertainty.
import test from "node:test";
import assert from "node:assert/strict";
import { DIVERSITY_PER_BRAND, EXPLORE_SLOTS, TOP_WINDOW, affinity, foldTaste, rerankByTaste, uncertaintyOf } from "../lib/search/reranker.js";

const row = (id, over = {}) => ({ id, title: "piece " + id, brand: "House" + id, tags: { MINIMAL: 1 }, matchReason: "tag match", confidenceScore: 0.4, source: "ebay", ...over });

test("foldTaste: stamps count fully, inferred less, hidden against", () => {
  const v = foldTaste({ explicit: { GORP: 1 }, inferred: { MINIMAL: 1 }, negative: { STATEMENT: 1 } });
  assert.equal(v.GORP, 1); assert.equal(v.MINIMAL, 0.6); assert.ok(v.STATEMENT < 0);
  assert.ok(affinity(v, { GORP: 1 }) > affinity(v, { MINIMAL: 1 }));
  assert.ok(affinity(v, { STATEMENT: 1 }) < 0);
  assert.equal(affinity(v, {}), 0);
});

test("pinned rows (name / brand / designer / credit / title) keep their order and nothing passes them", () => {
  const rows = [row("a", { matchReason: "brand match" }), row("b", { tags: { GORP: 1 } }), row("c", { matchReason: "product name match" }), row("d", { tags: { GORP: 1 } })];
  const out = rerankByTaste(rows, { taste: { explicit: { GORP: 1 } } });
  assert.deepEqual(out.map((r) => r.id).slice(0, 2), ["a", "c"], "pinned first, in the engine's order");
  assert.equal(out.length, rows.length);
  assert.deepEqual(new Set(out.map((r) => r.id)), new Set(rows.map((r) => r.id)), "no row added or removed");
  assert.equal(out[0].match.uncertainty, "exact"); assert.deepEqual(out[0].match.reasons, ["brand match"]);
  assert.equal(out[0].tasteMoved, false);
});

test("taste moves the unpinned rows; exposure pushes down; the rows say why", () => {
  const rows = [row("a", { tags: { STATEMENT: 1 } }), row("b", { tags: { GORP: 1 } }), row("c", { tags: { MINIMAL: 1 } })];
  const out = rerankByTaste(rows, { taste: { explicit: { GORP: 1 }, negative: { STATEMENT: 1 } } });
  assert.equal(out[0].id, "b"); assert.equal(out[out.length - 1].id, "a", "a hidden tag sinks");
  assert.deepEqual(out[0].match.reasons, ["tag match", "taste"]);
  assert.deepEqual(out[out.length - 1].match.reasons, ["tag match", "against taste"]);
  assert.equal(out[0].match.source, "ebay"); assert.equal(out[0].match.uncertainty, "related");
  // two rows the taste likes equally, one already served: exposure is not preference
  // (a page, not a pair: on a two-row page the engine's own order outweighs the exposure penalty by design)
  const page = []; for (let i = 0; i < 10; i++) page.push(row("p" + i, { brand: "P" + i, tags: { GORP: 1 } }));
  assert.deepEqual(rerankByTaste(page, { taste: { explicit: { GORP: 1 } } }).map((r) => r.id).slice(0, 2), ["p0", "p1"], "engine order holds when taste is equal");
  assert.deepEqual(rerankByTaste(page, { taste: { explicit: { GORP: 1 } }, seen: new Set(["p0"]) }).map((r) => r.id).slice(0, 2), ["p1", "p2"], "the served one yields its place");
  // without a taste profile the engine's order stands
  assert.deepEqual(rerankByTaste(rows).map((r) => r.id), ["a", "b", "c"]);
});

test("diversity caps a brand in the top window and exploration keeps low-affinity rows in it", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(row("h" + i, { brand: "Mono", tags: { GORP: 1 } }));
  for (let i = 0; i < 12; i++) rows.push(row("o" + i, { brand: "Other" + i, tags: { STATEMENT: 1 } }));
  const out = rerankByTaste(rows, { taste: { explicit: { GORP: 1 } } });
  const top = out.slice(0, TOP_WINDOW);
  assert.ok(top.filter((r) => r.brand === "Mono").length <= DIVERSITY_PER_BRAND, "at most two of one brand in the window");
  assert.equal(out.length, 32);
  // the swap path: a window full of high-affinity distinct brands still gives EXPLORE_SLOTS to low-affinity rows
  const liked = [];
  for (let i = 0; i < 14; i++) liked.push(row("l" + i, { brand: "B" + i, tags: { GORP: 1 } }));
  for (let i = 0; i < 3; i++) liked.push(row("x" + i, { brand: "X" + i, tags: { STATEMENT: 1 } }));
  const out2 = rerankByTaste(liked, { taste: { explicit: { GORP: 1 } } });
  const top2 = out2.slice(0, TOP_WINDOW);
  const vec = foldTaste({ explicit: { GORP: 1 } });
  assert.equal(top2.filter((r) => affinity(vec, r.tags) <= 0).length, EXPLORE_SLOTS, "exactly the exploration slots hold low-affinity rows");
  assert.equal(out2.length, 17);
  assert.equal(uncertaintyOf({ matchReason: "assisted read" }), "assisted");
  assert.equal(uncertaintyOf({ matchReason: "category browse" }), "related");
  assert.equal(uncertaintyOf({ matchReason: "tag match", confidenceScore: 0.7 }), "likely");
});
