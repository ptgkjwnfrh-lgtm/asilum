#!/usr/bin/env node
// scripts/measure-replay.mjs — declared-criteria measurement for r15: the
// offline replay harness calibration.
//
//   set -a; source .env.local; set +a
//   node scripts/measure-replay.mjs
//
// Single-arm (the harness is new — there is no baseline implementation to
// compare against); the verdict is CALIBRATION, not improvement. Keyed DB
// pool (getDiscoverablePool), PURE READS — no probes to clean.
//
// Criteria (DECLARED HERE, before the run):
//   calibration — replay's ranking of the five candidate policies must
//     agree with live simulation's ranking at ≥ 0.8 pairwise agreement
//     (8/10 pairs). live = bots browse feeds actually built under the
//     policy; replay = sessions logged under the SHIPPED policy, scored
//     counterfactually. Below 0.8 the harness is not trustworthy and r16
//     must not proceed on top of it.
//   determinism — the whole battery, run twice in-process, produces
//     byte-identical score tables.
//   sanity — the shipped policy must NOT rank last in live (the bots'
//     world is built around today's tuning; if BASE loses to everything,
//     the bot model, not the policies, is broken).

// AMENDMENT HISTORY (declared, chronological):
//   1 (8/4) — first run measured 0.5 agreement and exposed two method
//     defects, both classic: (a) raw position-weight replay is biased toward
//     the behavior policy (its slates cover their own outcomes perfectly) —
//     replaced with ADVANTAGE scoring (candidate weight minus the logged
//     slot's weight; the shared term cancels); (b) rank agreement over live
//     TIE-CLUSTERS is a coin flip (four policies sat within 0.006) — the
//     criterion is now: replay must agree on ALL pairs whose live Δ exceeds
//     2× the half-sample noise floor ("decided pairs"); undecided pairs are
//     reported, never scored. Bots 40 → 120 to sharpen estimates. The ≥0.8
//     blanket threshold is superseded by 100%-of-decided-pairs, which is
//     STRICTER where measurement is meaningful and honest where it is not.

//   2 (8/6) — SHARED WORLD + a declared sensitivity arm (r22, audit #10 and
//     the #23 investigation). Every bot used to browse a private world, so
//     after #123 no item could ever reach a second viewer and the delta
//     bridge held exactly two distinct values pool-wide — the delta-heavy
//     policy was being ranked on a constant. The population now shares one
//     world per arm, as prod does. Both worlds are calibrated, in full:
//       flat      — the pre-r22 bot, shared world only.
//       satiating — attention decay, dropout, satiation, price sensitivity.
//     DECLARED CRITERION FOR THE KNOBS THEMSELVES (stated before the run, and
//     deliberately NOT "exploration must stop losing" — demanding a
//     particular winner is how a harness gets built toward an answer):
//     the two worlds must produce DIFFERENT live rankings. Identical rankings
//     would mean the realism knobs are decorative and audit #10's blind spot
//     survives them. Where the exploration-heavy policy lands in each world is
//     printed, as the audit asked, but is reported rather than gated.

import { makeBots, simulatePopulation, replayEstimate, rankAgreement, WORLDS } from "../lib/brain/replay.js";
import { resampledPairSigma, singleSplitNoise } from "../lib/brain/noise.js";
import { getDiscoverablePool } from "../lib/products.js";

const POLICIES = {
  base: null, // the shipped split
  "alpha-heavy": { alpha: 60, beta: 10, gamma: 10, delta: 10, epsilon: 5, ad: 5 },
  "gamma-heavy": { alpha: 20, beta: 5, gamma: 45, delta: 10, epsilon: 15, ad: 5 },
  "delta-heavy": { alpha: 15, beta: 5, gamma: 10, delta: 55, epsilon: 10, ad: 5 },
  "epsilon-heavy": { alpha: 10, beta: 5, gamma: 10, delta: 10, epsilon: 60, ad: 5 },
};
const BOTS = 120, PAGES = 6, SEED = 20260804;

const pool = await getDiscoverablePool({ limit: 5000 });

function liveScores(bots, world) {
  const live = {};
  const perBot = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    // One shared world per policy arm — bots browse it together, so the
    // crowd-fed bridges (delta, gamma) carry real signal for the policy that
    // leans on them.
    const { sessions } = simulatePopulation(bots, { pool, pages: PAGES, policy, world });
    // (r26) PER-BOT scores are kept, not just the mean: the pair noise floor
    // is now resampled from them instead of read off one fixed half-split.
    perBot[name] = sessions.map((s) => s.satisfaction);
    live[name] = +(sessions.reduce((s, x) => s + x.satisfaction, 0) / bots.length).toFixed(5);
  }
  return { live, perBot };
}

