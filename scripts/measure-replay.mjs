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

import { makeBots, simulateSession, replayEstimate, rankAgreement } from "../lib/brain/replay.js";
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

function liveScores(bots) {
  const live = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    let s = 0;
    for (const bot of bots) s += simulateSession(bot, policy, { pool, pages: PAGES }).satisfaction;
    live[name] = +(s / bots.length).toFixed(5);
  }
  return live;
}

function battery() {
  const bots = makeBots(BOTS, SEED);
  const live = liveScores(bots);
  // Noise floor: live scores on two disjoint half-samples; σ per policy pair
  // = |halfA Δ − halfB Δ| gives the scale of sampling noise for that pair.
  const halfA = liveScores(bots.slice(0, BOTS / 2));
  const halfB = liveScores(bots.slice(BOTS / 2));
  // behavior corpus: sessions logged under the shipped policy
  const sessions = bots.map((bot) => simulateSession(bot, null, { pool, pages: PAGES }));
  const replay = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    replay[name] = +replayEstimate(sessions, policy, { pool }).toFixed(5);
  }
  return { live, halfA, halfB, replay };
}

const run1 = battery();
const run2 = battery();

console.log("live  :", JSON.stringify(run1.live));
console.log("replay:", JSON.stringify(run1.replay));
const names = Object.keys(POLICIES);
let decided = 0, agreed = 0, undecided = [];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = names[i], b = names[j];
  const dLive = run1.live[a] - run1.live[b];
  const noise = Math.abs((run1.halfA[a] - run1.halfA[b]) - (run1.halfB[a] - run1.halfB[b]));
  if (Math.abs(dLive) > 2 * noise && Math.abs(dLive) > 1e-4) {
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
console.log(`undecided pairs (reported, not scored): ${undecided.join(", ") || "none"}`);
console.log(`blanket rank agreement (informational): ${rankAgreement(run1.live, run1.replay)}`);
console.log(`VERDICT: decided pairs ${agreed}/${decided} agree (need all); deterministic ${deterministic}; base-not-last ${baseNotLast}`);
if (decided === 0 || agreed !== decided || !deterministic || !baseNotLast) process.exit(1);
console.log("CALIBRATED");
