// lib/brain/replay.js — offline replay harness (r15, bot world r22).
//
// Purpose: evaluate candidate bridge-weight policies WITHOUT serving them to
// anyone. Two evaluation modes over the same deterministic simulated world:
//
//   live(policy)    — bots actually browse feeds built under the policy;
//                     their satisfaction is ground truth in the sim world.
//   replay(policy)  — bots' LOGGED sessions (recorded under the behavior
//                     policy) are held fixed; at each logged page-state the
//                     candidate feed is rebuilt and the logged outcomes are
//                     scored by where the candidate slate would have put
//                     them (rank-weighted, absent = 0). Counterfactual
//                     estimation, no new behavior invented.
//
// r15's calibration claim: replay's RANKING of policies must agree with
// live's ranking. Once that holds, r16 can search policy space offline.
//
// Determinism law: no Math.random / Date.now — a seeded PRNG (mulberry32)
// and caller-supplied seeds; identical inputs give identical outputs across
// processes. Bots judge by AFFINITY-EXPANDED latent taste (the stress-
// harness doctrine, tests/stress_test.py) — never raw persona match.
//
// ---------------------------------------------------------------------------
// r22 (Aug 6) — THE BOT WORLD IS SHARED, AND THE READER IS NOT A ROBOT.
//
// Two defects, both of the instrument rather than the product, both found by
// measurement rather than by reading:
//
// (1) SHARED POPULATION. Every bot used to browse a PRIVATE world: its own
//     `popularity` map, its own `edges` graph. After #123 made the counters
//     count distinct PEOPLE, that private world could never produce a second
//     person — every item sat at viewers = 1, engagers ∈ {0,1}, and the delta
//     bridge collapsed to exactly two distinct scores across the whole pool.
//     A two-valued bridge carries no ranking signal, which is why the r16
//     replay cross-check reads noise on delta and why measure-tuning FAILs at
//     head against the production database. The bots now browse ONE world:
//     shared popularity counters and one shared co-engagement graph, exactly
//     as prod has one `items` table and one `edges` table. Profiles stay
//     per-bot, because people do not share those.
//
//     A second fidelity break came with it: the old simulator handed buildFeed
//     the WHOLE edge map. Prod hands it `getEdges(profile._meta.recent)` — the
//     neighborhood of the reader's own recent engagements. Private worlds hid
//     the difference (a bot's map only ever held the bot's own edges); a shared
//     world would have let gamma read the entire crowd's graph regardless of
//     who was reading. The simulator now mirrors the route.
//
// (2) BEHAVIORAL REALISM (audit #10). Within the examined window the old bot
//     was position-flat, never left, never tired of anything, and could not
//     see a price. Worse, the declared satisfaction metric rewarded only
//     immediate affinity, so no verdict this harness ever produced COULD
//     credit satiation-avoidance, retention, or far-reach exploration —
//     exploration-heavy policies were structurally last before a single
//     number was computed. Four declared knobs now model the reader:
//     attention decay, dropout hazard, satiation, price sensitivity.
//
// Two named worlds, so nothing is silently invalidated:
//   WORLDS.flat       — all four knobs off. Identical bot behavior to the
//                       pre-r22 harness; the satisfaction formula reduces
//                       ALGEBRAICALLY to the old one (see `satisfaction`
//                       below). Differences from historical numbers are
//                       therefore attributable to the shared world alone.
//   WORLDS.satiating  — all four knobs on. The declared sensitivity arm.
// Every battery reports both. Neither is "the" world; a result that holds in
// one and not the other is a result about the world, and says so.
// ---------------------------------------------------------------------------

import { buildFeed, learn, markSeen, migrateProfile } from "./index.js";
import { TAGS, expandTaste } from "./tags.js";
import { vecSim, baseSplit } from "./bridges.js";
import { tunedSplit } from "./tuning.js";

// ---- deterministic PRNG -----------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- bot model --------------------------------------------------------------
// Latent taste: two anchor tags; judgment happens against the one-hop
// affinity expansion. Thresholds are fixed and declared; the seeded jitter
// only breaks ties so bots aren't clones.
const POS_T = 0.55;   // affinity ≥ → favorite
const BAG_T = 0.75;   // affinity ≥ → bag (strongest signal)
const NEG_T = 0.2;    // affinity < → fast skip
const SLOTS_VIEWED = 24; // the window a bot's eyes travel over each page

