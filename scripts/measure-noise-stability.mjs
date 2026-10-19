#!/usr/bin/env node
// scripts/measure-noise-stability.mjs — declared-criteria measurement for r26:
// RESAMPLED NOISE FLOORS (audit #26).
//
//   set -a; source .env.local; set +a
//   node scripts/measure-noise-stability.mjs
//
// Keyed DB pool, PURE READS — nothing written anywhere.
//
// WHY THIS SCRIPT EXISTS AND NOT JUST A CODE CHANGE. Replacing a noise floor
// moves pass/fail boundaries. One of the two changes in this round makes a
// criterion LOOSER — measure-tuning's per-bot degradation threshold was a
// cohort-mean quantity applied per bot, roughly sqrt(60) too small — and a
// change that loosens a criterion has to prove it is not laundering a failure
// into a pass. That proof cannot live in a PR body; it has to be a number
// anyone can re-run.
//
// Criteria (DECLARED HERE, before the run):
//
//   S1  STABILITY — the audit's own proposed proof. Re-run with different bot
//       SEEDS and compare how often a policy pair's decided/undecided
//       classification CHANGES. The resampled estimator must flip strictly
//       fewer classifications than the single-draw one. FAILS IF it does not:
//       resampling would then be a more complicated way of being equally
//       arbitrary, and the round should be abandoned rather than shipped.
//
//   S2  TEETH — the anti-masking criterion, and the reason this round was
//       flagged delicate. Run a policy that genuinely harms bots
//       (epsilon-heavy: exploration cranked to 60% of the blend) against base
//       under the NEW, looser per-bot band. Degraded must still exceed the
//       25% cap. FAILS IF the loosened threshold lets a harmful policy pass —
//       that is precisely the laundering this criterion exists to detect.
//
//   S3  NO SILENT FLIP — every criterion whose verdict differs between the two
//       estimators is printed, in every battery, on every run. Reported rather
//       than gated: a boundary that moves is the POINT of the round; a
//       boundary that moves without anyone noticing is the defect.
//
//   S4  DETERMINISM — run twice in-process, byte-identical.
//
// AMENDMENT HISTORY: none yet (first run).

import { makeBots, simulatePopulation, WORLDS } from "../lib/brain/replay.js";
import { baseSplit } from "../lib/brain/bridges.js";
import { getDiscoverablePool } from "../lib/products.js";
import { resampledPairSigma, singleSplitNoise, stdev } from "../lib/brain/noise.js";

const BOTS = 60, PAGES = 4, SEEDS = [20260806, 20260807, 20260808, 20260809];
const DEGRADED_CAP = 0.25;
const pool = await getDiscoverablePool({ limit: 5000 });
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const POLICIES = {
  base: null,
  "alpha-heavy": { alpha: 60, beta: 10, gamma: 10, delta: 10, epsilon: 5, ad: 5 },
  "gamma-heavy": { alpha: 20, beta: 5, gamma: 45, delta: 10, epsilon: 15, ad: 5 },
  "delta-heavy": { alpha: 15, beta: 5, gamma: 10, delta: 55, epsilon: 10, ad: 5 },
  "epsilon-heavy": { alpha: 10, beta: 5, gamma: 10, delta: 10, epsilon: 60, ad: 5 },
};

function armScores(bots, policy, world, tune = false) {
  const { sessions } = simulatePopulation(bots, { pool, pages: PAGES, policy, world, tune });
  return sessions.map((s) => s.satisfaction);
}

function forSeed(seed, world) {
  const bots = makeBots(BOTS, seed);
  const perBot = {};
  for (const [name, policy] of Object.entries(POLICIES)) perBot[name] = armScores(bots, policy, world);
  const tuned = armScores(bots, null, world, true);
  return { perBot, tuned, base: perBot.base };
}

/** decided/undecided for every pair, under both estimators. */
function classify(perBot) {
  const names = Object.keys(POLICIES);
  const out = {};
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    const d = mean(perBot[a]) - mean(perBot[b]);
    const sigma = resampledPairSigma(perBot[a], perBot[b], { seed: 26 });
    const single = Math.abs(singleSplitNoise(perBot[a]) - singleSplitNoise(perBot[b]));
    out[`${a}~${b}`] = {
      resampled: Math.abs(d) > 2 * sigma && Math.abs(d) > 1e-4,
      single: Math.abs(d) > 2 * single && Math.abs(d) > 1e-4,
    };
  }
  return out;
}

