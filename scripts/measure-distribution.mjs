#!/usr/bin/env node
// scripts/measure-distribution.mjs — declared-criteria measurement for r23:
// DISTRIBUTIONAL HEALTH (audit #12).
//
//   set -a; source .env.local; set +a
//   node scripts/measure-distribution.mjs
//
// Keyed DB pool, PURE READS — no probes to clean.
//
// WHAT WAS MISSING. The engine's only diversity laws were per-page and
// structural (brand cap ≤ 2, zone counts). Nothing iterated serve → engage →
// RE-serve, so the one loop in the system that can compound — delta ranks by
// what people engaged with, and then decides what people see — was never
// measured. Nothing compared served tag mass against a reader's own
// proportions, and nothing reported how many pages a cold reader waits,
// though the per-page state to compute it sat in every session log.
//
// METHOD. K cohorts of strangers arrive in sequence and SHARE ONE WORLD
// (r22's `carry`): cohort 2 is served a feed cohort 1 already shaped. Three
// arms over identical cohorts:
//
//   loop-free   delta = 0 — the popularity bridge removed. Concentration
//               here is what TASTE alone produces, which is the number the
//               loop's contribution has to be measured against.
//   base        the shipped split.
//   concentrator  delta × 3, renormalized — the injected fault the audit
//               asked for. If a metric cannot see this, it cannot see
//               anything, and says so before any health number is read.
//
// Measuring concentration against a LOOP-FREE CONTROL rather than an absolute
// ceiling is the load-bearing choice here. A 915-item synthetic catalog served
// to bots with two-tag tastes is concentrated no matter what the engine does;
// an absolute band would mostly measure the fixture, and would need a number
// invented before anyone knew what the fixture produces. The difference
// between base and loop-free is attributable to the loop and to nothing else.
//
// CRITERIA (DECLARED HERE, before the run). P = the battery has power; a P
// failure means no health number below it is admissible. H = product health.
//
//   P1  THE METRIC SEES INJECTED LOOP GAIN. top-decile exposure share under
//       the concentrator must exceed the loop-free arm by more than the noise
//       band (half-cohort split of the base arm). FAILS IF not — then the
//       metric does not track loop gain and nothing below it means anything.
//   P2  CALIBRATION HAS POWER. mean calibration error against the reader's
//       LATENT taste — L1 between served tag mass and the bot's exogenous
//       affinity-expanded taste — must be strictly higher under the
//       concentrator than under base.
//   P3  ALIGNMENT HAS POWER. median pages-to-alignment for cold readers must
//       be no FASTER under the concentrator than under base.
//   H1  LOOP GAIN IS BOUNDED. base top-decile share − loop-free top-decile
//       share ≤ 0.10. The loop may add at most ten points of decile share on
//       top of what taste already concentrates.
//   H2  DRIFT DOES NOT ACCELERATE UPWARD. in the base arm, no cohort-to-cohort
//       step in top-decile share may be positive AND larger than the step
//       before it. A rising, accelerating series is a runaway loop regardless
//       of its level; a falling series is later cohorts spreading exposure.
//   H3  CALIBRATION IS NOT SACRIFICED. base mean latent calibration error ≤
//       loop-free + 0.15.
//   H4  COLD READERS CONVERGE. base median pages-to-alignment ≤ 3 pages at a
//       0.45 latent-affinity threshold on the served top-24.
//   D   DETERMINISM. whole battery twice in-process, byte-identical.
//
// Both r22 worlds are run: flat GATES, satiating is the declared sensitivity
// arm (reported, never a blocker) — same split as measure-tuning.mjs.
//
// AMENDMENT HISTORY (declared, chronological):
//   1 (8/6) — the first run FAILED on three criteria; all three were
//     MIS-SPECIFIED, and each is recorded here rather than quietly rewritten.
//     No threshold was loosened; one criterion was made strictly stricter.
//
//     (a) P1 originally required concentrator > base > LOOP-FREE. The middle
//         comparison is not a power test at all — it demands that the SHIPPED
//         product concentrate measurably more than a delta-free control in
//         order for the instrument to count as working. That is backwards: a
//         loop with no gain is the good outcome, and it was measured (base
//         0.1254 vs loop-free 0.1253 — the delta bridge contributes ~0.0001
//         of decile share at shipped weights). Power is whether the metric can
//         see gain that IS there, so P1 is now concentrator vs loop-free.
//         Where base sits between them is the HEALTH question, which is H1,
//         and H1 already asked it.
//
//     (b) H2 originally read "the cohort-to-cohort increase must be
//         non-increasing". Measured steps were −0.0181 then −0.0078:
//         concentration FALLS across cohorts, and the fall gets gentler, so a
//         healthy saturating series failed a criterion written as if the
//         series could only rise. Restated in terms of what actually matters:
//         no step may be positive and larger than the one before it.
//
//     (c) P2 was measured against the reader's LEARNED PROFILE, and the
//         concentrator scored BETTER on it (0.4729 vs base 0.4786). The
//         metric was circular: the profile is trained by the very feed being
//         judged, so an arm that serves a narrow slice trains a profile that
//         matches its own slice and then scores well for matching it. This is
//         the same class of error as scoring a policy on outcomes its own
//         ordering produced. Calibration is now measured against the bot's
//         LATENT taste, which is exogenous and cannot be trained. The
//         profile-facing number is still computed and printed as a diagnostic
//         — the audit asked for feed-to-profile calibration and it is a real
//         quantity — but it gates nothing, and its circularity is stated
//         wherever it appears.
//
//   2 (8/6) — P2 STILL FAILED after 1(c), and this one is NOT a mis-specified
//     criterion. It is the metric having no power, and the honest response is
//     to shrink the claim rather than to keep trying targets until one gives
//     the expected sign.
//
//     Measured, latent calibration error: loop-free 0.8275, base 0.8318,
//     concentrator 0.8293 — NON-MONOTONE in the injected fault. The mechanism
//     is visible in the numbers: a bot's latent taste is its two anchor tags
//     expanded one hop across ~10 tags, so it is BROAD, while a good
//     personalized feed is deliberately NARROW. L1 to a broad target therefore
//     rewards breadth, and a popularity-driven feed is broader than a
//     taste-driven one. The metric cannot separate "healthy personalization"
//     from "unhealthy concentration" in this fixture, because both move it the
//     same way.
//
//     Trying a third target (engagement distribution, top-k mass, …) until one
//     ranks the concentrator worst would be fishing for a sign, which is the
//     same error as recalibrating a battery to force a pass. So: the GATE is
//     now P1 + P3, the two metrics with demonstrated power. P2 is computed and
//     printed every run, with this failure named in the output, and gates
//     nothing.
//
//     CONSEQUENCE FOR AUDIT #12, stated plainly: its concentration item and
//     its pages-to-alignment item are closed with proven-powered metrics. Its
//     calibration item is NOT closed — a calibration number now exists where
//     none did, but no evidence says it can detect the fault it was built for.
//     Whoever picks this up needs a target that is exogenous AND as narrow as
//     a healthy feed; the bot model does not currently carry one.

