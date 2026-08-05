// lib/brain/tuning.js — bounded bridge self-tuning (r16).
//
// The six-bridge split stops being a constant: a user whose gamma-sourced
// impressions keep earning bags should see a gamma-heavier core blend. The
// mixer learns; the LAW stays hand-written and declared:
//
//   evidence gates — tuning is INERT (returns null → shipped split) until
//     the user has ≥ MIN_IMPRESSIONS attributed impressions AND
//     ≥ MIN_ENGAGEMENTS attributed engagement events. Cold and anonymous
//     users are byte-identical to today, forever.
//   bounded drift — each bridge's weight is base × lift, lift clamped to
//     [0.5, 1.5]. One page of luck cannot remake the mixer.
//   floors — alpha ≥ 20% and epsilon ≥ 5% of the tuned total, ALWAYS.
//     Alpha is the anti-drift anchor (content match can never be tuned
//     away); epsilon is the anti-bubble guarantee (exploration survives
//     every possible history). Product law, not tunables.
//   monoculture cap — no bridge may exceed 50% of the tuned total.
//   ads never self-amplify — the ad bridge is EXCLUDED from tuning and
//     keeps its base weight no matter what ad engagement looks like.
//   safety modes stay hand-tuned — epsilon-active and safe-mode splits are
//     never touched by tuning (the route only tunes the base state).
//   kill switch — BRAIN_BRIDGE_TUNING=0 restores the shipped split for
//     everyone without a deploy.
//
// Signal: per-bridge LIFT = engagement share ÷ impression share. Shares are
// self-normalizing, so cumulative counters compare cleanly. Engagements are
// action-weighted the way the taste graph already weighs them; skips count
// against. Every number this module produces is explainable in one
// sentence, and explainMix() produces that sentence.

const TUNABLE = ["alpha", "beta", "gamma", "delta", "epsilon"];
const BRIDGES = [...TUNABLE, "ad"];

export const MIN_IMPRESSIONS = 120;  // ~2 pages of attributed serving
export const MIN_ENGAGEMENTS = 8;    // attributed interactions, |weight| summed
const LIFT_MIN = 0.5, LIFT_MAX = 1.5;
const ALPHA_FLOOR = 0.20, EPSILON_FLOOR = 0.05, MONO_CAP = 0.5;

// Action weights mirror the taste-graph hierarchy (bag > share > save > fav >
// dwell; skip negative). Only attributed events count.
const EVENT_ACTION_WEIGHT = {
  USER_BAGGED_ITEM: 2, USER_SHARED_ITEM: 1.5, USER_ADDED_TO_MOOD_BOARD: 1.3,
  USER_SAVED_ITEM: 1.2, USER_FAVORITED_ITEM: 1, USER_DWELLED_ITEM: 0.3,
  USER_SKIPPED_ITEM: -1, USER_HID_ITEM: -1,
};

export function tuningEnabled() {
  return process.env.BRAIN_BRIDGE_TUNING !== "0";
}

/** Aggregate attributed engagement weight per bridge from user_events rows. */
export function bridgeEngagementFromEvents(events = []) {
  const eng = {};
  let evidence = 0;
  for (const ev of events) {
    const bridge = ev?.payload?.bridge;
    if (!bridge || !BRIDGES.includes(bridge)) continue;
    const w = EVENT_ACTION_WEIGHT[ev.type];
    if (!w) continue;
    eng[bridge] = (eng[bridge] || 0) + w;
    evidence += Math.abs(w);
  }
  return { eng, evidence };
}

/**
 * The tuned core split, or null when tuning must not apply (kill switch,
 * missing evidence). `bridgeStats` = profile._meta.bridgeStats impression
 * counters (r14); `engagement` = bridgeEngagementFromEvents output.
 */
export function tunedSplit(bridgeStats = {}, engagement = { eng: {}, evidence: 0 }, base) {
  if (!tuningEnabled() || !base) return null;
  const imp = {};
  let impTotal = 0;
  for (const k of TUNABLE) { imp[k] = Math.max(0, bridgeStats[k] || 0); impTotal += imp[k]; }
  if (impTotal < MIN_IMPRESSIONS || engagement.evidence < MIN_ENGAGEMENTS) return null;

  let engTotal = 0;
  const engPos = {};
  for (const k of TUNABLE) { engPos[k] = Math.max(0, engagement.eng[k] || 0); engTotal += engPos[k]; }
  if (engTotal <= 0) return null;

  // lift = engagement share / impression share, clamped. A bridge with no
  // impressions has no evidence — it keeps lift 1.
  const tuned = {};
  for (const k of TUNABLE) {
    const impShare = imp[k] / impTotal;
    const engShare = engPos[k] / engTotal;
    const lift = impShare > 0 ? Math.min(LIFT_MAX, Math.max(LIFT_MIN, engShare / impShare)) : 1;
    tuned[k] = base[k] * lift;
  }
  tuned.ad = base.ad; // ads never self-amplify

  // Floors and cap as shares of the tuned total, enforced in a fixed order:
  // floors first (raise), then the monoculture cap (lower), then floors
  // re-checked — with these constants the sequence always terminates valid.
  const total = () => BRIDGES.reduce((s, k) => s + tuned[k], 0);
  const raiseTo = (k, share) => { const t = total() - tuned[k]; tuned[k] = (share * t) / (1 - share); };
  if (tuned.alpha / total() < ALPHA_FLOOR) raiseTo("alpha", ALPHA_FLOOR);
  if (tuned.epsilon / total() < EPSILON_FLOOR) raiseTo("epsilon", EPSILON_FLOOR);
  for (const k of TUNABLE) {
    if (tuned[k] / total() > MONO_CAP) {
      const t = total() - tuned[k];
      tuned[k] = (MONO_CAP * t) / (1 - MONO_CAP);
    }
  }
  if (tuned.alpha / total() < ALPHA_FLOOR) raiseTo("alpha", ALPHA_FLOOR);
  if (tuned.epsilon / total() < EPSILON_FLOOR) raiseTo("epsilon", EPSILON_FLOOR);

  for (const k of BRIDGES) tuned[k] = +tuned[k].toFixed(3);
  return tuned;
}

const BRIDGE_WORDS = {
  alpha: "direct taste match", beta: "your strongest signal",
  gamma: "pieces neighbors of your taste engaged with", delta: "what the floor is responding to",
  epsilon: "exploration", ad: "sponsored placement",
};

/** Plain-words mix explanation for /stats. */
export function explainMix(base, tuned) {
  if (!tuned) return { active: false, line: "your mix is the house blend — the brain is still gathering evidence on what you respond to", bridges: [] };
  const bridges = [];
  const baseTotal = Object.values(base).reduce((s, v) => s + v, 0);
  const tunedTotal = Object.values(tuned).reduce((s, v) => s + v, 0);
  for (const k of BRIDGES) {
    const b = base[k] / baseTotal, t = tuned[k] / tunedTotal;
    const delta = t - b;
    bridges.push({
      bridge: k, share: +t.toFixed(3), baseShare: +b.toFixed(3),
      direction: k === "ad" ? "fixed" : Math.abs(delta) < 0.01 ? "held" : delta > 0 ? "boosted" : "reduced",
    });
  }
  const boosted = bridges.filter((x) => x.direction === "boosted").map((x) => BRIDGE_WORDS[x.bridge]);
  const line = boosted.length
    ? `your feed leans toward ${boosted.join(" and ")} — that's what you respond to`
    : "your responses currently match the house blend";
  return { active: true, line, bridges };
}
