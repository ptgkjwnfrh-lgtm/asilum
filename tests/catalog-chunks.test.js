// tests/catalog-chunks.test.js — the chunk law (owner order, 6 Sep 2026).
//
// A served page is a CHUNK cut to declared shares. One share is not taste:
// the CATALOG lane walks the listing in cursor order and holds exactly 25% of
// every chunk, for every reader state. The discovery and reach shares are the
// anti-monoculture clause. Every claim below is made against the real
// assembler and the real seed catalog — never against a re-implementation of
// the layout (harness law: a battery that rebuilds the thing it measures
// measures its own rebuild).

import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_SHARE, CHUNK_MIN, CHUNK_MAX, CHUNK_DEFAULT, CURSOR_MAX_LEN,
  chunkQuotas, chunkLayout, spreadSlots, clampChunkLimit,
  listingOrder, listingKey, compareKeys, encodeCursor, decodeCursor, catalogLane,
} from "../lib/brain/chunk.js";
import { assembleChunk, assembleFeed, vecSim } from "../lib/brain/bridges.js";
import { buildFeed, learn, tasteVector, SERVE_ZONES } from "../lib/brain/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { publicProduct, PUBLIC_BRIDGES } from "../lib/products.js";
import { eventFromInteraction } from "../lib/events/index.js";
import { planRechunk, idsBelowFold, RECHUNK_AFTER, RECHUNK_MIN_REPLACE } from "../lib/feed/rechunk.js";

const PROFILE = () => ({
  long: { MINIMAL: 0.9, TAILORED: 0.6, UTILITARIAN: 0.3 },
  session: { MINIMAL: 0.4 },
  _meta: { recent: [], seen: [] },
});
const zoneCounts = (items) => items.reduce((z, it) => { z[it._zone] = (z[it._zone] || 0) + 1; return z; }, {});
const laneOf = (items) => items.filter((it) => it._zone === "catalog");
const dominant = (it) => Object.entries(it.tags || {}).sort((a, b) => b[1] - a[1])[0]?.[0];

// ---- shares ------------------------------------------------------------------

test("C1 the catalog lane is exactly 25% of every chunk size, in every reader state", () => {
  assert.equal(CATALOG_SHARE, 0.25);
  for (let n = CHUNK_MIN; n <= CHUNK_MAX; n++) {
    for (const state of [
      { hasTaste: false }, { hasTaste: true }, { hasTaste: true, epsilonActive: true }, { hasTaste: true, safeMode: true },
    ]) {
      const q = chunkQuotas(n, state);
      assert.equal(q.catalog, Math.round(n * 0.25), `n=${n} ${JSON.stringify(state)}`);
      assert.equal(q.catalog + q.discovery + q.reach + q.core, n, "quotas cover the chunk exactly");
      // "one of the major percentage holders": nothing but core ever outranks it.
      assert.ok(q.catalog >= q.discovery && q.catalog >= q.reach, `catalog is a major holder at n=${n}`);
    }
  }
  assert.deepEqual(chunkQuotas(60, { hasTaste: true }), { catalog: 15, discovery: 12, reach: 6, core: 27 });
  assert.deepEqual(chunkQuotas(24, { hasTaste: true }), { catalog: 6, discovery: 5, reach: 2, core: 11 });
  assert.deepEqual(chunkQuotas(60, { hasTaste: false }), { catalog: 15, discovery: 0, reach: 0, core: 45 });
  assert.deepEqual(chunkQuotas(60, { hasTaste: true, epsilonActive: true }), { catalog: 15, discovery: 12, reach: 9, core: 24 });
  assert.deepEqual(chunkQuotas(60, { hasTaste: true, safeMode: true }), { catalog: 15, discovery: 6, reach: 0, core: 39 });
});

