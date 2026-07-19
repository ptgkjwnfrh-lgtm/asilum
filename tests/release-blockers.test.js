// Phase 0 — PR 0A slice 1 (release blockers, no redesign):
//   1. Discover "newest" sorts by actual creation time, not pool order.
//   2. Stale-response guards: claimRequest / watchRequest semantics.
//   3. Inventory-representation counts DISCOVERABLE items only — hidden,
//      sold, or unavailable rows can never inflate a confidence claim.
// All tests run against the in-memory store; the Postgres predicate that
// mirrors isDiscoverableProduct is covered in postgres-integration.test.js.

import test from "node:test";
import assert from "node:assert/strict";

import { upsertItems } from "../lib/db/index.js";
import { countDiscoverableProductsByTags, getDiscoverablePool } from "../lib/products.js";
import { createdAtOf, sortNewestFirst, stripRecencyKey } from "../lib/discover/recency.js";
import { claimRequest, watchRequest } from "../lib/client.js";

// One shared seed pass: getDiscoverablePool caches for 15s per process, so
// every item any test needs must exist before the first pool read.
const SEEDED = upsertItems([
  // Insertion order deliberately disagrees with creation order.
  { id: "rb-old", title: "Old piece", price: 100, tags: { MINIMAL: 0.8 }, created_at: "2026-01-05T00:00:00.000Z" },
  { id: "rb-new", title: "New piece", price: 110, tags: { MINIMAL: 0.8 }, created_at: "2026-07-10T00:00:00.000Z" },
  { id: "rb-mid", title: "Mid piece", price: 120, tags: { MINIMAL: 0.8 }, created_at: "2026-03-15T00:00:00.000Z" },
  { id: "rb-undated", title: "Undated piece", price: 130, tags: { MINIMAL: 0.8 } },
  // Inventory-confidence fixtures on a tag no real inventory carries.
  { id: "rb-vis", title: "Visible", price: 90, tags: { ZZPHASE0: 1 } },
  { id: "rb-sold", title: "Sold", price: 90, tags: { ZZPHASE0: 1 }, availability_status: "sold" },
  { id: "rb-hidden", title: "Hidden", price: 90, tags: { ZZPHASE0: 1 }, moderation_status: "hidden" },
  { id: "rb-off", title: "Unavailable", price: 90, tags: { ZZPHASE0: 1 }, is_available: false },
]);

test("sort=new orders the discoverable pool by creation time and keeps timestamps server-side", async () => {
  await SEEDED;
  // The same shape the discover route builds: pool rows carry the captured
  // creation instant; cards are sorted, then stripped before the response.
  const pool = await getDiscoverablePool({ fallback: false });
  const cards = pool.map((item) => ({ id: item.id, _createdAt: createdAtOf(item) }));
  const ids = stripRecencyKey(sortNewestFirst(cards)).map((item) => item.id);
  const dated = ids.filter((id) => ["rb-new", "rb-mid", "rb-old"].includes(id));
  assert.deepEqual(dated, ["rb-new", "rb-mid", "rb-old"],
    "newest means created_at DESC, not reversed pool order");
  assert.ok(ids.indexOf("rb-undated") > ids.indexOf("rb-old"),
    "rows without a creation instant sink below every dated row");
  assert.ok(!ids.includes("rb-sold") && !ids.includes("rb-hidden") && !ids.includes("rb-off"),
    "non-discoverable rows stay out of the pool");
  for (const item of sortNewestFirst(cards).slice(0, 3).map((c) => stripRecencyKey([c])[0])) {
    assert.ok(!("_createdAt" in item), "the sort key never crosses the API boundary");
  }
});

test("an undated pool falls back to reversed insertion order", () => {
  const cards = [{ id: "a", _createdAt: null }, { id: "b", _createdAt: null }, { id: "c", _createdAt: null }];
  assert.deepEqual(sortNewestFirst(cards).map((item) => item.id), ["c", "b", "a"],
    "mem/seed rows keep the only recency signal they have");
});

test("inventory-representation count sees discoverable items only", async () => {
  await SEEDED;
  assert.equal(await countDiscoverableProductsByTags(["ZZPHASE0"]), 1,
    "sold, hidden, and unavailable rows must not inflate the claim");
  assert.equal(await countDiscoverableProductsByTags(["zzphase0"]), 1,
    "tag keys normalize to the uppercase brain-tag space");
  assert.equal(await countDiscoverableProductsByTags([]), 0);
  assert.equal(await countDiscoverableProductsByTags(["ZZNOSUCHTAG"]), 0);
});

test("claimRequest invalidates slower in-flight responses; watchRequest only observes", () => {
  const ref = { current: 0 };
  const first = claimRequest(ref);
  assert.equal(first(), true, "a fresh claim is current");
  const second = claimRequest(ref);
  assert.equal(first(), false, "an older claim is invalidated by a newer one");
  assert.equal(second(), true);

  const watch = watchRequest(ref);
  assert.equal(watch(), true, "watching does not invalidate the current claim");
  assert.equal(second(), true, "a watch never steals the claim");
  claimRequest(ref);
  assert.equal(watch(), false, "a watch goes stale when a new claim lands");
  assert.equal(second(), false);
});
