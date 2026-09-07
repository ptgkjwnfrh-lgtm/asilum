#!/usr/bin/env node
// scripts/measure-feed-chunks.mjs — the chunk laws, composed and measured on
// the real seed catalog and the real assembler. Runs as a steward instrument
// (lib/steward/instruments.js) on every CI push and in the daily movement
// report, so a regression in the feed's contract surfaces as a number, not
// as a verifier's transcript.
//
//   node scripts/measure-feed-chunks.mjs
//
// Pure reads: no database, no network, nothing written.
//
// WHAT IT COMPOSES (a green instrument proves only what it composes — each
// criterion below is measured on the SAME scrolled sessions, not in isolation):
//
//   share        the catalog lane holds 25% of every chunk, in every reader
//                state, over a whole scrolled session — short only where the
//                brand cap defers a listing (declared) or the listing is dry
//   repeats      a scroll never serves an item twice until the pool is dry —
//                under cursor rotation (GENERAL, anonymous) AND memory
//                rotation (OBSERVE), with the taste moving every chunk
//   full         a page is never short while the pool can fill it, including
//                filtered pools smaller than the chunk and a one-brand pool
//   cap          no brand holds more than two slots on a page, in any zone
//   drain        a run of one brand at the head of the listing drains at two
//                per chunk, in order, nothing dropped
//   clause       a hyper-concentrated taste never turns a chunk into one
//                thing: at most 75% one dominant tag, several aesthetics
//   fresh        a chunk after the taste moved is new — not the page again
//   cursor       the cursor stays under 2 KB and a chunk assembles in < 40 ms
//
// Prints `N defects` and a VERDICT; exits non-zero on any defect.

import { CATALOG } from "../lib/ingest/catalog.js";
import { assembleChunk } from "../lib/brain/bridges.js";
import { buildFeed, learn, markSeen, tasteVector } from "../lib/brain/index.js";
import { chunkQuotas, CATALOG_SHARE, CURSOR_MAX_LEN } from "../lib/brain/chunk.js";

const defects = [];
const defect = (msg) => { defects.push(msg); console.log(`  DEFECT ${msg}`); };
const laneOf = (items) => items.filter((it) => it._zone === "catalog");
const dominant = (it) => Object.entries(it.tags || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
const brandKey = (it) => String(it.brand || "").trim().toLowerCase();

const PROFILES = {
  cold: { long: {}, session: {}, _meta: { recent: [], seen: [] } },
  tasted: { long: { MINIMAL: 0.9, TAILORED: 0.6, UTILITARIAN: 0.3 }, session: { MINIMAL: 0.4 }, _meta: { recent: [], seen: [] } },
  hyper: { long: { STREETWEAR: 1 }, session: { STREETWEAR: 1 }, _meta: { recent: [], seen: [] } },
};

console.log(`FEED CHUNKS — ${CATALOG.length} seed items`);

// ---- share + repeats + cap + clause, over scrolled sessions -------------------
for (const [name, base] of Object.entries(PROFILES)) {
  for (const rotation of ["cursor", "memory"]) {
    let profile = structuredClone(base);
    let cursor = null;
    const served = new Set();
    let laneServed = 0, slots = 0, deferredChunks = 0, capBreaks = 0, oneThing = 0, repeats = 0;
    const limits = [60, ...Array(10).fill(24)];
    for (let k = 0; k < limits.length; k++) {
      const limit = limits[k];
      const r = buildFeed({ profile, limit, rotation, catalog: { cursor } }, CATALOG);
      const items = r.items;
      if (items.length !== limit) defect(`${name}/${rotation} chunk ${k + 1}: ${items.length} of ${limit} items`);
      const brands = {};
      for (const it of items) brands[brandKey(it)] = (brands[brandKey(it)] || 0) + 1;
      if (Object.values(brands).some((n) => n > 2)) capBreaks++;
      for (const it of items) { if (served.has(it.id)) repeats++; served.add(it.id); }
      const lane = laneOf(items);
      laneServed += lane.length; slots += limit;
      if (r.catalog.deferred) deferredChunks++;
      else if (!r.catalog.exhausted && lane.length !== chunkQuotas(limit, { hasTaste: true }).catalog) {
        defect(`${name}/${rotation} chunk ${k + 1}: lane ${lane.length}, quota ${chunkQuotas(limit, { hasTaste: true }).catalog}, not deferred, not exhausted`);
      }
      if (name === "hyper") {
        const dom = {};
        for (const it of items) dom[dominant(it)] = (dom[dominant(it)] || 0) + 1;
        const top = Math.max(...Object.values(dom));
        if (top / limit > 0.75 || Object.keys(dom).length < 4) oneThing++;
      }
      // The reader acts every chunk: two favourites, one pass — the taste moves.
      profile = learn(profile, items[0], "favorite");
      profile = learn(profile, items[1], "favorite");
      profile = learn(profile, items[2], "skip", { dwellMs: 600 });
      if (rotation === "memory") profile = markSeen(profile, items.map((it) => it.id), CATALOG.length);
      cursor = r.catalog.nextCursor;
      if (cursor.length > 2048) defect(`${name}/${rotation}: cursor ${cursor.length} chars`);
    }
    const share = laneServed / slots;
    console.log(`${name.padEnd(7)} ${rotation.padEnd(7)} served ${served.size}/${slots} share ${(share * 100).toFixed(1)}% deferred ${deferredChunks} repeats ${repeats} capBreaks ${capBreaks}${name === "hyper" ? ` oneThing ${oneThing}` : ""}`);
    if (repeats) defect(`${name}/${rotation}: ${repeats} repeats before the pool was dry`);
    if (capBreaks) defect(`${name}/${rotation}: brand cap broken on ${capBreaks} chunks`);
    if (share < CATALOG_SHARE - 0.03) defect(`${name}/${rotation}: lane share ${(share * 100).toFixed(1)}% over the session (law ${CATALOG_SHARE * 100}%)`);
    if (oneThing) defect(`hyper/${rotation}: ${oneThing} chunks were one thing`);
  }
}

// ---- full: small and one-brand pools ---------------------------------------------
for (const [label, pool, limit] of [
  ["ten items", CATALOG.slice(0, 10), 60],
  ["twenty items", CATALOG.slice(0, 20), 60],
  ["forty-four items", CATALOG.slice(0, 44), 60],
  ["one brand ×100", Array.from({ length: 100 }, (_, i) => ({ id: `one-${i}`, brand: "ONE", tags: { MINIMAL: 0.5 } })), 24],
]) {
  const brands = {};
  for (const it of pool) brands[brandKey(it)] = (brands[brandKey(it)] || 0) + 1;
  const cappable = Object.values(brands).reduce((n, c) => n + Math.min(2, c), 0);
  const r = assembleChunk(pool, tasteVector(PROFILES.tasted), { limit, popularity: {}, catalog: { cursor: null }, rotation: "memory" });
  const want = Math.min(limit, cappable);
  console.log(`full    ${label.padEnd(18)} ${r.items.length}/${want}`);
  if (r.items.length !== want) defect(`full: ${label} served ${r.items.length}, ${want} possible`);
}

// ---- drain: a brand run at the head of the listing ----------------------------
{
  const listing = [
    ...Array.from({ length: 15 }, (_, i) => ({ id: `x${String(i).padStart(2, "0")}`, brand: "X", tags: { MINIMAL: 0.9 } })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `y${String(i).padStart(2, "0")}`, brand: `B${i}`, tags: { STATEMENT: 0.8 } })),
  ];
  let cursor = null;
  const laneIds = [];
  for (let k = 0; k < 10; k++) {
    const r = assembleChunk(listing, { MINIMAL: 0.9 }, { limit: 12, popularity: {}, catalog: { cursor }, rotation: "cursor" });
    laneIds.push(...laneOf(r.items).map((it) => it.id));
    cursor = r.catalog.nextCursor;
  }
  const xs = laneIds.filter((id) => id.startsWith("x"));
  const inOrder = xs.every((id, i) => i === 0 || id > xs[i - 1]);
  console.log(`drain   run of 15 → lane served ${xs.length}/15 in order ${inOrder}`);
  if (xs.length !== 15 || !inOrder) defect(`drain: ${xs.length}/15 of the run served by the lane, in order ${inOrder}`);
}