test("C2 the anti-monoculture clause: with taste, at least 55% of a chunk is not chosen by core ranking", () => {
  for (const n of [12, 24, 36, 48, 60]) {
    const q = chunkQuotas(n, { hasTaste: true });
    assert.ok((q.catalog + q.discovery + q.reach) / n >= 0.5, `n=${n}: ${JSON.stringify(q)}`);
    const bored = chunkQuotas(n, { hasTaste: true, epsilonActive: true });
    assert.ok(bored.reach >= q.reach, "boredom never reduces reach");
    const safe = chunkQuotas(n, { hasTaste: true, safeMode: true });
    assert.equal(safe.reach, 0, "safe mode drops reach");
    assert.equal(safe.catalog, q.catalog, "safe mode keeps the lane");
  }
});

test("C3 the layout spreads every zone through the page — no zone is a block", () => {
  const q = chunkQuotas(60, { hasTaste: true });
  const layout = chunkLayout(60, q);
  assert.equal(layout.length, 60);
  assert.deepEqual(zoneCounts(layout.map((z) => ({ _zone: z }))), q);
  const catalogSlots = layout.map((z, i) => (z === "catalog" ? i : -1)).filter((i) => i >= 0);
  for (let k = 1; k < catalogSlots.length; k++) {
    const gap = catalogSlots[k] - catalogSlots[k - 1];
    assert.ok(gap >= 2 && gap <= 6, `catalog slots are spaced (gap ${gap})`);
  }
  assert.equal(layout[0], "core", "the page opens on the reader's own taste");
  // spreadSlots never double-books and never loses a slot while room remains.
  const taken = new Set([1, 2, 3]);
  const got = spreadSlots(12, 4, taken);
  assert.equal(new Set(got).size, 4);
  assert.ok(got.every((s) => s >= 0 && s < 12));
});

test("C4 chunk sizes are bounded and unreadable ones fall back", () => {
  assert.equal(clampChunkLimit("abc"), CHUNK_DEFAULT);
  assert.equal(clampChunkLimit(null), CHUNK_DEFAULT);
  assert.equal(clampChunkLimit(5), CHUNK_MIN);
  assert.equal(clampChunkLimit(500), CHUNK_MAX);
  assert.equal(clampChunkLimit("24"), 24);
  assert.equal(clampChunkLimit(-3), CHUNK_DEFAULT);
});

// ---- the assembler ---------------------------------------------------------------

test("C5 a real chunk carries the quotas exactly, unique ids, the brand cap, and the lane in listing order", () => {
  const taste = tasteVector(PROFILE());
  const { items, catalog } = assembleChunk(CATALOG, taste, { limit: 60, popularity: {} });
  assert.equal(items.length, 60);
  assert.deepEqual(zoneCounts(items), chunkQuotas(60, { hasTaste: true }));
  assert.equal(new Set(items.map((it) => it.id)).size, 60, "no id twice in a chunk");
  const brands = {};
  for (const it of items) brands[it.brand] = (brands[it.brand] || 0) + 1;
  assert.ok(Object.values(brands).every((n) => n <= 2), `brand cap holds across every zone: ${JSON.stringify(brands)}`);
  const lane = laneOf(items);
  assert.equal(lane.length, 15);
  for (let k = 1; k < lane.length; k++) {
    assert.ok(compareKeys(listingKey(lane[k - 1]), listingKey(lane[k])) < 0, "the lane is the listing, in order");
  }
  assert.ok(lane.every((it) => it._bridge === "catalog"));
  assert.equal(catalog.quota, 15);
  assert.equal(catalog.count, 15);
  assert.equal(catalog.exhausted, false);
  assert.ok(typeof catalog.nextCursor === "string" && catalog.nextCursor.length < CURSOR_MAX_LEN);
  assert.equal(catalog.cursor, null);
  // The items-only view older callers use is the same chunk.
  assert.deepEqual(assembleFeed(CATALOG, taste, { limit: 60, popularity: {} }).map((it) => it.id), items.map((it) => it.id));
});

test("C6 a cold reader still gets the lane — and nothing else zoned", () => {
  const { items } = assembleChunk(CATALOG, {}, { limit: 24, popularity: {} });
  assert.equal(items.length, 24);
  assert.deepEqual(zoneCounts(items), { core: 18, catalog: 6 });
});

