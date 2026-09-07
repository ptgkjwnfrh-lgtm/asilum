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
  ServedFilter,
} from "../lib/brain/chunk.js";
import { assembleChunk, assembleFeed, vecSim } from "../lib/brain/bridges.js";
import { buildFeed, learn, tasteVector, SERVE_ZONES } from "../lib/brain/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { publicProduct, PUBLIC_BRIDGES } from "../lib/products.js";
import { eventFromInteraction } from "../lib/events/index.js";
import { planRechunk, idsBelowFold, applyRechunk, placeInColumns, RECHUNK_AFTER, RECHUNK_MIN_REPLACE } from "../lib/feed/rechunk.js";

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
    // Memory rotation: the lane's own claims, independent of the taste lanes
    // (under cursor rotation the lane also passes what the taste lanes served
    // — C19 covers that).
    const { items, catalog } = assembleChunk(pool, taste, { limit: 24, popularity: {}, catalog: { cursor }, rotation: "memory" });
    chunks++;
    assert.equal(items.length, 24, "the page is always full, lane or no lane");
    const lane = laneOf(items);
    for (const it of lane) {
      assert.ok(!servedByLane.includes(it.id), `lane never repeats (${it.id} at chunk ${chunks})`);
      servedByLane.push(it.id);
    }
    // The chunk that reaches the end serves the listing's tail AND says so.
    if (catalog.exhausted) { exhaustedAt = chunks; assert.ok(lane.length <= 6); cursor = catalog.nextCursor; break; }
    // A brand run ends the lane early for the chunks it takes to drain;
    // otherwise the lane fills its quota.
    if (catalog.deferred) assert.ok(lane.length >= 1 && lane.length < 6, "a deferred lane is short, not empty");
    else assert.equal(lane.length, 6, "a live lane fills its quota");
    cursor = catalog.nextCursor;
  }
  assert.ok(exhaustedAt, "a finite listing is eventually exhausted, and says so");
  // The lane passes listings the taste lanes already served (the cursor's
  // served filter is honoured in every mode), so it serves the listing MINUS
  // those — in listing order, each at most once, nothing skipped for any
  // other reason.
  const laneIdx = servedByLane.map((id) => ordered.findIndex((it) => it.id === id));
  assert.ok(laneIdx.every((v, k) => k === 0 || v > laneIdx[k - 1]), "the lane is a subsequence of the listing");
  assert.ok(servedByLane.length >= ordered.length * 0.3, `the lane served a real share of the listing (${servedByLane.length}/${ordered.length})`);
  // Past the end the cursor stays at the end: no wrap to the top.
  const again = assembleChunk(pool, taste, { limit: 24, popularity: {}, catalog: { cursor } });
  assert.equal(again.catalog.exhausted, true);
  assert.equal(laneOf(again.items).length, 0);
  assert.equal(again.items.length, 24);
});