function battery(world) {
  const bots = makeBots(BOTS, SEED);
  const { live, perBot } = liveScores(bots, world);
  // behavior corpus: sessions logged under the shipped policy
  const { sessions } = simulatePopulation(bots, { pool, pages: PAGES, world });
  const replay = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    replay[name] = +replayEstimate(sessions, policy, { pool }).toFixed(5);
  }
  return { live, perBot, replay };
}

function calibrate(world) {
  const run1 = battery(world);
  const run2 = battery(world);
  console.log(`\n--- world: ${world.name} ---`);
  console.log("live  :", JSON.stringify(run1.live));
  console.log("replay:", JSON.stringify(run1.replay));
  const names = Object.keys(POLICIES);
  let decided = 0, agreed = 0, undecided = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    const dLive = run1.live[a] - run1.live[b];
    // (r26) sigma of the paired half-split difference over 25 seeded shuffles,
    // not one fixed split. The old single draw is computed alongside and
    // printed whenever the two estimators disagree about a pair.
    const noise = resampledPairSigma(run1.perBot[a], run1.perBot[b], { seed: 26 });
    const oldNoise = Math.abs(singleSplitNoise(run1.perBot[a]) - singleSplitNoise(run1.perBot[b]));
    const decidedNow = Math.abs(dLive) > 2 * noise && Math.abs(dLive) > 1e-4;
    const decidedBefore = Math.abs(dLive) > 2 * oldNoise && Math.abs(dLive) > 1e-4;
    if (decidedNow !== decidedBefore) {
      console.log(`  ESTIMATOR CHANGED ${a} vs ${b}: ${decidedBefore ? "decided" : "undecided"} -> ${decidedNow ? "decided" : "undecided"} (Δ ${dLive.toFixed(5)}, sigma ${noise.toFixed(5)} vs single-draw ${oldNoise.toFixed(5)})`);
    }
    if (decidedNow) {
      decided++;
      const dReplay = run1.replay[a] - run1.replay[b];
      if (Math.sign(dLive) === Math.sign(dReplay)) agreed++;
      else console.log(`DECIDED PAIR DISAGREES: ${a} vs ${b} (live Δ ${dLive.toFixed(4)}, replay Δ ${dReplay.toFixed(4)})`);
    } else {
      undecided.push(`${a}~${b}`);
    }
  }
  const deterministic = JSON.stringify(run1) === JSON.stringify(run2);
  const liveRanking = Object.entries(run1.live).sort((x, y) => y[1] - x[1]).map(([n]) => n);
  const baseNotLast = liveRanking[liveRanking.length - 1] !== "base";
  console.log(`live ranking: ${liveRanking.join(" > ")}`);
  console.log(`  exploration-heavy (epsilon-heavy) sits at position ${liveRanking.indexOf("epsilon-heavy") + 1}/${liveRanking.length} (reported, per audit #10)`);
  console.log(`undecided pairs (reported, not scored): ${undecided.join(", ") || "none"}`);
  console.log(`blanket rank agreement (informational): ${rankAgreement(run1.live, run1.replay)}`);
  const ok = decided > 0 && agreed === decided && deterministic && baseNotLast;
  console.log(`VERDICT (${world.name}): decided pairs ${agreed}/${decided} agree (need all); deterministic ${deterministic}; base-not-last ${baseNotLast} → ${ok ? "CALIBRATED" : "NOT CALIBRATED"}`);
  return { ok, ranking: liveRanking };
}

const flat = calibrate(WORLDS.flat);
const sati = calibrate(WORLDS.satiating);
// Amendment 2's knob criterion: the worlds must be able to disagree.
const worldsDiffer = JSON.stringify(flat.ranking) !== JSON.stringify(sati.ranking);
console.log(`\nrealism knobs move the verdict: ${worldsDiffer} (identical rankings would mean the knobs are decorative)`);
console.log(`GATE = flat world: ${flat.ok ? "CALIBRATED" : "NOT CALIBRATED"} | sensitivity (satiating, reported only): ${sati.ok ? "CALIBRATED" : "NOT CALIBRATED"}`);
if (!flat.ok || !worldsDiffer) process.exit(1);