/**
 * Declared realism constants (r22). Values are stated here, before any run,
 * so that a battery cannot be made to pass by moving one of them afterwards.
 * Catalog price distribution at the time of declaration: min 110, p25 335,
 * median 605, p75 1015, max 2655.
 */
export const REALISM = Object.freeze({
  // Attention: the probability a bot's eye actually lands on slot i inside
  // the window. Exponential falloff to a floor — nobody reads slot 23 as
  // carefully as slot 0, and nobody's attention reaches exactly zero.
  ATTENTION_TAU: 12,
  ATTENTION_FLOOR: 0.25,
  // Dropout: per-page hazard of ending the session. Frustration (fast skips)
  // raises it; satisfaction (positives) lowers it.
  DROPOUT_BASE: 0.04,
  DROPOUT_PER_SKIP: 0.06,
  DROPOUT_PER_POSITIVE: 0.03,
  DROPOUT_MAX: 0.6,
  // Satiation: engaging with an aesthetic discounts the NEXT thing in it.
  // Accumulates per dominant tag, decays between pages.
  // CALIBRATED, not guessed — see the calibration record below.
  SAT_RATE: 0.06,
  SAT_DECAY: 0.4,
  // Price: above a bot's budget an item reads as aspiration, not purchase —
  // discounted, never zeroed (people still favorite what they can't buy).
  PRICE_FLOOR: 0.35,
  BUDGET_LO: 250,
  BUDGET_HI: 1600,
});

export const WORLDS = Object.freeze({
  flat: Object.freeze({ name: "flat", attention: false, dropout: false, satiation: false, price: false }),
  satiating: Object.freeze({ name: "satiating", attention: true, dropout: true, satiation: true, price: true }),
});

/**
 * A world may override any REALISM strength (`satRate`, `attentionTau`, …).
 * Two uses, both deliberate:
 *   · CALIBRATION — the satiating arm's strengths were chosen against the
 *     declared measurability floor W3 (below) by sweeping this override, so
 *     the frozen constants in REALISM were never edited to chase a verdict.
 *   · MUTANT PROOF — a battery can hand a knob a wrong strength and assert
 *     that the assertions actually fail.
 * The frozen REALISM value is the default for every strength, so a plain
 * WORLDS.satiating is fully specified by the declaration above it.
 *
 * WORLD CALIBRATION CRITERIA (declared 8/6, before any battery was re-run):
 *   W1 flat world reproduces pre-r22 bot behavior exactly — every knob factor
 *      is 1, nothing drops out, and the satisfaction formula reduces
 *      algebraically to (affinitySum − 0.2·fastSkips)/viewed.
 *   W2 the shared world dissolves the delta degeneracy: ≥ 50 distinct delta
 *      scores over the pool, against exactly 2 in a private world.
 *   W3 the satiating world stays MEASURABLE — mean pages browsed ≥ 0.6·PAGES
 *      and mean engagers ≥ 3 over touched items. A sensitivity arm so sparse
 *      that nothing accumulates would replace one degenerate instrument with
 *      another, and rank policies by noise just as the private world did.
 *   W4 both worlds deterministic run-to-run.
 *
 * CALIBRATION RECORD (8/6, run BEFORE any policy battery was re-run; the
 * sweep reads W2/W3 only and never looks at a tuning verdict):
 *   The first-guess satiation strengths (SAT_RATE 0.25, SAT_DECAY 0.6) FAILED
 *   W3 — mean engagers 1.32 over touched items, because a discount that steep
 *   pushes almost everything under the favorite threshold and the world stops
 *   accumulating. A 16-point grid over satRate ∈ {0.25, 0.15, 0.10, 0.06} ×
 *   satDecay ∈ {0.6, 0.4} × dropoutPerSkip ∈ {0.06, 0.03} was swept:
 *     · W2 held at EVERY point (63–97 distinct delta scores vs 2 private).
 *     · W3 held at exactly two points, both at satRate 0.06, satDecay 0.4.
 *   Of those two, the one keeping dropoutPerSkip at its originally declared
 *   0.06 was taken. The looser 0.03 bought more signal (engagers 3.25, 31
 *   dropouts) but weakening a second knob past the floor to buy margin is how
 *   an instrument gets quietly tuned toward the answer it likes; the floor is
 *   a floor, not a target. Frozen values: SAT_RATE 0.06, SAT_DECAY 0.4,
 *   everything else as first declared.
 */