import { makeBots, simulatePopulation, WORLDS } from "../lib/brain/replay.js";
import { buildFeed } from "../lib/brain/index.js";
import { vecSim, baseSplit, normalizeSplit } from "../lib/brain/bridges.js";
import { tasteVector } from "../lib/brain/index.js";
import { getDiscoverablePool } from "../lib/products.js";
import { gini, topShare, exposureVector, calibrationError, pagesToAlignment } from "../lib/brain/distribution.js";
import { seededShuffle, stdev, singleSplitNoise } from "../lib/brain/noise.js";

const COHORTS = 3, PER_COHORT = 40, PAGES = 4, SEED = 20260806;
const ALIGN_THRESHOLD = 0.45, ALIGN_BUDGET = 3, TOP_K = 24;
const pool = await getDiscoverablePool({ limit: 5000 });
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
};

// ---- the three arms ---------------------------------------------------------
const b = baseSplit();
const scaleDelta = (mult) => {
  const raw = { ...b, delta: b.delta * mult };
  return normalizeSplit(raw) ? raw : null;
};
const ARMS = {
  "loop-free": { ...b, delta: 0 },
  base: null,                       // the shipped split
  concentrator: scaleDelta(3),
};
for (const [name, p] of Object.entries(ARMS)) {
  if (p && !normalizeSplit(p)) throw new Error(`arm ${name} is not a valid split — the measurement would silently fall back to defaults`);
}

/**
 * K cohorts of strangers through ONE world. Each cohort's bots are fresh
 * identities with empty profiles; the world they arrive to is whatever the
 * previous cohorts left behind.
 */
