// tests/roads-overpass.test.js — the reader's own streets, converted the way
// the Paris script converted Paris: same frame, same tiers, same shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { convertElements, projector, simplify, roundCentre, ROAD_FRAME } from "../lib/roads/overpass.js";

const centre = { lat: 38.94, lng: -76.73 };
const way = (id, highway, coords) => ({
  type: "way", id, tags: { highway },
  nodes: coords.map((_, i) => id * 100 + i),
  geometry: coords.map(([lat, lon]) => ({ lat, lon })),
});

test("the centre projects to the middle of the frame and north is up", () => {
  const p = projector(centre.lat, centre.lng);
  const [x, y] = p(centre.lat, centre.lng);
  assert.equal(Math.round(x), ROAD_FRAME.w / 2);
  assert.equal(Math.round(y), ROAD_FRAME.h / 2);
  const [, yn] = p(centre.lat + 0.01, centre.lng);
  assert.ok(yn < y, "a point to the north sits higher");
});

test("ways land in their tiers and the shape is the passport's", () => {
  const els = [
    way(1, "primary", [[38.93, -76.75], [38.95, -76.71]]),
    way(2, "secondary", [[38.94, -76.75], [38.94, -76.71]]),
    way(3, "residential", [[38.935, -76.735], [38.945, -76.725]]),
  ];
  const m = convertElements(els, centre);
  for (const k of ["w", "h", "major", "secondary", "minor", "buildings", "stars"]) assert.ok(k in m, "missing " + k);
  assert.equal(m.w, 1420); assert.equal(m.h, 1000);
  assert.match(m.major, /^M\d+ \d+L\d+ \d+/);
  assert.match(m.secondary, /^M/); assert.match(m.minor, /^M/);
  assert.equal(m.buildings, "");
  assert.equal(m.counts.ways, 3);
  assert.match(m.attribution, /OpenStreetMap/);
});

test("a junction shared by three ways becomes a star; two ways do not", () => {
  const shared = [38.94, -76.73];
  const a = way(1, "residential", [[38.935, -76.735], shared, [38.945, -76.725]]);
  const b = way(2, "residential", [[38.945, -76.735], shared, [38.935, -76.725]]);
  const c = way(3, "residential", [[38.94, -76.74], shared, [38.94, -76.72]]);
  // give the shared node the same id in every way
  a.nodes[1] = b.nodes[1] = c.nodes[1] = 999;
  assert.equal(convertElements([a, b], centre).stars.length, 0);
  const m = convertElements([a, b, c], centre);
  assert.equal(m.stars.length, 1);
  assert.equal(m.stars[0][0], 710); assert.equal(m.stars[0][1], 500);
});

test("simplification keeps the ends and drops a collinear middle", () => {
  const pts = simplify([[0, 0], [1, 0.01], [2, 0], [3, 0.02], [4, 0]], 0.5);
  assert.deepEqual(pts, [[0, 0], [4, 0]]);
  assert.deepEqual(roundCentre(38.9428, -76.7302), { lat: 38.94, lng: -76.73 });
});