test("C7 the cursor continues the lane without repeating and ends honestly", () => {
  const taste = tasteVector(PROFILE());
  const pool = CATALOG.slice(0, 80);
  const ordered = listingOrder(pool);
  let cursor = null;
  const servedByLane = [];
  let chunks = 0;
  let exhaustedAt = null;
  while (chunks < 40) {
    const { items, catalog } = assembleChunk(pool, taste, { limit: 24, popularity: {}, catalog: { cursor } });
    chunks++;
    assert.equal(items.length, 24, "the page is always full, lane or no lane");
    const lane = laneOf(items);
    for (const it of lane) {
      assert.ok(!servedByLane.includes(it.id), `lane never repeats (${it.id} at chunk ${chunks})`);
      servedByLane.push(it.id);
    }
    // The chunk that reaches the end serves the listing's tail AND says so.
    if (catalog.exhausted) { exhaustedAt = chunks; assert.ok(lane.length <= 6); cursor = catalog.nextCursor; break; }
    assert.equal(lane.length, 6, "a live lane fills its quota");
    cursor = catalog.nextCursor;
  }
  assert.ok(exhaustedAt, "a finite listing is eventually exhausted, and says so");
  assert.equal(servedByLane.length, ordered.length, "every listing was served by the lane exactly once");
  // Past the end the cursor stays at the end: no wrap to the top.
  const again = assembleChunk(pool, taste, { limit: 24, popularity: {}, catalog: { cursor } });
  assert.equal(again.catalog.exhausted, true);
  assert.equal(laneOf(again.items).length, 0);
  assert.equal(again.items.length, 24);
});

test("C8 a brand-capped listing is deferred to the next chunk, never dropped", () => {
  const listing = [
    { id: "x1", brand: "X", tags: { MINIMAL: 0.9 } },
    { id: "x2", brand: "X", tags: { MINIMAL: 0.9 } },
    { id: "x3", brand: "X", tags: { MINIMAL: 0.9 } },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `y${String(i).padStart(2, "0")}`, brand: `B${i}`, tags: { STATEMENT: 0.8 } })),
  ];
  const ordered = listingOrder(listing);
  assert.deepEqual(ordered.slice(0, 3).map((it) => it.id), ["x1", "x2", "x3"], "ids break the created_at tie");
  const first = catalogLane(ordered, null, 4, { defer: (it) => it.brand === "X" && it.id === "x3" });
  assert.deepEqual(first.items.map((it) => it.id), ["x1", "x2", "y00", "y01"]);
  const c = decodeCursor(first.nextCursor);
  assert.equal(c.id, "x3", "resume AT the deferred listing");
  assert.deepEqual(c.skip, ["y00", "y01"], "and skip what was taken after it");
  const second = catalogLane(ordered, c, 4);
  assert.deepEqual(second.items.map((it) => it.id), ["x3", "y02", "y03", "y04"], "x3 is served, y00/y01 are not repeated");
});

test("C9 the lane skips what the reader was already served, and the cursor passes it", () => {
  const taste = tasteVector(PROFILE());
  const pool = CATALOG.slice(0, 40);
  const ordered = listingOrder(pool);
  const seen = new Set(ordered.slice(0, 5).map((it) => it.id));
  const { items } = assembleChunk(pool, taste, { limit: 20, popularity: {}, seen, catalog: { cursor: null } });
  const lane = laneOf(items);
  assert.equal(lane.length, 5);
  assert.ok(lane.every((it) => !seen.has(it.id)), "a lane item is never a repeat of a served one");
});