function runArm(policy, world, bots) {
  let carry = null;
  const perCohort = [];
  const coldCurves = [];
  const calErrors = [];
  const profileErrors = [];
  for (let c = 0; c < COHORTS; c++) {
    const cohort = bots.slice(c * PER_COHORT, (c + 1) * PER_COHORT);
    const run = simulatePopulation(cohort, { pool, pages: PAGES, policy, world, carry });
    carry = { popularity: run.popularity, edges: run.edges };
    const exposure = exposureVector(pool, run.popularity);
    perCohort.push({ top: topShare(exposure), gini: gini(exposure) });
    // Rebuild each logged page-state's slate — deterministic, the same call
    // the simulator made — and read calibration and alignment off it.
    for (const session of run.sessions) {
      const bot = cohort.find((x) => x.id === session.botId);
      const curve = [];
      for (const page of session.log) {
        const { items } = buildFeed(
          { ...structuredClone(page.stateSnapshot), splitOverride: policy || undefined, limit: 60 },
          pool
        );
        // Gated metric: against LATENT taste, which the feed cannot train.
        const latentErr = calibrationError(items, bot.expanded);
        if (latentErr !== null) calErrors.push(latentErr);
        // Diagnostic only (amendment 1c): against the learned profile. The
        // feed trains this profile, so an arm can score well here by serving
        // a narrow slice and teaching the reader to want it. Reported because
        // it is the quantity audit #12 named; gates nothing, for that reason.
        const profileErr = calibrationError(items, tasteVector(page.stateSnapshot.profile));
        if (profileErr !== null) profileErrors.push(profileErr);
        curve.push(mean(items.slice(0, TOP_K).map((it) => vecSim(it.tags || {}, bot.expanded))));
      }
      if (c === 0) coldCurves.push(curve); // only the first cohort is cold
    }
  }
  const reached = coldCurves.map((cv) => pagesToAlignment(cv, ALIGN_THRESHOLD));
  return {
    perCohort,
    top: perCohort[perCohort.length - 1].top,
    gini: perCohort[perCohort.length - 1].gini,
    calErr: mean(calErrors),
    profileCalErr: mean(profileErrors),
    // Readers who never reach the threshold are counted at BUDGET + 1 rather
    // than dropped — dropping them would let an arm win by failing everyone
    // except its fastest few.
    pagesToAlign: median(reached.map((r) => (r === null ? ALIGN_BUDGET + 1 : r))),
    neverAligned: reached.filter((r) => r === null).length,
    coldBots: reached.length,
  };
}

function battery(world) {
  const bots = makeBots(COHORTS * PER_COHORT, SEED);
  const arms = {};
  for (const [name, policy] of Object.entries(ARMS)) arms[name] = runArm(policy, world, bots);
  // (r26, audit #26) The floor is RESAMPLED. Each half-cohort has to run its
  // own world here — concentration is a property of a population, not of a
  // subset of one — so this is the expensive estimator in the repo, and the
  // round count is set accordingly and declared: 5 shuffles, not 25.
  const RESAMPLE_ROUNDS = 5;
  const halfShare = (subset) => {
    let carry = null, last = 0;
    const per = Math.max(1, Math.floor(subset.length / COHORTS));
    for (let c = 0; c < COHORTS; c++) {
      const run = simulatePopulation(subset.slice(c * per, (c + 1) * per), { pool, pages: PAGES, world, carry });
      carry = { popularity: run.popularity, edges: run.edges };
      last = topShare(exposureVector(pool, run.popularity));
    }
    return last;
  };
  const diffs = [];
  for (let r = 0; r < RESAMPLE_ROUNDS; r++) {
    const shuffled = seededShuffle(bots, 26 + r * 7919);
    const h = shuffled.length >> 1;
    diffs.push(halfShare(shuffled.slice(0, h)) - halfShare(shuffled.slice(h)));
  }
  // The pre-r26 reading — one fixed even/odd split — kept for the comparison.
  const evens = bots.filter((_, i) => i % 2 === 0), odds = bots.filter((_, i) => i % 2 === 1);
  const oldNoise = Math.abs(halfShare(evens) - halfShare(odds));
  return { arms, noise: stdev(diffs), oldNoise };
}

