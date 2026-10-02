// tests/wardrobe-flow.test.js — the closet's rules (V.2 §8): a window around
// the selected card, bounded ends, a direct lookup that is never hidden, a
// selection that survives a re-filter.
import test from "node:test";
import assert from "node:assert/strict";
import { FLOW_SPAN, VIEWS, filterWardrobe, flowWindow, keepSelection, step } from "../lib/wardrobe/flow.js";

const items = [{ id: "1", title: "black biker", brand: "Schott", category: "outerwear", sizeLabel: "M" }, { id: "2", title: "grey hoodie", brand: "Nike" }, { id: "3", title: "white tee" }, { id: "4", title: "selvedge jeans", category: "bottoms", sizeLabel: "32" }, { id: "5", title: "derbies", category: "footwear" }];

test("the window is the selected card and up to two neighbours a side, bounded by the ends", () => {
  assert.equal(FLOW_SPAN, 2);
  assert.deepEqual(flowWindow(items, 2).map((w) => w.offset), [-2, -1, 0, 1, 2]);
  assert.deepEqual(flowWindow(items, 0).map((w) => w.item.id), ["1", "2", "3"], "at the start there is no left neighbour");
  assert.deepEqual(flowWindow(items, 4).map((w) => w.offset), [-2, -1, 0]);
  assert.deepEqual(flowWindow([], 0), []);
  assert.equal(flowWindow(items, 99).find((w) => w.offset === 0).item.id, "5", "an out-of-range selection clamps");
});

test("the lookup reads title, brand, category and size; the step clamps; the selection survives a re-filter", () => {
  assert.deepEqual(filterWardrobe(items, "schott").map((p) => p.id), ["1"]);
  assert.deepEqual(filterWardrobe(items, "32").map((p) => p.id), ["4"]);
  assert.deepEqual(filterWardrobe(items, "FOOT").map((p) => p.id), ["5"]);
  assert.equal(filterWardrobe(items, "").length, 5);
  assert.equal(step(0, -1, 5), 0); assert.equal(step(4, 1, 5), 4); assert.equal(step(2, 1, 5), 3); assert.equal(step(2, 1, 0), 0);
  assert.equal(keepSelection(items, "4"), 3);
  assert.equal(keepSelection(filterWardrobe(items, "hood"), "4"), 0, "a piece filtered out yields the first shown");
  assert.deepEqual(VIEWS, ["flow", "grid", "list"]);
});
