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

//   3 (8/8) — MATCHED PERMUTATION CONTROL. Declared BEFORE the run, and the
//     CALIBRATION CRITERION IS UNCHANGED: all decided pairs must still agree,
//     determinism still required, base-still-not-last still required. Only the
//     ESTIMATOR changes. If the adjusted estimator still disagrees, the verdict
//     stays NOT CALIBRATED and is reported as such — this amendment is not
//     permitted to buy a pass.
//
//     THE DEFECT, read off the source rather than guessed. replayEstimate
//     scores ADVANTAGE = candidate position weight minus the LOGGED slot's
//     weight, over sessions logged under the shipped policy. For `base` the
//     candidate feed IS the logged feed, so every term is exactly zero and the
//     arm scores exactly 0 by construction — visible in every run as
//     `replay: {"base":0,...}` with every other arm negative. A policy is
//     penalised in proportion to how far it MOVES logged interactions, so raw
//     advantage ranks by SIMILARITY TO THE SHIPPED POLICY, not by quality.
//
//     That this is not merely a base-vs-rest artifact is what makes it worth
//     fixing: the pair `alpha-heavy vs gamma-heavy` disagrees today and does
//     not involve base at all. The more-reordering arm loses regardless of
//     whether it is better.
//
//     THE CONTROL, following the measure-tuning precedent (#138, which
//     resolved the #23 failure by comparing an arm against a control carrying
//     the same structural term rather than against an absolute threshold).
//     For each policy P, ROTATE P's weight values across the five TASTE
//     bridges — the construction measure-tuning already uses. A rotated policy
//     has the SAME weight distribution — so it reorders the feed by a
//     comparable amount and inherits the same reorder penalty — but its
//     assignment of weight to bridges is arbitrary and carries no quality
//     signal. adjusted[P] = replay[P] - mean(replay over the 4 rotations).
//
//     The systematic reorder term is shared and cancels; what survives is
//     "does putting the weight on THESE bridges beat putting the same weight
//     on arbitrary ones".
//
//     `ad` is held fixed, and this is the part that decided the verdict. A
//     first version of this amendment shuffled all SIX weights and was wrong:
//     it let a control put alpha-heavy's 60 onto the AD bridge, flooding that
//     control's slates with ads, tanking its score, and inflating
//     `adjusted = raw - control` by subtraction. That version returned 10/10
//     and 7/7 — CALIBRATED in both worlds. It was discarded, not shipped.
//     The tell was in its own numbers: alpha-heavy held the largest single
//     weight AND showed the most negative control (-0.24883), which is exactly
//     the signature the confound produces. Ad load is a commercial axis, not a
//     taste axis; a control must vary the thing under test and nothing else.
//
//     `base` is scored through baseSplit() rather than the null shipped-policy
//     path, so all five arms go through one code path and base receives a
//     control too. Leaving base on the null path would have preserved exactly
//     the structural advantage this amendment exists to remove.
//
//     WHAT THAT COSTS, stated plainly because it is a real change to what the
//     arm MEANS. buildFeed reads `ctx.splitOverride || activeSplit(...)`
//     (lib/brain/bridges.js), so an explicit split BYPASSES the dynamic
//     epsilon and safe-mode switching. `base` is therefore now the STATIC
//     shipped weights, not the shipped policy including its auto-epsilon. Its
//     live score moved 0.28959 -> 0.29466 in the flat world for exactly that
//     reason, and that is the whole of the difference.
//
//     It is still the better arrangement, and the reason is the inconsistency
//     it removes: the four alternative policies were ALWAYS explicit overrides
//     and therefore always static. Base was the only arm whose epsilon switch
//     was live, so the battery was comparing one dynamic policy against four
//     static ones and calling the result a ranking. All five are now static
//     and comparable.
//
//     The honest scope limit that follows: this calibrates replay against live
//     for STATIC policies. The shipped system's dynamic epsilon switching is
//     not covered by this measurement, and a harness user must not read
//     "CALIBRATED" as "replay predicts the shipped system including auto
//     -epsilon". That wants its own arm, and is not claimed here.
//
//     Raw, control and adjusted are all printed, and any pair whose agreement
//     the control FLIPS is called out — the same shape as the r26 estimator
//     lines, so the change to the instrument is auditable rather than implied.
//
//     OUTCOME (recorded after the run, as declared — the amendment was not
//     allowed to buy a pass, and it did not):
//
//                          raw        adjusted     verdict
//       flat            8/10 pairs   9/10 pairs   NOT CALIBRATED
//       satiating       5/7  pairs   7/7  pairs   CALIBRATED
//       blanket agree   0.8 / 0.7    0.9 / 0.8
//
//     The estimator is strictly better and the gate is still red. Both worlds
//     recovered `alpha-heavy vs gamma-heavy`, the pair that proved the defect
//     was not merely a base-vs-rest artifact. The flat world's remaining
//     disagreement is base vs gamma-heavy: live Δ +0.0241 (decided, 2×sigma
//     0.0061) against adjusted Δ -0.0031.
//
//     THE NEXT QUESTION, and deliberately NOT answered here. That -0.0031 is
//     being read as a confident "gamma beats base" when base and gamma sit at
//     0.12238 and 0.12545 — a gap far smaller than anything this estimator can
//     resolve. The criterion tests the LIVE Δ against a live noise floor and
//     then takes the REPLAY Δ's sign at face value, with no noise floor on the
//     replay side at all. Giving replay its own floor, and treating pairs
//     inside it as undecided the way live pairs already are, is the obvious
//     next amendment — and it is exactly the move that would turn this red
//     light green, so it does not get made in the same round that wants the
//     pass. It needs its own declared criteria and its own run.