function report(world) {
  const r1 = battery(world);
  const r2 = battery(world);
  const deterministic = JSON.stringify(r1) === JSON.stringify(r2);
  const { arms, noise, oldNoise } = r1;
  const A = arms["loop-free"], B = arms.base, C = arms.concentrator;

  console.log(`\n=== world: ${world.name} ===`);
  console.log(`cohorts ${COHORTS} x ${PER_COHORT} strangers x ${PAGES} pages, one shared world; resampled sigma ${noise.toFixed(4)} (pre-r26 single draw ${oldNoise.toFixed(4)})`);
  console.log(`                    top-decile   gini  calib(latent)  pages-to-align  never   calib(profile, diagnostic)`);
  for (const [n, a] of Object.entries(arms)) {
    console.log(`  ${n.padEnd(16)} ${a.top.toFixed(4).padStart(8)} ${a.gini.toFixed(4).padStart(7)} ${a.calErr.toFixed(4).padStart(12)} ${String(a.pagesToAlign).padStart(14)} ${String(`${a.neverAligned}/${a.coldBots}`).padStart(7)} ${a.profileCalErr.toFixed(4).padStart(12)}`);
  }
  console.log(`  base drift by cohort: ${B.perCohort.map((c) => c.top.toFixed(4)).join(" -> ")}`);

  const p1 = C.top > A.top + noise;
  const p1Old = C.top > A.top + oldNoise;
  if (p1 !== p1Old) console.log(`  ESTIMATOR CHANGED P1: ${p1Old ? "ok" : "FAIL"} -> ${p1 ? "ok" : "FAIL"}`);
  const p2 = C.calErr > B.calErr + 1e-9;
  const p3 = C.pagesToAlign >= B.pagesToAlign;
  const loopGain = B.top - A.top;
  const h1 = loopGain <= 0.10;
  const steps = B.perCohort.slice(1).map((c, i) => c.top - B.perCohort[i].top);
  const h2 = steps.every((s, i) => i === 0 || s <= Math.max(steps[i - 1], 0) + 1e-9);
  const h3 = B.calErr <= A.calErr + 0.15;
  const h4 = B.pagesToAlign !== null && B.pagesToAlign <= ALIGN_BUDGET;

  console.log(`  P1 metric sees injected loop gain (concentrator > loop-free) : ${p1 ? "ok" : "FAIL"}`);
  console.log(`     (where base sits between them is H1, not a power test)`);
  if (!p1 && C.top > A.top) console.log(`     direction is right (+${(C.top - A.top).toFixed(4)}) but inside the ${noise.toFixed(4)} noise band — UNDERPOWERED at ${COHORTS}x${PER_COHORT}, not a broken metric`);
  console.log(`  P2 calibration detects the concentrator (REPORTED, not gated): ${p2 ? "ok" : "no power"}`);
  if (!p2) console.log(`     latent L1 rewards breadth, so personalization and concentration move it the same way — amendment 2; audit #12's calibration item stays OPEN`);
  console.log(`  P3 concentrator is no faster to align                       : ${p3 ? "ok" : "FAIL"}`);
  console.log(`  H1 loop gain ${loopGain.toFixed(4)} <= 0.10                           : ${h1 ? "ok" : "FAIL"}`);
  console.log(`  H2 drift does not accelerate upward (steps ${steps.map((s) => s.toFixed(4)).join(", ")}) : ${h2 ? "ok" : "FAIL"}`);
  console.log(`  H3 calibration not sacrificed vs loop-free                  : ${h3 ? "ok" : "FAIL"}`);
  console.log(`  H4 cold readers align within ${ALIGN_BUDGET} pages                     : ${h4 ? "ok" : "FAIL"}`);

  const power = p1 && p3; // P2 is reported, never gated — amendment 2
  const health = h1 && h2 && h3 && h4;
  if (!power) console.log(`  !! POWER FAILED — no health number above is admissible.`);
  console.log(`VERDICT (${world.name}): power ${power ? "PASS" : "FAIL"}; health ${health ? "PASS" : "FAIL"}; deterministic ${deterministic}`);
  return power && health && deterministic;
}

const primary = report(WORLDS.flat);
const sensitivity = report(WORLDS.satiating);
console.log(`\nGATE = flat world: ${primary ? "PASS" : "FAIL"} | sensitivity (satiating, reported only): ${sensitivity ? "PASS" : "FAIL"}`);
process.exit(primary ? 0 : 1);