const strength = (world, key, fallbackKey) =>
  world && world[key] !== undefined ? world[key] : REALISM[fallbackKey];

export function makeBots(n, seed) {
  const rnd = mulberry32(seed);
  const bots = [];
  for (let i = 0; i < n; i++) {
    const t1 = TAGS[Math.floor(rnd() * TAGS.length)];
    let t2 = TAGS[Math.floor(rnd() * TAGS.length)];
    if (t2 === t1) t2 = TAGS[(TAGS.indexOf(t1) + 3) % TAGS.length];
    const latent = { [t1]: 0.9, [t2]: 0.6 };
    const jitterSeed = Math.floor(rnd() * 1e9);
    // Budget is derived from the bot's own seed rather than drawn from `rnd`,
    // so adding price sensitivity does NOT shift the taste draws of every
    // later bot. Same seed ⇒ same population as before r22.
    const bRnd = mulberry32((jitterSeed ^ 0x9e3779b9) >>> 0);
    const budget = REALISM.BUDGET_LO + bRnd() * (REALISM.BUDGET_HI - REALISM.BUDGET_LO);
    bots.push({ id: `bot-${i}`, latent, expanded: expandTaste(latent), jitterSeed, budget });
  }
  return bots;
}

/** The tag an item most strongly is. Ties break on tag name, for determinism. */
export function dominantTag(item) {
  const entries = Object.entries(item.tags || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return entries[0][0];
}

/** P(the eye lands on this slot). Flat world: 1 everywhere inside the window. */
export function attentionAt(slot, world) {
  if (!world.attention) return 1;
  const f = strength(world, "attentionFloor", "ATTENTION_FLOOR");
  const tau = strength(world, "attentionTau", "ATTENTION_TAU");
  return f + (1 - f) * Math.exp(-slot / tau);
}

/** Price appetite: 1 at or under budget, decaying to a floor above it. */
export function priceFactor(bot, item, world) {
  if (!world.price) return 1;
  const price = Number(item.price) || 0;
  if (!price || !bot.budget || price <= bot.budget) return 1;
  return Math.max(strength(world, "priceFloor", "PRICE_FLOOR"), bot.budget / price);
}

/** Discount for having just engaged with this aesthetic. */
export function satiationFactor(sat, tag, world) {
  if (!world.satiation || !tag) return 1;
  return 1 / (1 + strength(world, "satRate", "SAT_RATE") * (sat[tag] || 0));
}

function judge(bot, item, rnd, world, sat) {
  const raw = vecSim(item.tags || {}, bot.expanded);
  // Effective affinity is what the reader actually feels in the moment:
  // latent taste, discounted by what they can afford and by how much of this
  // aesthetic they have just consumed. In the flat world both factors are 1
  // and `affinity === raw`, so the pre-r22 judgment is preserved exactly.
  const affinity = raw * priceFactor(bot, item, world) * satiationFactor(sat, dominantTag(item), world);
  const jitter = (rnd() - 0.5) * 0.06;
  const aj = affinity + jitter;
  if (aj >= BAG_T) return { action: "bag", affinity, rawAffinity: raw, dwellMs: 4000 };
  if (aj >= POS_T) return { action: "favorite", affinity, rawAffinity: raw, dwellMs: 2500 };
  if (aj < NEG_T) return { action: "skip", affinity, rawAffinity: raw, dwellMs: 600 };
  return null; // considered pass — no event
}

// ---- shared world bookkeeping (mirrors the interaction pipeline) ------------
// Counters and edge rows are COPY-ON-WRITE: a bump replaces the object rather
// than mutating it. That is what makes a page-state snapshot a shallow copy of
// the top-level map (cheap) while still being a true frozen view of the world
// at that page (exact). Without it, a shared world would either cost a deep
// clone per bot-page or hand replay a state that keeps changing underneath it.
function bumpPopularity(pop, id, d) {
  const c = pop[id] || { eng: 0, imp: 0, engagers: 0, viewers: 0 };
  pop[id] = {
    eng: c.eng + (d.eng || 0),
    imp: c.imp + (d.imp || 0),
    engagers: c.engagers + (d.engagers || 0),
    viewers: c.viewers + (d.viewers || 0),
  };
}

function bumpEdges(edges, recentPositives, itemId) {
  for (const prev of recentPositives.slice(0, 5)) {
    if (prev === itemId) continue;
    const rowPrev = edges[prev] ? { ...edges[prev] } : {};
    rowPrev[itemId] = (rowPrev[itemId] || 0) + 1;
    edges[prev] = rowPrev;
    const rowItem = edges[itemId] ? { ...edges[itemId] } : {};
    rowItem[prev] = (rowItem[prev] || 0) + 1;
    edges[itemId] = rowItem;
  }
}

/**
 * The graph slice prod actually hands the feed: `getEdges(profile._meta.recent)`
 * — the co-engagement neighborhood of THIS reader's recent engagements, not
 * the whole crowd's graph.
 */
function edgesFor(edges, recent) {
  const out = {};
  for (const id of recent || []) if (edges[id]) out[id] = edges[id];
  return out;
}

const SIM_ACTION_W = { bag: 2, favorite: 1, skip: -1 };

/**
 * A POPULATION of bots browses `pages` pages of ONE shared world under
 * `policy` (null = the shipped split). Bots take their pages in turn — bot i's
 * page p sees everything the crowd did on pages < p plus what bots < i did on
 * page p — which is how a real feed accumulates evidence and is why items here
 * reach viewers/engagers counts above one.
 *
 * Each session log records, per page, the state SNAPSHOT needed to rebuild that
 * page-state feed — which is what makes counterfactual replay exact rather than
 * approximate.
 *
 * `carry` threads an EXISTING world through a second cohort instead of
 * starting a fresh one: cohort 2 arrives to a feed the first cohort already
 * shaped. That is the only way to observe rich-get-richer drift, which by
 * definition needs serve → engage → RE-serve across people who never met.
 * Pass the `{ popularity, edges }` a previous call returned.
 *
 * Returns { sessions, popularity, edges, world }.
 */
export function simulatePopulation(bots, { pool, pages = 6, limit = 60, tune = false, policy = null, world = WORLDS.flat, carry = null } = {}) {
  const popularity = carry?.popularity || {};
  const edges = carry?.edges || {};
  const window = Math.min(SLOTS_VIEWED, limit);
  const attentionBudget = pages * window;

  const states = bots.map((bot) => ({
    bot,
    rnd: mulberry32(bot.jitterSeed),
    profile: { long: {}, session: {}, _meta: {} },
    // The counters count PEOPLE. One bot is one identity, so seeing the same
    // item on twelve pages must leave viewers at 1 — these sets are what make
    // this simulator implement the same counting rule as the route (#123).
    seenOnce: new Set(),
    engagedOnce: new Set(),
    recentPositives: [],
    sat: {},
    log: [],
    positives: 0, fastSkips: 0, affinitySum: 0, viewed: 0, pagesBrowsed: 0,
    // (r16) dynamic-tuning arm: accumulate the same evidence prod accumulates
    // (whole-page bridge impressions + action-weighted engagements) and let
    // the NEXT page's blend drift through the real tunedSplit — floors, caps,
    // and evidence gates all included.
    botImp: {},
    botEng: { eng: {}, evidence: 0 },
    active: true,
    dropped: false,
  }));

  for (let page = 0; page < pages; page++) {
    for (const st of states) {
      if (!st.active) continue;
      const { bot, rnd } = st;
      const tuned = tune ? tunedSplit(st.botImp, st.botEng, baseSplit()) : null;
      const recent = (migrateProfile(st.profile)._meta || {}).recent || [];
      // The snapshot IS the state handed to buildFeed — identical object, so a
      // replay of the behavior policy reproduces the logged slate exactly.
      const stateSnapshot = {
        profile: structuredClone(st.profile),
        edges: edgesFor(edges, recent),
        popularity: { ...popularity },
      };
      const { items } = buildFeed(
        { ...stateSnapshot, splitOverride: policy || undefined, tunedSplit: tuned || undefined, limit },
        pool
      );
      // Impressions and zone composition are always recorded — the replay and
      // invariant arms need real evidence, not reconstructions.
      const zones = { core: 0, discovery: 0, reach: 0 };
      const brandCount = {};
      const discoveryPositions = [];
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        if (it._bridge) st.botImp[it._bridge] = (st.botImp[it._bridge] || 0) + 1;
        zones[it._zone] = (zones[it._zone] || 0) + 1;
        brandCount[it.brand || ""] = (brandCount[it.brand || ""] || 0) + 1;
        if (it._zone === "discovery") discoveryPositions.push(idx);
      }
      const structure = {
        brandMax: Math.max(0, ...Object.values(brandCount)),
        reach: zones.reach,
        discoveryPositions,
      };
      const interactions = [];
      let pagePositives = 0, pageSkips = 0, examined = 0;
      for (let slot = 0; slot < Math.min(window, items.length); slot++) {
        // Attention decay: the eye does not land on every slot in the window.
        // A slot that was never examined leaves no impression — the same rule
        // the r19 route fix put on the live harness (/api/impressions carries
        // the EXAMINED ids, not the served ones).
        if (rnd() >= attentionAt(slot, world)) continue;
        const it = items[slot];
        examined++;
        bumpPopularity(popularity, it.id, { imp: 1 });      // diagnostic: raw exposures
        if (!st.seenOnce.has(it.id)) { st.seenOnce.add(it.id); bumpPopularity(popularity, it.id, { viewers: 1 }); }
        st.viewed++;
        const verdict = judge(bot, it, rnd, world, st.sat);
        if (!verdict) continue;
        interactions.push({ itemId: it.id, action: verdict.action, affinity: verdict.affinity, rawAffinity: verdict.rawAffinity, bridge: it._bridge || null, slot });
        if (tune && it._bridge) {
          const w = SIM_ACTION_W[verdict.action] || 0;
          if (w) { st.botEng.eng[it._bridge] = (st.botEng.eng[it._bridge] || 0) + w; st.botEng.evidence += Math.abs(w); }
        }
        st.profile = learn(st.profile, it, verdict.action, { dwellMs: verdict.dwellMs });
        if (verdict.action === "bag" || verdict.action === "favorite") {
          st.positives++; pagePositives++; st.affinitySum += verdict.affinity;
          bumpPopularity(popularity, it.id, { eng: 1 });    // diagnostic: raw engagements
          if (!st.engagedOnce.has(it.id)) { st.engagedOnce.add(it.id); bumpPopularity(popularity, it.id, { engagers: 1 }); }
          bumpEdges(edges, st.recentPositives, it.id);
          st.recentPositives.unshift(it.id);
          const dom = dominantTag(it);
          if (dom) st.sat[dom] = (st.sat[dom] || 0) + 1;
        } else if (verdict.action === "skip") {
          st.fastSkips++; pageSkips++;
        }
      }
      st.profile = markSeen(st.profile, items.map((it) => it.id));
      st.log.push({ stateSnapshot, interactions, zones, structure, examined });
      st.pagesBrowsed++;
      // Satiation fades between pages.
      if (world.satiation) {
        const decay = strength(world, "satDecay", "SAT_DECAY");
        for (const k of Object.keys(st.sat)) st.sat[k] *= decay;
      }
      // Dropout hazard: a page that frustrated the reader can end the session.
      if (world.dropout) {
        const hazard = Math.min(
          strength(world, "dropoutMax", "DROPOUT_MAX"),
          Math.max(0, strength(world, "dropoutBase", "DROPOUT_BASE")
            + strength(world, "dropoutPerSkip", "DROPOUT_PER_SKIP") * pageSkips
            - strength(world, "dropoutPerPositive", "DROPOUT_PER_POSITIVE") * pagePositives)
        );
        if (rnd() < hazard) { st.active = false; st.dropped = true; }
      }
    }
  }

  // Declared satisfaction metric (r22). Engaged affinity is EFFECTIVE affinity
  // — already discounted by satiation and price — minus the skip penalty, over
  // the attention the bot BROUGHT to the session rather than the attention it
  // spent. Both changes exist so the metric can express what the knobs create:
  //   · satiation-discounted affinity ⇒ a feed that serves one aesthetic over
  //     and over earns less than a feed that moves, so exploration can win.
  //   · a fixed denominator ⇒ a session that ends early (dropout) or is
  //     skimmed (attention decay) scores lower, so retention is credited.
  // In the flat world nothing drops out, nothing is skipped, and both factors
  // are 1, so viewed === pages × window and this reduces EXACTLY to the
  // pre-r22 formula (affinitySum − 0.2·fastSkips) / viewed.
  const sessions = states.map((st) => ({
    botId: st.bot.id,
    log: st.log,
    satisfaction: attentionBudget ? (st.affinitySum - 0.2 * st.fastSkips) / attentionBudget : 0,
    positives: st.positives,
    fastSkips: st.fastSkips,
    viewed: st.viewed,
    pagesBrowsed: st.pagesBrowsed,
    dropped: st.dropped,
    attentionBudget,
    bridgeImpressions: st.botImp,
    // The shared world's counters, returned so a battery can assert the
    // counting RULE this simulator implements — an unasserted third
    // implementation is how a round measures its own pre-fix behaviour and
    // passes.
    popularity,
  }));
  return { sessions, popularity, edges, world };
}