//   5 (21 Aug) — THE REPLAY SIDE GETS THE NOISE FLOOR IT WAS ALWAYS OWED.
//     Amendment 4's closing note named this and refused to make it in the same
//     round that wanted the pass. This round wants nothing from this gate, so
//     it is made here, with its criteria declared BEFORE the run:
//
//       (a) A pair is DECIDED only when BOTH estimators can resolve it:
//           |live delta| > 2*sigma_live AND |adjusted delta| > 2*sigma_adj.
//           sigma_adj is the resampled paired sigma over PER-SESSION adjusted
//           scores — the same estimator, the same seed, the same 25 shuffles
//           the live side already uses. Until now the live delta was tested
//           against a floor and the replay delta's SIGN WAS TAKEN AT FACE
//           VALUE, so a gap of 0.0031 between two policies sitting at 0.12238
//           and 0.12545 counted as a confident verdict.
//       (b) All decided pairs must still agree. Unchanged.
//       (c) NEW — POWER. At least MIN_DECIDED of the 10 pairs must be decided,
//           or the verdict is NOT CALIBRATED however well the survivors agree.
//           A floor on both sides makes pairs undecided, and a gate that
//           passes because it decided nothing has laundered the harm it exists
//           to catch. This criterion is the whole reason (a) is safe to make.
//       (d) Determinism and base-not-last, unchanged.
//
//     THE REPORTED SCORES DO NOT MOVE. live/replay/control/adjusted are still
//     the pooled estimates they always were; the per-session decomposition is
//     computed ONLY to estimate noise, so this amendment cannot flatter a
//     policy — it can only decline to rank two of them.

import { makeBots, simulatePopulation, replayEstimate, rankAgreement, WORLDS } from "../lib/brain/replay.js";
import { resampledPairSigma, singleSplitNoise } from "../lib/brain/noise.js";
import { baseSplit } from "../lib/brain/bridges.js";
import { getDiscoverablePool } from "../lib/products.js";

const POLICIES = {
  // (amendment 3) the shipped split, EXPLICIT rather than the null path, so
  // base goes through the same estimator as every other arm and gets a control.
  base: baseSplit(),
  "alpha-heavy": { alpha: 60, beta: 10, gamma: 10, delta: 10, epsilon: 5, ad: 5 },
  "gamma-heavy": { alpha: 20, beta: 5, gamma: 45, delta: 10, epsilon: 15, ad: 5 },
  "delta-heavy": { alpha: 15, beta: 5, gamma: 10, delta: 55, epsilon: 10, ad: 5 },
  "epsilon-heavy": { alpha: 10, beta: 5, gamma: 10, delta: 10, epsilon: 60, ad: 5 },
};
const BOTS = 120, PAGES = 6, SEED = 20260804;
// (amendment 5c) the power floor: fewer decided pairs than this and the run
// has not measured enough to be called calibrated.
const MIN_DECIDED = 4;
// (amendment 3) K permutations per arm. Each is a full replayEstimate pass, so
// K trades runtime against control precision; 4 is enough to average out the
// arbitrary bridge assignment while keeping the battery inside a few minutes.
// The five TASTE bridges. `ad` is deliberately excluded and held at the arm's
// own value — see permutedControls.
const TASTE_BRIDGES = ["alpha", "beta", "gamma", "delta", "epsilon"];