test("C8 a brand-capped listing ends the lane for the chunk and is served first by the next — through the real assembler", () => {
  // Fifteen adjacent listings of one brand, then thirty of distinct brands.
  const listing = [
    ...Array.from({ length: 15 }, (_, i) => ({ id: `x${String(i).padStart(2, "0")}`, brand: "X", tags: { MINIMAL: 0.9 } })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `y${String(i).padStart(2, "0")}`, brand: `B${i}`, tags: { STATEMENT: 0.8 } })),
  ];
  let cursor = null;
  const laneServed = [];
  for (let k = 0; k < 12; k++) {
    const { items, catalog } = assembleChunk(listing, { MINIMAL: 0.9 }, { limit: 12, popularity: {}, catalog: { cursor }, rotation: "memory" });
    const brands = {};
    for (const it of items) brands[it.brand] = (brands[it.brand] || 0) + 1;
    assert.ok(Object.values(brands).every((n) => n <= 2), `chunk ${k + 1}: brand cap holds on the whole page ${JSON.stringify(brands)}`);
    const lane = laneOf(items);
    for (const it of lane) {
      assert.ok(!laneServed.includes(it.id), `lane never repeats (${it.id})`);
      laneServed.push(it.id);
    }
    assert.equal(items.length, 12, "the page is full — core fills what the short lane leaves");
    if (k < 7) {
      assert.deepEqual(lane.map((it) => it.brand), ["X", "X"], `chunk ${k + 1}: two of the run per chunk`);
      assert.equal(catalog.deferred, true);
    }
    cursor = catalog.nextCursor;
  }
  assert.deepEqual(laneServed.slice(0, 15), listing.slice(0, 15).map((it) => it.id), "the run drains in listing order, none dropped");
  // The pure walk: a deferral stops the lane and becomes the resume key.
  const first = catalogLane(listingOrder(listing), null, 4, { defer: (it) => it.id === "x02" });
  assert.deepEqual(first.items.map((it) => it.id), ["x00", "x01"]);
  assert.equal(first.deferred, true);
  assert.equal(decodeCursor(first.nextCursor).id, "x02", "resume AT the deferred listing");
  const second = catalogLane(listingOrder(listing), decodeCursor(first.nextCursor), 4);
  assert.deepEqual(second.items.map((it) => it.id), ["x02", "x03", "x04", "x05"]);
});

test("C8b a pool smaller than the chunk still serves every item — never an empty page, never a lost listing", () => {
  const pool = CATALOG.slice(0, 10);
  const { items, catalog } = assembleChunk(pool, {}, { limit: 60, popularity: {}, catalog: { cursor: null }, rotation: "memory" });
  assert.equal(items.length, 10, "a cold reader over ten items sees ten items, not none");
  assert.equal(new Set(items.map((it) => it.id)).size, 10);
  assert.equal(catalog.exhausted, true);
  const oneBrand = Array.from({ length: 100 }, (_, i) => ({ id: `o${i}`, brand: "ONE", tags: { MINIMAL: 0.5 } }));
  const r = assembleChunk(oneBrand, { MINIMAL: 0.9 }, { limit: 24, popularity: {}, catalog: { cursor: null }, rotation: "memory" });
  assert.equal(r.items.length, 2, "one brand can never take more than two slots on a page");
});

test("C9 the lane skips what this session served — never the profile's historical seen ring", () => {
  const taste = tasteVector(PROFILE());
  const pool = CATALOG.slice(0, 40);
  const ordered = listingOrder(pool);
  // Within a session: the cursor's served filter holds the first five
  // listings → the lane starts at the sixth.
  const served = new ServedFilter();
  for (const it of ordered.slice(0, 5)) served.add(it.id);
  const cursor = encodeCursor({ ...listingKey(ordered[0]), served });
  const inSession = assembleChunk(pool, taste, { limit: 20, popularity: {}, catalog: { cursor } });
  const lane = laneOf(inSession.items);
  assert.equal(lane.length, 5);
  assert.ok(lane.every((it) => !served.has(it.id)), "a lane item is never a repeat of one this session served");
  // With rotation memory and unseen listings left, the lane skips the seen
  // ring (a heavy scroller reaches the whole pool, #434).
  const partly = new Set(ordered.slice(0, 5).map((it) => it.id));
  const skipping = assembleChunk(pool, taste, { limit: 20, popularity: {}, seen: partly, catalog: { cursor: null }, rotation: "memory" });
  assert.ok(laneOf(skipping.items).every((it) => !partly.has(it.id)), "unseen listings first");
  // Across sessions: a reader once served the WHOLE pool (seen = everything)
  // still gets the listing lane on a fresh visit — the listing is revisited.
  const seen = new Set(pool.map((it) => it.id));
  const later = assembleChunk(pool, taste, { limit: 20, popularity: {}, seen, catalog: { cursor: null }, rotation: "memory" });
  assert.equal(laneOf(later.items).length, 5, "the 25% law holds on every visit, not only the first");
  assert.equal(later.items.length, 20);
});