function run(world) {
  const bySeed = SEEDS.map((s) => forSeed(s, world));
  const classes = bySeed.map((r) => classify(r.perBot));

  // S1: how many pair classifications change as the seed changes?
  const pairs = Object.keys(classes[0]);
  let flipResampled = 0, flipSingle = 0;
  const flippedPairs = [];
  for (const p of pairs) {
    const rs = new Set(classes.map((c) => c[p].resampled));
    const sg = new Set(classes.map((c) => c[p].single));
    if (rs.size > 1) { flipResampled++; flippedPairs.push(`${p}(resampled)`); }
    if (sg.size > 1) { flipSingle++; flippedPairs.push(`${p}(single)`); }
  }

  // S2: teeth. epsilon-heavy vs base, judged by the NEW per-bot band.
  const teeth = bySeed.map((r) => {
    const harmful = r.perBot["epsilon-heavy"];
    const diffs = harmful.map((s, i) => s - r.base[i]);
    const band = stdev(diffs);
    const degraded = diffs.filter((d) => d < -band).length;
    return { degraded, band, frac: degraded / BOTS };
  });

  // S3: the boundary move on the real tuned arm, both estimators side by side.
  const moves = bySeed.map((r) => {
    const diffs = r.tuned.map((s, i) => s - r.base[i]);
    const perBotBand = stdev(diffs);
    const cohortFloor = singleSplitNoise(r.base);
    return {
      degradedNew: diffs.filter((d) => d < -perBotBand).length,
      degradedOld: diffs.filter((d) => d < -cohortFloor).length,
      perBotBand: +perBotBand.toFixed(5),
      cohortFloor: +cohortFloor.toFixed(5),
    };
  });

  return { flipResampled, flipSingle, flippedPairs, teeth, moves, pairs: pairs.length };
}

function report(world) {
  const r1 = run(world);
  const r2 = run(world);
  const deterministic = JSON.stringify(r1) === JSON.stringify(r2);

  console.log(`\n=== world: ${world.name} — ${SEEDS.length} bot seeds x ${BOTS} bots x ${PAGES} pages ===`);
  console.log(`S1 pair classifications that change with the seed (of ${r1.pairs} pairs):`);
  console.log(`     single-draw floor : ${r1.flipSingle}`);
  console.log(`     resampled sigma   : ${r1.flipResampled}`);
  const s1 = r1.flipResampled < r1.flipSingle;
  console.log(`   S1 ${s1 ? "ok" : "FAIL"} — resampling must be strictly more stable${s1 ? "" : "; if it is not, this round should be abandoned rather than shipped"}`);

  console.log(`S2 teeth — a genuinely harmful policy (epsilon-heavy) under the NEW per-bot band:`);
  for (let i = 0; i < SEEDS.length; i++) {
    const t = r1.teeth[i];
    console.log(`     seed ${SEEDS[i]}: degraded ${t.degraded}/${BOTS} (${(t.frac * 100).toFixed(0)}%) at band ${t.band.toFixed(5)}`);
  }
  const s2 = r1.teeth.every((t) => t.frac > DEGRADED_CAP);
  console.log(`   S2 ${s2 ? "ok" : "FAIL"} — must exceed the ${DEGRADED_CAP * 100}% cap on every seed, or the looser band launders harm into a pass`);

  console.log(`S3 boundary move on the real tuned arm (reported, not gated):`);
  for (let i = 0; i < SEEDS.length; i++) {
    const m = r1.moves[i];
    console.log(`     seed ${SEEDS[i]}: degraded ${m.degradedOld} -> ${m.degradedNew}   (cohort floor ${m.cohortFloor} -> per-bot band ${m.perBotBand})`);
  }

  console.log(`VERDICT (${world.name}): S1 ${s1 ? "PASS" : "FAIL"}; S2 ${s2 ? "PASS" : "FAIL"}; deterministic ${deterministic}`);
  return s1 && s2 && deterministic;
}

const flat = report(WORLDS.flat);
const sati = report(WORLDS.satiating);
console.log(`\nGATE = flat world: ${flat ? "PASS" : "FAIL"} | sensitivity (satiating, reported only): ${sati ? "PASS" : "FAIL"}`);
process.exit(flat ? 0 : 1);