/**
 * One bot, one world. Kept as the r15 entry point; a population of one is
 * still a shared world, so the per-person counting rule (viewers = 1 no matter
 * how many pages) remains directly assertable through this signature.
 */
export function simulateSession(bot, policy, opts = {}) {
  return simulatePopulation([bot], { ...opts, policy }).sessions[0];
}

const positionWeight = (rank, limit) => (rank < 0 || rank >= limit ? 0 : 1 - rank / limit);

/**
 * Counterfactual replay: score `policy` against sessions LOGGED under the
 * behavior policy — ADVANTAGE form (amendment 1, measured 8/4): each logged
 * interaction contributes the DIFFERENCE between the candidate slate's
 * position weight for that item and the behavior slate's (the logged slot).
 * Raw position-weight scoring biased toward the behavior policy (its slates
 * cover its own outcomes perfectly); the shared term cancels in the
 * difference. The behavior policy itself scores ~0 by construction;
 * candidates score relative to it. Nothing about behavior is re-invented.
 */
export function replayEstimate(sessions, policy, { pool, limit = 60 } = {}) {
  let score = 0, n = 0;
  for (const session of sessions) {
    for (const pageLog of session.log) {
      const { items } = buildFeed({ ...structuredClone(pageLog.stateSnapshot), splitOverride: policy || undefined, limit }, pool);
      const rankOf = new Map(items.map((it, i) => [it.id, i]));
      for (const ix of pageLog.interactions) {
        const wCand = positionWeight(rankOf.has(ix.itemId) ? rankOf.get(ix.itemId) : -1, limit);
        const wBehavior = positionWeight(ix.slot, limit);
        const adv = wCand - wBehavior;
        if (ix.action === "bag" || ix.action === "favorite") { score += adv * ix.affinity; n++; }
        else if (ix.action === "skip") { score -= 0.2 * adv; n++; }
      }
    }
  }
  return n ? score / n : 0;
}

/** Rank agreement between two policy→score maps: pairwise order matches. */
export function rankAgreement(a, b) {
  const names = Object.keys(a);
  let agree = 0, pairs = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    pairs++;
    const da = Math.sign(a[names[i]] - a[names[j]]);
    const db = Math.sign(b[names[i]] - b[names[j]]);
    if (da === db) agree++;
  }
  return pairs ? agree / pairs : 1;
}