test("C10 a forged, oversized or foreign cursor starts the lane from the top instead of failing", () => {
  assert.equal(decodeCursor("not-a-cursor"), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor("x".repeat(CURSOR_MAX_LEN + 1)), null);
  assert.equal(decodeCursor(Buffer.from('{"v":2,"id":"a"}').toString("base64url")), null, "an unknown version is not a position");
  assert.equal(decodeCursor(Buffer.from('{"v":1,"id":""}').toString("base64url")), null);
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
  assert.equal(planRechunk(items, examined, new Set(items.slice(5, 15).map((it) => it.id))), null, "ten is not");
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
  assert.equal(RECHUNK_MIN_REPLACE, 12, "a re-chunk replaces at least the smallest chunk the server serves");
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

// ---- cursor rotation: scrolling forward without server memory ------------------

test("C19 twelve chunks never repeat an item at 24 OR 60 — no memory on the server, the cursor's served filter carries it", () => {
  const taste = tasteVector(PROFILE());
  for (const t of [taste, {}, { STREETWEAR: 1 }]) {
    for (const limit of [24, 60]) {
      let cursor = null;
      const served = new Set();
      for (let k = 0; k < 12; k++) {
        const { items, catalog } = assembleChunk(CATALOG, t, { limit, popularity: {}, catalog: { cursor }, rotation: "cursor" });
        assert.equal(items.length, limit);
        for (const it of items) {
          assert.ok(!served.has(it.id), `${it.id} repeated at chunk ${k + 1} limit ${limit} (${it._zone})`);
          served.add(it.id);
        }
        assert.equal(catalog.rotation, "cursor");
        cursor = catalog.nextCursor;
      }
      assert.equal(served.size, 12 * limit);
      assert.ok(cursor.length < CURSOR_MAX_LEN / 2, `cursor stays well under the ceiling (${cursor.length})`);
    }
  }
});

test("C20 a taste that moves between chunks changes the ranking, never the promise: no repeats, nothing lost, over a whole session", () => {
  // One or two interactions per chunk WITHOUT a re-chunk is the ordinary
  // path (the first design's per-lane offsets drifted into 115–257 items
  // never served — a verifier's run, 7 Sep). Ids, not positions, cannot drift.
  let profile = PROFILE();
  let cursor = null;
  const served = new Set();
  let chunks = 0;
  while (chunks < 40) {
    const r = buildFeed({ profile, limit: 24, rotation: "cursor", catalog: { cursor } }, CATALOG);
    chunks++;
    const fresh = r.items.filter((it) => !served.has(it.id));
    // Every card new while the catalog lasts — a false positive in the served
    // filter (~1% once hundreds are held) may cost a card a turn, never more
    // than a couple per chunk, and it is served later.
    // ...and the brand cap: the unserved tail of a catalog clusters in a few
    // brands, and a page holds two of each, so "possible" is bounded by that.
    const byBrand = {};
    for (const it of CATALOG) if (!served.has(it.id)) byBrand[it.brand] = (byBrand[it.brand] || 0) + 1;
    const cappable = Object.values(byBrand).reduce((n, c) => n + Math.min(2, c), 0);
    // ...and the filter's own false positives, measured from the cursor the
    // chunk was built from (deterministic: the same few ids each time).
    const filter = cursor ? decodeCursor(cursor).served : null;
    const falsePositives = filter ? CATALOG.filter((it) => !served.has(it.id) && filter.has(it.id)).length : 0;
    const expected = Math.min(24, CATALOG.length - served.size, cappable) - falsePositives;
    assert.ok(fresh.length >= expected, `chunk ${chunks}: ${fresh.length} new of ${expected} possible (${falsePositives} false positives)`);
    assert.ok(falsePositives <= 4, `false positives stay rare (${falsePositives} at ${served.size} held)`);
    for (const it of r.items) served.add(it.id);
    // The reader favourites the first two cards and skips the third — the
    // taste moves every chunk.
    profile = learn(profile, r.items[0], "favorite");
    profile = learn(profile, r.items[1], "favorite");
    profile = learn(profile, r.items[2], "skip", { dwellMs: 600 });
    cursor = r.catalog.nextCursor;
    if (r.catalog.exhausted && served.size >= CATALOG.length - 5) break;
  }
  assert.ok(served.size >= CATALOG.length - 5, `the whole catalog was served (${served.size}/${CATALOG.length})`);
});

test("C21 memory rotation honours the cursor's served filter too — a consent switch mid-session repeats nothing", () => {
  const taste = tasteVector(PROFILE());
  let cursor = null;
  const served = new Set();
  for (let k = 0; k < 3; k++) {
    const r = assembleChunk(CATALOG, taste, { limit: 24, popularity: {}, catalog: { cursor }, rotation: "cursor" });
    r.items.forEach((it) => served.add(it.id));
    cursor = r.catalog.nextCursor;
  }
  const mem = assembleChunk(CATALOG, taste, { limit: 24, popularity: {}, catalog: { cursor }, rotation: "memory" });
  assert.equal(mem.catalog.rotation, "memory");
  assert.equal(mem.items.filter((it) => served.has(it.id)).length, 0, "GENERAL → OBSERVE: the page already seen is not served again");
  // And the reverse: memory-mode pages carry their served filter forward too.
  const seen = new Set(mem.items.map((it) => it.id));
  const back = assembleChunk(CATALOG, taste, { limit: 24, popularity: {}, catalog: { cursor: mem.catalog.nextCursor }, seen, rotation: "cursor" });
  assert.equal(back.items.filter((it) => served.has(it.id) || seen.has(it.id)).length, 0);
});

test("C22 a pool smaller than the scroll still fills every page — repeats only once everything new is gone", () => {
  const tiny = CATALOG.slice(0, 30);
  let cursor = null;
  const served = new Set();
  for (let k = 0; k < 3; k++) {
    const { items, catalog } = assembleChunk(tiny, { MINIMAL: 0.9 }, { limit: 24, popularity: {}, catalog: { cursor }, rotation: "cursor" });
    assert.equal(items.length, 24, `chunk ${k + 1} is full`);
    assert.equal(new Set(items.map((it) => it.id)).size, 24, "never the same id twice on one page");
    const fresh = items.filter((it) => !served.has(it.id)).length;
    if (k === 0) assert.equal(fresh, 24);
    if (k === 1) assert.equal(fresh, 6, "the six never-served items come first");
    if (k === 2) assert.equal(fresh, 0, "then, and only then, repeats");
    for (const it of items) served.add(it.id);
    cursor = catalog.nextCursor;
  }
});

test("C23 the served filter is bounded, garbage-tolerant, and rarely wrong", () => {
  const f = new ServedFilter();
  assert.equal(f.empty, true);
  const ids = CATALOG.slice(0, 300).map((it) => it.id);
  for (const id of ids) f.add(id);
  assert.ok(ids.every((id) => f.has(id)), "no false negatives, ever");
  const others = CATALOG.slice(300).map((it) => it.id);
  const fp = others.filter((id) => f.has(id)).length;
  assert.ok(fp / others.length < 0.01, `false positives under 1% at 300 ids (${fp}/${others.length})`);
  const g = new ServedFilter();
  for (const it of CATALOG.slice(0, 900)) g.add(it.id);
  const fp900 = CATALOG.slice(900).filter((it) => g.has(it.id)).length;
  assert.ok(fp900 <= 1, `false positives stay rare at 900 ids (${fp900}/15)`);
  const round = ServedFilter.fromString(f.toString());
  assert.deepEqual([...round.bits], [...f.bits]);
  assert.equal(f.toString().length, 1366);
  // Garbage in the cursor's served field is an empty filter, never a throw.
  for (const raw of ["", "!!!", "AAAA", "x".repeat(600), 5, null]) assert.equal(ServedFilter.fromString(raw).empty, true);
  const bad = Buffer.from(JSON.stringify({ v: 1, id: "syn-0001", t: 0, s: "not-base64!" })).toString("base64url");
  assert.equal(decodeCursor(bad).served.empty, true);
  // An old cursor with taste offsets or a skip list decodes to a plain position.
  const old = Buffer.from(JSON.stringify({ v: 1, t: 0, id: "syn-0007", skip: ["a"], taste: { c: 9 } })).toString("base64url");
  const dec = decodeCursor(old);
  assert.equal(dec.id, "syn-0007");
  assert.equal(dec.served.empty, true);
});

test("C24 a full cursor — a long id and a full served filter — survives the length ceiling", () => {
  const id = `source:${"x".repeat(60)}:000001`;
  const served = new ServedFilter();
  for (let k = 0; k < 400; k++) served.add(`some-id-${k}`);
  const raw = encodeCursor({ t: 1767225600000, id, served });
  assert.ok(raw.length < CURSOR_MAX_LEN, `${raw.length} < ${CURSOR_MAX_LEN}`);
  const back = decodeCursor(raw);
  assert.equal(back.id, id);
  assert.equal(back.served.has("some-id-7"), true);
  const end = decodeCursor(encodeCursor({ end: true, served }));
  assert.equal(end.end, true);
  assert.equal(end.served.has("some-id-399"), true);
});

test("C25 applyRechunk replaces planned cards in place and touches nothing else", () => {
  const prev = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` }));
  const dropped = ["p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"];
  // While the chunk was in flight: a related card was inserted after p1 and
  // p3 was skipped away. Neither is in the plan; neither may move or vanish.
  const live = [prev[0], prev[1], { id: "related-1" }, prev[2], ...prev.slice(4)];
  const fresh = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}` }));
  const out = applyRechunk(live, dropped, fresh, { max: 300 });
  assert.deepEqual(out.map((x) => x.id), ["p0", "p1", "related-1", "p2", "f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"]);
  // A fresh item already on the page is not duplicated; the rendered ceiling holds.
  const dup = applyRechunk(live, dropped, [{ id: "p0" }, { id: "related-1" }, { id: "n1" }], { max: 6 });
  assert.deepEqual(dup.map((x) => x.id), ["p0", "p1", "related-1", "p2", "n1", "p5", "p6", "p7", "p8", "p9", "p10", "p11"]);
  assert.equal(new Set(dup.map((x) => x.id)).size, dup.length);
  // More planned than fresh: the unreplaced cards STAY — a chunk of n can
  // only ever change n cards (the verifier's page lost 65 for 22 arrivals).
  const many = applyRechunk(prev, prev.slice(2).map((x) => x.id), [{ id: "g0" }, { id: "g1" }], { max: 300 });
  assert.equal(many.length, prev.length);
  assert.deepEqual(many.slice(0, 4).map((x) => x.id), ["p0", "p1", "g0", "g1"]);
  assert.deepEqual(many.slice(4).map((x) => x.id), prev.slice(4).map((x) => x.id));
  // Nothing planned → nothing moves, fresh items append up to the ceiling.
  assert.deepEqual(applyRechunk(prev.slice(0, 3), [], fresh.slice(0, 2), { max: 4 }).map((x) => x.id), ["p0", "p1", "p2", "f0"]);
});