test("C10 a forged, oversized or foreign cursor starts the lane from the top instead of failing", () => {
  assert.equal(decodeCursor("not-a-cursor"), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor("x".repeat(CURSOR_MAX_LEN + 1)), null);
  assert.equal(decodeCursor(Buffer.from('{"v":2,"id":"a"}').toString("base64url")), null, "an unknown version is not a position");
  assert.equal(decodeCursor(Buffer.from('{"v":1,"id":""}').toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from('{"v":1,"id":"a","skip":"a"}').toString("base64url")).skip.length, 0, "skip must be a list");
  const taste = tasteVector(PROFILE());
  const top = assembleChunk(CATALOG, taste, { limit: 24, popularity: {}, catalog: { cursor: null } });
  const forged = assembleChunk(CATALOG, taste, { limit: 24, popularity: {}, catalog: { cursor: "garbage!" } });
  assert.deepEqual(laneOf(forged.items).map((it) => it.id), laneOf(top.items).map((it) => it.id));
  // A cursor that names an id no longer in the pool resumes at the next key.
  const ordered = listingOrder(CATALOG);
  const ghost = encodeCursor({ ...listingKey(ordered[3]), id: ordered[3].id + "-gone" });
  const { items } = assembleChunk(CATALOG, taste, { limit: 24, popularity: {}, catalog: { cursor: ghost } });
  assert.equal(laneOf(items)[0].id, ordered[4].id);
});

test("C11 hard filters narrow the listing the cursor pages through", () => {
  const taste = tasteVector(PROFILE());
  const pool = CATALOG.filter((it) => it.category === "outerwear");
  const { items } = assembleChunk(pool, taste, { limit: 24, popularity: {}, catalog: { cursor: null, ordered: listingOrder(pool) } });
  assert.ok(laneOf(items).length > 0);
  assert.ok(items.every((it) => it.category === "outerwear"));
});

// ---- learning between chunks ----------------------------------------------------

test("C12 the next chunk is built from the taste as it stands — actions move the core slate", () => {
  const before = PROFILE();
  const pool = CATALOG;
  const first = buildFeed({ profile: structuredClone(before), limit: 24 }, pool);
  // The reader bags and favourites three loud STATEMENT pieces from the page.
  let p = structuredClone(before);
  const loud = pool.filter((it) => (it.tags || {}).STATEMENT >= 0.7).slice(0, 3);
  assert.equal(loud.length, 3);
  for (const it of loud) { p = learn(p, it, "bag"); p = learn(p, it, "favorite"); }
  const second = buildFeed({ profile: p, limit: 24 }, pool);
  const statementShare = (r) => {
    const core = r.items.filter((it) => it._zone === "core");
    return core.reduce((s, it) => s + vecSim(it.tags || {}, { STATEMENT: 1 }), 0) / core.length;
  };
  assert.ok(statementShare(second) > statementShare(first),
    `core moved toward what was bagged: ${statementShare(first).toFixed(3)} → ${statementShare(second).toFixed(3)}`);
  // ...and the lane did not move at all: listing order is not taste.
  assert.deepEqual(laneOf(second.items).map((it) => it.id), laneOf(first.items).map((it) => it.id));
  assert.equal(second.zones.catalog, 6);
  assert.equal(second.catalog.quota, 6);
});

test("C13 a hyper-concentrated taste cannot turn the chunk into one thing", () => {
  const profile = { long: { STREETWEAR: 1 }, session: { STREETWEAR: 1 }, _meta: { recent: [], seen: [] } };
  const r = buildFeed({ profile, limit: 60 }, CATALOG);
  const same = r.items.filter((it) => dominant(it) === "STREETWEAR").length;
  assert.ok(same / 60 <= 0.75, `at most 75% share the loved tag; got ${same}/60`);
  assert.ok(r.zones.catalog + r.zones.discovery + r.zones.reach >= 33, JSON.stringify(r.zones));
  assert.ok(new Set(r.items.map(dominant)).size >= 4, "several aesthetics on every page");
});

// ---- the kill switch and the whitelists ---------------------------------------

test("C14 BRAIN_CATALOG_LANE=0 restores the legacy layout: discovery every 5th, two reaches, no lane", () => {
  const prev = process.env.BRAIN_CATALOG_LANE;
  process.env.BRAIN_CATALOG_LANE = "0";
  try {
    const r = buildFeed({ profile: PROFILE(), limit: 60 }, CATALOG);
    assert.equal(r.zones.catalog, 0);
    assert.equal(r.catalog, null);
    assert.equal(r.zones.reach, 2);
    assert.equal(r.zones.discovery, 12);
    assert.equal(r.items.length, 60);
    assert.deepEqual(chunkQuotas(60, { hasTaste: true, catalog: false }).catalog, 0);
  } finally {
    if (prev === undefined) delete process.env.BRAIN_CATALOG_LANE; else process.env.BRAIN_CATALOG_LANE = prev;
  }
});