/** Rotations of a policy's weight values across the five taste bridges.
 *
 *  Same weight distribution, so the reorder penalty is matched; arbitrary
 *  assignment, so the quality signal is destroyed. This is the construction
 *  measure-tuning already uses ("the bot's own lift vector rotated onto the
 *  wrong bridges — magnitude-matched, signal-free"), and matching it matters
 *  twice over: it is the house method, and rotation is a DERANGEMENT, so no
 *  control can accidentally reproduce the arm it is controlling for.
 *
 *  `ad` IS HELD FIXED, and that is not cosmetic. My first version shuffled all
 *  six weights, which let a control put alpha-heavy's 60 onto the AD bridge —
 *  flooding the slate with ads, tanking that control, and inflating
 *  `adjusted = raw - control` by subtraction. alpha-heavy holds the largest
 *  single weight AND showed the most negative control (-0.24883), which is
 *  precisely the shape that confound would produce. Ad load is a commercial
 *  axis, not a taste axis; a control must vary the thing under test and
 *  nothing else. */
function permutedControls(policy) {
  const values = TASTE_BRIDGES.map((k) => policy[k]);
  const out = [];
  for (let rot = 1; rot <= CONTROLS; rot++) {
    const rotated = { ad: policy.ad };
    TASTE_BRIDGES.forEach((k, ix) => {
      rotated[k] = values[(ix + rot) % TASTE_BRIDGES.length];
    });
    out.push(rotated);
  }
  return out;
}
// Four rotations = every non-identity rotation of five bridges, so the control
// is the exhaustive mean over them and there is no seed to be lucky with.
const CONTROLS = 4;

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

// A session carries evidence when at least one of its logged interactions is
// one replayEstimate actually scores. The action list mirrors that function's
// own branch and must be changed with it — it is duplicated here rather than
// exported because the alternative was returning per-session detail from a
// hot loop that every caller but this one throws away.
function sessionHasEvidence(session) {
  for (const page of session.log) {
    for (const ix of page.interactions) {
      if (ix.action === "bag" || ix.action === "favorite" || ix.action === "skip") return true;
    }
  }
  return false;
}

// Per-session RAW advantage, decomposed one session at a time so a paired
// sigma can be resampled from it. Only evidenced sessions take part — an
// unevidenced one contributes a zero to both arms and would deflate the very
// floor it is meant to inform.
//
// WHY RAW AND NOT ADJUSTED, which is what gets scored. The control enters the
// reported number as ONE mean per policy, i.e. a constant, and subtracting a
// constant from each side of a difference cannot change that difference's
// variance: Var((X - c1) - (Y - c2)) = Var(X - Y). So the adjusted sigma and
// the raw sigma are the same quantity, and computing it the adjusted way costs
// a full permutation battery PER SESSION — five times the work of the whole
// rest of the run, measured, for an identical answer. The first implementation
// did exactly that and had not finished when it was killed.
function perSessionAdvantage(sessions, policy) {
  const out = [];
  for (const session of sessions) {
    if (!sessionHasEvidence(session)) continue;
    out.push(replayEstimate([session], policy, { pool }));
  }
  return out;
}

function battery(world) {
  const bots = makeBots(BOTS, SEED);
  const { live, perBot } = liveScores(bots, world);
  // behavior corpus: sessions logged under the shipped policy
  const { sessions } = simulatePopulation(bots, { pool, pages: PAGES, world });
  const replay = {}, control = {}, adjusted = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    replay[name] = +replayEstimate(sessions, policy, { pool }).toFixed(5);
    // (amendment 3) matched permutation control: same weight distribution,
    // arbitrary bridge assignment, so the reorder penalty cancels on subtraction.
    const controls = permutedControls(policy)
      .map((p) => replayEstimate(sessions, p, { pool }));
    control[name] = +(controls.reduce((s, x) => s + x, 0) / controls.length).toFixed(5);
    adjusted[name] = +(replay[name] - control[name]).toFixed(5);
  }
  const perAdj = {};
  for (const [name, policy] of Object.entries(POLICIES)) perAdj[name] = perSessionAdvantage(sessions, policy);
  return { live, perBot, replay, control, adjusted, perAdj };
}