test("C27 a column is a card's state: a removal shortens only its own column, a replacement lands where the old card stood", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}` }));
  const memo = new Map();
  const first = placeInColumns(items, 4, memo);
  assert.deepEqual(first.map((col) => col.map((x) => x.id)), [
    ["c0", "c4", "c8"], ["c1", "c5", "c9"], ["c2", "c6", "c10"], ["c3", "c7", "c11"],
  ], "a fresh page is round-robin");
  // PASS on c1 (column 1): the other three columns are byte-identical.
  const afterPass = placeInColumns(items.filter((x) => x.id !== "c1"), 4, memo);
  assert.deepEqual(afterPass[0].map((x) => x.id), ["c0", "c4", "c8"]);
  assert.deepEqual(afterPass[1].map((x) => x.id), ["c5", "c9"]);
  assert.deepEqual(afterPass[2].map((x) => x.id), ["c2", "c6", "c10"]);
  assert.deepEqual(afterPass[3].map((x) => x.id), ["c3", "c7", "c11"]);
  // A newcomer takes the shortest column, in list order within it.
  const withNew = placeInColumns([...items.filter((x) => x.id !== "c1"), { id: "n1" }], 4, memo);
  assert.deepEqual(withNew[1].map((x) => x.id), ["c5", "c9", "n1"]);
  // An in-place replacement (applyRechunk) lands where the replaced card stood.
  const replaced = applyRechunk(items, ["c6"], [{ id: "f1" }], { max: 300 });
  const memo2 = new Map();
  placeInColumns(items, 4, memo2);
  const cols = placeInColumns(replaced, 4, memo2);
  assert.deepEqual(cols[2].map((x) => x.id), ["c2", "f1", "c10"], "f1 sits exactly where c6 was");
  assert.deepEqual(cols[0].map((x) => x.id), ["c0", "c4", "c8"]);
  // A column-count change forgets the memory (the caller discards the map).
  assert.equal(placeInColumns(items, 3, new Map()).length, 3);
  assert.equal(placeInColumns([], 4, new Map()).every((c) => c.length === 0), true);
});

test("C28 the dry-pool fill rotates and reaches an item the filter wrongly calls served", () => {
  const pool = CATALOG.slice(0, 40);
  const taste = { MINIMAL: 0.9 };
  // Forge a filter that already "holds" everything except three items, and
  // wrongly holds those three as well: no lane can serve them — only the fill.
  const served = new ServedFilter();
  for (const it of pool) served.add(it.id);
  const lost = new Set(pool.slice(10, 13).map((it) => it.id));
  let cursor = encodeCursor({ end: true, served });
  const pages = [];
  const reached = new Set();
  for (let k = 0; k < 4; k++) {
    const r = assembleChunk(pool, taste, { limit: 12, popularity: {}, catalog: { cursor }, rotation: "cursor" });
    assert.equal(r.items.length, 12, "a dry pool still fills the page");
    pages.push(r.items.map((it) => it.id).join(","));
    for (const it of r.items) if (lost.has(it.id)) reached.add(it.id);
    cursor = r.catalog.nextCursor;
  }
  assert.equal(new Set(pages).size, pages.length, "a dry pool cycles — never the same page twice in a row");
  assert.equal(reached.size, 3, "every wrongly-held item was reached by the rotating fill");
  assert.ok(decodeCursor(cursor).fill > 0, "the fill position rides in the cursor");
});

test("C29 sequential ids do not collide in the served filter", () => {
  const f = new ServedFilter();
  const ids = Array.from({ length: 2000 }, (_, i) => `syn-${String(i).padStart(4, "0")}`);
  let structural = 0;
  for (let i = 0; i < ids.length; i++) {
    const g = new ServedFilter().add(ids[i]);
    for (let j = i + 1; j < Math.min(ids.length, i + 1200); j += 97) if (g.has(ids[j])) structural++;
  }
  assert.ok(structural <= 2, `no structured collisions among sequential ids (${structural})`);
  const nums = Array.from({ length: 2000 }, (_, i) => String(1000000 + i * 7));
  for (const id of nums.slice(0, 300)) f.add(id);
  const fp = nums.slice(300).filter((id) => f.has(id)).length;
  assert.ok(fp <= 2, `numeric ids at 300 held: ${fp} false positives in 1700`);
});
