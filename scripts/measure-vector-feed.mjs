#!/usr/bin/env node
// scripts/measure-vector-feed.mjs — declared-criteria measurement for r18:
// catalog vectors into the feed (gamma sparse-graph fallback + reach
// coherence).
//
//   set -a; source .env.local; set +a
//   node scripts/measure-vector-feed.mjs
//
// Method: 120 seeded bots warm up (3 pages, vectors OFF — the behavior
// world is the shipped one), then their EXACT profile/edge state is served
// twice — vectors ON vs OFF — and the two slates are compared same-state.
// Keyed DB pool, PURE READS, no probes.
//
// Criteria (DECLARED HERE, before the run):
//   reach coherence — mean affinity of REACH-slot items to the bot's
//     latent (affinity-expanded) taste is STRICTLY higher with vectors ON
//     across the cohort; reach slots must stay structurally far
//     (tag-space direct sim below the engine's own reach ceiling is the
//     engine's law, unchanged — we assert slot counts identical).
//   thin-graph gamma — among core slots, the mean latent affinity of
//     gamma-attributed items is ≥ the OFF arm's (vector fallback must not
//     pollute gamma with worse candidates than the silent graph left).
//   holds — page structure identical (zone counts, brand cap ≤ 2);
//     satisfaction proxy (top-24 latent affinity) not degraded beyond the
//     cohort half-sample noise; cold users byte-identical (unit-tested);
//     determinism run-to-run.

import { makeBots, simulateSession } from "../lib/brain/replay.js";
import { buildFeed } from "../lib/brain/index.js";
import { vecSim } from "../lib/brain/bridges.js";
import { getDiscoverablePool } from "../lib/products.js";

const BOTS = 120, WARMUP_PAGES = 3, SEED = 20260806;
const pool = await getDiscoverablePool({ limit: 5000 });
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function serveBoth(bot, state) {
  process.env.BRAIN_VECTOR_NEIGHBORS = "0";
  const off = buildFeed(structuredClone(state), pool);
  delete process.env.BRAIN_VECTOR_NEIGHBORS;
  const on = buildFeed(structuredClone(state), pool);
  const aff = (it) => vecSim(it.tags || {}, bot.expanded);
  const reachAff = (r) => mean(r.items.filter((it) => it._zone === "reach").map(aff));
  const gammaAff = (r) => mean(r.items.filter((it) => it._zone === "core" && it._bridge === "gamma").map(aff));
  const top24 = (r) => mean(r.items.slice(0, 24).map(aff));
  const zones = (r) => r.items.reduce((m, it) => { m[it._zone] = (m[it._zone] || 0) + 1; return m; }, {});
  const brandMax = (r) => Math.max(...Object.values(r.items.reduce((m, it) => { m[it.brand || ""] = (m[it.brand || ""] || 0) + 1; return m; }, {})));
  return {
    reachOff: reachAff(off), reachOn: reachAff(on),
    gammaOff: gammaAff(off), gammaOn: gammaAff(on),
    topOff: top24(off), topOn: top24(on),
    zonesSame: JSON.stringify(zones(off)) === JSON.stringify(zones(on)),
    brandOk: brandMax(on) <= 2,
  };
}

function battery() {
  const bots = makeBots(BOTS, SEED);
  const rows = [];
  for (const bot of bots) {
    process.env.BRAIN_VECTOR_NEIGHBORS = "0"; // behavior world = shipped
    const session = simulateSession(bot, null, { pool, pages: WARMUP_PAGES });
    delete process.env.BRAIN_VECTOR_NEIGHBORS;
    const last = session.log[session.log.length - 1].stateSnapshot;
    // recents exist only if the bot engaged; keep only warm bots (declared:
    // the feature targets warm users; cold inertness is unit-tested).
    if (!(last.profile._meta.recent || []).length) continue;
    rows.push(serveBoth(bot, { ...structuredClone(last), limit: 60 }));
  }
  return rows;
}

const r1 = battery();
const r2 = battery();
const deterministic = JSON.stringify(r1) === JSON.stringify(r2);

const withReach = r1.filter((r) => r.reachOff > 0 || r.reachOn > 0);
const reachOff = mean(withReach.map((r) => r.reachOff));
const reachOn = mean(withReach.map((r) => r.reachOn));
const withGamma = r1.filter((r) => r.gammaOff > 0 || r.gammaOn > 0);
const gammaOff = mean(withGamma.map((r) => r.gammaOff));
const gammaOn = mean(withGamma.map((r) => r.gammaOn));
const topOff = mean(r1.map((r) => r.topOff));
const topOn = mean(r1.map((r) => r.topOn));
const half = Math.floor(r1.length / 2);
const noise = Math.abs(mean(r1.slice(0, half).map((r) => r.topOff)) - mean(r1.slice(half).map((r) => r.topOff)));
const zonesSame = r1.every((r) => r.zonesSame);
const brandOk = r1.every((r) => r.brandOk);

console.log(`warm bots          : ${r1.length}/${BOTS}`);
console.log(`reach affinity     : off ${reachOff.toFixed(4)} → on ${reachOn.toFixed(4)} (${withReach.length} bots with reach slots)`);
console.log(`gamma-slot affinity: off ${gammaOff.toFixed(4)} → on ${gammaOn.toFixed(4)} (${withGamma.length} bots with gamma slots)`);
console.log(`top-24 affinity    : off ${topOff.toFixed(4)} → on ${topOn.toFixed(4)} (noise ${noise.toFixed(4)})`);
console.log(`zone structure identical: ${zonesSame}; brand cap ok: ${brandOk}`);
const pass = reachOn > reachOff && gammaOn >= gammaOff - 1e-9 && topOn >= topOff - noise && zonesSame && brandOk && deterministic;
console.log(`VERDICT: ${pass ? "PASS" : "FAIL"}; deterministic ${deterministic}`);
process.exit(pass ? 0 : 1);