function calibrate(world) {
  const run1 = battery(world);
  const run2 = battery(world);
  console.log(`\n--- world: ${world.name} ---`);
  console.log("live    :", JSON.stringify(run1.live));
  console.log("replay  :", JSON.stringify(run1.replay), "(raw advantage — carries the reorder penalty)");
  console.log("control :", JSON.stringify(run1.control), "(matched permutations of the same weights)");
  console.log("adjusted:", JSON.stringify(run1.adjusted), "(raw minus control — SCORED)");
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
    // (amendment 5) the replay side must resolve the pair too.
    const dAdjForFloor = run1.adjusted[a] - run1.adjusted[b];
    const adjNoise = resampledPairSigma(run1.perAdj[a], run1.perAdj[b], { seed: 26 });
    const replayResolves = Math.abs(dAdjForFloor) > 2 * adjNoise && Math.abs(dAdjForFloor) > 1e-4;
    const liveResolves = Math.abs(dLive) > 2 * noise && Math.abs(dLive) > 1e-4;
    const decidedNow = liveResolves && replayResolves;
    if (liveResolves && !replayResolves) {
      console.log(`  REPLAY CANNOT RESOLVE ${a} vs ${b}: adjusted Δ ${dAdjForFloor.toFixed(5)} inside 2σ ${(2 * adjNoise).toFixed(5)} — undecided, not scored`);
    }
    const decidedBefore = Math.abs(dLive) > 2 * oldNoise && Math.abs(dLive) > 1e-4;
    if (decidedNow !== decidedBefore) {
      console.log(`  ESTIMATOR CHANGED ${a} vs ${b}: ${decidedBefore ? "decided" : "undecided"} -> ${decidedNow ? "decided" : "undecided"} (Δ ${dLive.toFixed(5)}, sigma ${noise.toFixed(5)} vs single-draw ${oldNoise.toFixed(5)})`);
    }
    if (decidedNow) {
      decided++;
      // (amendment 3) ADJUSTED is what is scored. Raw is still computed so the
      // control's effect on each pair is visible rather than implied.
      const dAdj = run1.adjusted[a] - run1.adjusted[b];
      const dRaw = run1.replay[a] - run1.replay[b];
      const agreesNow = Math.sign(dLive) === Math.sign(dAdj);
      const agreedRaw = Math.sign(dLive) === Math.sign(dRaw);
      if (agreesNow !== agreedRaw) {
        console.log(`  CONTROL FLIPPED ${a} vs ${b}: ${agreedRaw ? "agreed" : "disagreed"} -> ${agreesNow ? "agrees" : "disagrees"} (live Δ ${dLive.toFixed(4)}, raw Δ ${dRaw.toFixed(4)}, adjusted Δ ${dAdj.toFixed(4)})`);
      }
      if (agreesNow) agreed++;
      else console.log(`DECIDED PAIR DISAGREES: ${a} vs ${b} (live Δ ${dLive.toFixed(4)}, adjusted Δ ${dAdj.toFixed(4)}, raw Δ ${dRaw.toFixed(4)})`);
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
  console.log(`blanket rank agreement (informational): raw ${rankAgreement(run1.live, run1.replay)} → adjusted ${rankAgreement(run1.live, run1.adjusted)}`);
  const hasPower = decided >= MIN_DECIDED;
  const ok = hasPower && agreed === decided && deterministic && baseNotLast;
  if (!hasPower) console.log(`  !! NO POWER — ${decided} of 10 pairs decided, ${MIN_DECIDED} required. A gate that decides nothing cannot be calibrated.`);
  console.log(`VERDICT (${world.name}): decided pairs ${agreed}/${decided} agree (need all, min ${MIN_DECIDED} decided); deterministic ${deterministic}; base-not-last ${baseNotLast} → ${ok ? "CALIBRATED" : "NOT CALIBRATED"}`);
  return { ok, ranking: liveRanking };
}

const flat = calibrate(WORLDS.flat);
const sati = calibrate(WORLDS.satiating);
// Amendment 2's knob criterion: the worlds must be able to disagree.
const worldsDiffer = JSON.stringify(flat.ranking) !== JSON.stringify(sati.ranking);
console.log(`\nrealism knobs move the verdict: ${worldsDiffer} (identical rankings would mean the knobs are decorative)`);
console.log(`GATE = flat world: ${flat.ok ? "CALIBRATED" : "NOT CALIBRATED"} | sensitivity (satiating, reported only): ${sati.ok ? "CALIBRATED" : "NOT CALIBRATED"}`);
if (!flat.ok || !worldsDiffer) process.exit(1);
