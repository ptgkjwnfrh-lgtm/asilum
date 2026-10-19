// tests/places-cluster.test.js — overlapping markers cluster (V.2 brief §11),
// deterministically, and expand in place without moving the camera.
import test from "node:test";
import assert from "node:assert/strict";
import { CLUSTER_RADIUS_PX, clusterPins } from "../lib/places/cluster.js";

test("pins within the radius cluster; apart they stay pins; the output is stable", () => {
  const pins = [{ id: "a", x: 100, y: 100 }, { id: "b", x: 110, y: 104 }, { id: "c", x: 400, y: 400 }, { id: "d", x: 105, y: 98 }];
  const out = clusterPins(pins);
  assert.equal(out.length, 2);
  const cl = out.find((o) => o.kind === "cluster");
  assert.equal(cl.count, 3); assert.deepEqual(cl.members.map((m) => m.id).sort(), ["a", "b", "d"]);
  assert.equal(cl.id, "cluster:a|b|d");
  assert.equal(out.find((o) => o.kind === "pin").id, "c");
  assert.deepEqual(clusterPins([...pins].reverse()).map((o) => o.id).sort(), out.map((o) => o.id).sort(), "input order does not matter");
  assert.equal(clusterPins([{ id: "x", x: 0, y: 0 }, { id: "y", x: CLUSTER_RADIUS_PX + 1, y: 0 }]).length, 2);
  assert.equal(clusterPins([{ id: "n", x: NaN, y: 1 }]).length, 0, "an unprojectable pin is not drawn");
});

test("an expanded cluster spreads its members on a ring, each still its own pin", () => {
  const pins = [{ id: "a", x: 100, y: 100, name: "A" }, { id: "b", x: 102, y: 101, name: "B" }];
  const out = clusterPins(pins, { expanded: new Set(["cluster:a|b"]) });
  assert.equal(out.length, 2); assert.ok(out.every((o) => o.kind === "pin" && o.ofCluster === "cluster:a|b"));
  const d = Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y);
  assert.ok(d > CLUSTER_RADIUS_PX, "spread apart enough to tap");
  assert.equal(out[0].members[0].name, "A", "the data is untouched; only the drawn position moved");
});