test("C15 the catalog zone survives every whitelist between the assembler and the record", () => {
  assert.ok(SERVE_ZONES.includes("catalog"));
  assert.ok(PUBLIC_BRIDGES.has("catalog"));
  const item = { ...CATALOG[0], _zone: "catalog", _bridge: "catalog", _score: 0.1, _parts: { alpha: 0.1 } };
  const pub = publicProduct(item);
  assert.equal(pub._zone, "catalog");
  assert.equal(pub._bridge, "catalog");
  const ev = eventFromInteraction("u1", "favorite", { id: "a" }, null, { slot: 3, zone: "catalog" });
  assert.equal(ev.payload.zone, "catalog");
  assert.equal(ev.payload.slot, 3);
});

test("C16 buildFeed reports the lane beside the zones, and safe mode keeps it while dropping reach", () => {
  const r = buildFeed({ profile: PROFILE(), novelty: "safe", limit: 24 }, CATALOG);
  assert.equal(r.safeMode, true);
  assert.equal(r.zones.reach, 0);
  assert.equal(r.zones.catalog, 6);
  assert.equal(r.catalog.count, 6);
  assert.equal(typeof r.catalog.nextCursor, "string");
});

// ---- the client's re-chunk plan ---------------------------------------------------

test("C17 a re-chunk replaces only cards below the fold that were never examined — geometry, not list position", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}` }));
  // Column-major grid: i25..i29 sit at the TOP of the fourth column and were
  // examined; i5..i24 are below the fold; i0..i4 on screen.
  const examined = new Set(["i0", "i1", "i2", "i25", "i26", "i27", "i28", "i29"]);
  const below = new Set(items.slice(5, 25).map((it) => it.id));
  const plan = planRechunk(items, examined, below);
  assert.ok(plan, "twenty replaceable cards is worth a re-chunk");
  assert.deepEqual(plan.dropped, items.slice(5, 25).map((it) => it.id));
  assert.deepEqual(plan.head.map((it) => it.id), ["i0", "i1", "i2", "i3", "i4", "i25", "i26", "i27", "i28", "i29"]);
  // An examined card below the fold is never replaced.
  const plan2 = planRechunk(items, new Set([...examined, "i10"]), below);
  assert.ok(!plan2.dropped.includes("i10"));
  assert.equal(plan2.head.some((it) => it.id === "i10"), true);
  // Too few replaceable cards → leave it to the next scroll.
  assert.equal(planRechunk(items, examined, new Set(["i5", "i6", "i7"])), null);
  assert.equal(planRechunk([], examined, below), null);
  assert.equal(RECHUNK_AFTER, 3);
  assert.equal(RECHUNK_MIN_REPLACE, 8);
  // The old rule, for the record: "after the last examined index" would have
  // kept i5..i24 (index 29 was examined) and found nothing to replace.
  let last = -1; items.forEach((it, i) => { if (examined.has(it.id)) last = i; });
  assert.equal(last, 29);
});

test("C18 idsBelowFold reads the cards' geometry against the viewport", () => {
  const fakeDoc = {
    querySelectorAll: () => [
      { getAttribute: () => "on", getBoundingClientRect: () => ({ top: 100 }) },
      { getAttribute: () => "edge", getBoundingClientRect: () => ({ top: 950 }) },
      { getAttribute: () => "below", getBoundingClientRect: () => ({ top: 1400 }) },
    ],
  };
  assert.deepEqual([...idsBelowFold(fakeDoc, 900, 300)], ["below"]);
  assert.deepEqual([...idsBelowFold(fakeDoc, 900, 0)], ["edge", "below"]);
  assert.equal(idsBelowFold(null, 900).size, 0);
});