// ---- fresh: a chunk after the taste moved is new ----------------------------------
{
  let profile = structuredClone(PROFILES.cold);
  const first = buildFeed({ profile, limit: 60, rotation: "cursor", catalog: { cursor: null } }, CATALOG);
  const page = new Set(first.items.map((it) => it.id));
  const loud = first.items.filter((it) => (it.tags || {}).STATEMENT >= 0.5).slice(0, 3);
  for (const it of loud) { profile = learn(profile, it, "favorite"); profile = learn(profile, it, "bag"); }
  const next = buildFeed({ profile, limit: 24, rotation: "cursor", catalog: { cursor: first.catalog.nextCursor } }, CATALOG);
  const fresh = next.items.filter((it) => !page.has(it.id)).length;
  const align = (r) => {
    const t = tasteVector(profile);
    const core = r.items.filter((it) => it._zone === "core");
    const dot = (a, b) => Object.keys(a).reduce((s, k) => s + (a[k] || 0) * (b[k] || 0), 0);
    return core.reduce((s, it) => s + dot(it.tags || {}, t), 0) / Math.max(1, core.length);
  };
  console.log(`fresh   after 3 favourites + 3 bags: ${fresh}/24 new, core alignment ${align(first).toFixed(3)} → ${align(next).toFixed(3)}`);
  if (fresh < 22) defect(`fresh: only ${fresh}/24 new after the taste moved`);
  if (align(next) <= align(first)) defect(`fresh: the core did not move toward what was bagged`);
}

// ---- cursor + cost -----------------------------------------------------------------
{
  const t0 = performance.now();
  let cursor = null;
  for (let k = 0; k < 5; k++) {
    const r = assembleChunk(CATALOG, tasteVector(PROFILES.tasted), { limit: 60, popularity: {}, catalog: { cursor }, rotation: "cursor" });
    cursor = r.catalog.nextCursor;
  }
  const ms = (performance.now() - t0) / 5;
  console.log(`cursor  ${cursor.length} chars (ceiling ${CURSOR_MAX_LEN}) · ${ms.toFixed(1)} ms per 60-item chunk`);
  if (cursor.length >= CURSOR_MAX_LEN / 2) defect(`cursor: ${cursor.length} chars`);
  if (ms > 40) defect(`cost: ${ms.toFixed(1)} ms per chunk`);
}

console.log(`\n${defects.length} defects`);
console.log(`VERDICT: ${defects.length === 0 ? "PASS" : "FAIL"} (share · repeats · full · cap · drain · clause · fresh · cursor)`);
process.exit(defects.length === 0 ? 0 : 1);
