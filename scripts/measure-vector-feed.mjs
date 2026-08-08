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

// AMENDMENT (8/6, r22): the warm-up population now shares ONE world, as prod
// does — a global edge graph and shared popularity counters. r18 is a
// GAMMA-and-reach round, so this is not cosmetic: the neighbor graph the
// feature falls back on is by definition built by other people, and a
// per-bot private graph could only ever contain the bot's own five recent
// engagements. The battery is additionally run in the audit-#10 satiating
// world as a declared sensitivity arm; the flat world gates.

import { makeBots, simulatePopulation, WORLDS } from "../lib/brain/replay.js";
import { resampledPairSigma, singleSplitNoise } from "../lib/brain/noise.js";
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
    zonesOff: zones(off), zonesOn: zones(on),
    brandOk: brandMax(on) <= 2,
  };
}

function battery(world) {
  const bots = makeBots(BOTS, SEED);
  const rows = [];
  process.env.BRAIN_VECTOR_NEIGHBORS = "0"; // behavior world = shipped
  const { sessions } = simulatePopulation(bots, { pool, pages: WARMUP_PAGES, world });
  delete process.env.BRAIN_VECTOR_NEIGHBORS;
  for (const session of sessions) {
    const bot = bots.find((b) => b.id === session.botId);
    const last = session.log[session.log.length - 1].stateSnapshot;
    // recents exist only if the bot engaged; keep only warm bots (declared:
    // the feature targets warm users; cold inertness is unit-tested).
    if (!(last.profile._meta.recent || []).length) continue;
    rows.push(serveBoth(bot, { ...structuredClone(last), limit: 60 }));
  }
  return rows;
}

function report(world) {
const r1 = battery(world);
const r2 = battery(world);
const deterministic = JSON.stringify(r1) === JSON.stringify(r2);

const withReach = r1.filter((r) => r.reachOff > 0 || r.reachOn > 0);
const reachOff = mean(withReach.map((r) => r.reachOff));
const reachOn = mean(withReach.map((r) => r.reachOn));
const withGamma = r1.filter((r) => r.gammaOff > 0 || r.gammaOn > 0);
const gammaOff = mean(withGamma.map((r) => r.gammaOff));
const gammaOn = mean(withGamma.map((r) => r.gammaOn));
const topOff = mean(r1.map((r) => r.topOff));
const topOn = mean(r1.map((r) => r.topOn));
// (r26) The criterion is a PAIRED contrast (same bot state, vectors on vs
// off), so the floor is the sigma of that paired difference over 25 seeded
// shuffles — not one split of the OFF arm alone, which measured between-bot
// spread rather than the spread of the thing under test.
const noise = resampledPairSigma(r1.map((r) => r.topOff), r1.map((r) => r.topOn), { seed: 26 });
const oldNoise = singleSplitNoise(r1.map((r) => r.topOff));
const zonesSame = r1.every((r) => r.zonesSame);
const brandOk = r1.every((r) => r.brandOk);

console.log(`\n--- world: ${world.name} ---`);
console.log(`warm bots          : ${r1.length}/${BOTS}`);
console.log(`reach affinity     : off ${reachOff.toFixed(4)} → on ${reachOn.toFixed(4)} (${withReach.length} bots with reach slots)`);
console.log(`gamma-slot affinity: off ${gammaOff.toFixed(4)} → on ${gammaOn.toFixed(4)} (${withGamma.length} bots with gamma slots)`);
console.log(`top-24 affinity    : off ${topOff.toFixed(4)} → on ${topOn.toFixed(4)} (paired sigma ${noise.toFixed(4)}; pre-r26 single draw ${oldNoise.toFixed(4)})`);
if ((topOn >= topOff - noise) !== (topOn >= topOff - oldNoise)) console.log(`  ESTIMATOR CHANGED the top-24 verdict: ${topOn >= topOff - oldNoise ? "pass" : "fail"} -> ${topOn >= topOff - noise ? "pass" : "fail"}`);
console.log(`zone structure identical: ${zonesSame}; brand cap ok: ${brandOk}`);
// (Aug 7) `zonesSame` reported a bare `false` and nothing else, so every look
// at it started by re-deriving what had moved. It says WHAT now. The verdict
// arithmetic below is deliberately UNCHANGED: this criterion is failing, and
// making a red light legible is not the same as making it green.
//
// MEASURED, flat world: 2 of 120 bots, exactly ONE slot each, in BOTH
// directions (core 46->47/discovery 12->11, and core 52->51/discovery 6->7).
// Feed length identical. Zero of the mismatches were key-ORDER artifacts of
// the JSON.stringify comparison — that was the first hypothesis and it was
// wrong; the counts genuinely differ.
//
// MECHANISM, lib/brain/bridges.js: a discovery slot is not guaranteed. It
// falls back to CORE when the discovery candidates run out, when the best
// remaining one is below DISCOVERY_FLOOR, or when the brand cap rejects it.
// The vector feature legitimately changes the candidate set and the order the
// brand cap is consumed in, so a slot can cross that floor in either
// direction. Zone composition is therefore EMERGENT, not structural — this
// criterion asserts an equality the feed has never promised.
//
// That makes it a criterion question, not a bug: it wants a bound on the
// drift (how many bots, how many slots) rather than absolute equality. Left
// for the r18 round that owns it, with the evidence now printed rather than
// re-derived. NOTE the flat-world FAIL is NOT only this — the top-24 drop
// above (0.0162 against a paired sigma of 0.0070) is the substantive half.
if (!zonesSame) {
  const bad = r1.filter((r) => !r.zonesSame);
  const sortKeys = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  const orderOnly = bad.filter((r) => sortKeys(r.zonesOff) === sortKeys(r.zonesOn)).length;
  const slotsMoved = bad.map((r) => {
    const keys = new Set([...Object.keys(r.zonesOff), ...Object.keys(r.zonesOn)]);
    let n = 0;
    for (const k of keys) n += Math.abs((r.zonesOff[k] || 0) - (r.zonesOn[k] || 0));
    return n / 2; // each moved slot shows up as one loss and one gain
  });
  console.log(`  zone drift: ${bad.length}/${r1.length} bots; max ${Math.max(...slotsMoved)} slot(s), mean ${mean(slotsMoved).toFixed(2)}`);
  console.log(`  key-order artifacts (same counts, different order): ${orderOnly}`);
  for (const r of bad.slice(0, 3)) {
    console.log(`    off=${JSON.stringify(r.zonesOff)}  on=${JSON.stringify(r.zonesOn)}`);
  }
}
const pass = reachOn > reachOff && gammaOn >= gammaOff - 1e-9 && topOn >= topOff - noise && zonesSame && brandOk && deterministic;
console.log(`VERDICT (${world.name}): ${pass ? "PASS" : "FAIL"}; deterministic ${deterministic}`);
return pass;
}

const primary = report(WORLDS.flat);
const sensitivity = report(WORLDS.satiating);
console.log(`\nGATE = flat world: ${primary ? "PASS" : "FAIL"} | sensitivity (satiating, reported only): ${sensitivity ? "PASS" : "FAIL"}`);
process.exit(primary ? 0 : 1);
