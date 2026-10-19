// lib/discover/rails.js — cultural Discover rails (handoff Feature D).
// The registry (discover_rails, v16) says WHICH rails exist and in what
// order; the CONTENT of each rail derives at read time from sources that are
// already reviewed and real:
//   screen      — film/tv culture entities (curated + research-approved)
//   soundtrack  — music culture entities
//   trend       — aesthetics the trend authority calls rising/peaking
//                 (lib/asterisk/trends — the ONE lifecycle source)
//   exploration — live products far from the user's taste (vecSim < 0.15,
//                 the same far-reach rule the feed's explorer slots use)
// When Asterisk guidance is active, taste ORDERS screen/soundtrack entities
// (never filters — same doctrine as the query router); rotation is
// deterministic by UTC day, not engagement bait. Per-user collapse/hide
// preferences and the global guidance control are the only writes.

import { CULTURE } from "../asterisk/culture.js";
import { AESTHETIC_TRENDS, aestheticTrend } from "../asterisk/trends.js";
import { getUserStyleProfile } from "../ai/styleProfile.js";
import { getProfile } from "../db/index.js";
import { migrateProfile, tasteVector } from "../brain/index.js";
import { vecSim } from "../brain/bridges.js";
import { applyRecommendationExclusions, getDiscoverablePool, publicProduct } from "../products.js";
import {
  listDiscoverRails, getRailPrefs, getMemoryPreferences, getUserRecommendationExclusions,
} from "../db/production.js";

export const RAIL_KINDS = Object.freeze(["screen", "soundtrack", "trend", "exploration"]);
const ENTITIES_PER_RAIL = 6;
const EXPLORATION_ITEMS = 8;
const FAR_REACH_SIM = 0.15; // the feed's explorer threshold

/** Feature flag: are the cultural Discover rails served? ON unless
 *  `DISCOVER_RAILS_ENABLED=0`. */
export function railsEnabled() {
  return (process.env.DISCOVER_RAILS_ENABLED ?? "1") !== "0";
}

// Deterministic day index (UTC) — rails rotate daily, identically for
// everyone, with no engagement feedback loop.
export function dayIndex(now = new Date()) {
  return Math.floor(now.getTime() / 86_400_000);
}

// The daily stride is a whole WINDOW, not one item: consecutive days show
// disjoint picks whenever the pool holds at least two windows, so small
// pools (trend ~16) don't serve a near-identical rail all week.
function rotate(list, day, take) {
  if (!list.length) return [];
  const window = Math.min(take, list.length);
  const start = (((day * window) % list.length) + list.length) % list.length;
  const out = [];
  for (let i = 0; i < window; i++) {
    out.push(list[(start + i) % list.length]);
  }
  return out;
}

function entityAffinity(rec, profile) {
  if (!profile?.dominantAesthetics?.length) return 0;
  const weights = Object.fromEntries(
    profile.dominantAesthetics.map((d) => [d.tag.toLowerCase(), d.weight]));
  let best = 0;
  for (const interp of rec.interpretations || []) {
    let s = 0;
    for (const t of interp.tags || []) s += weights[t.toLowerCase()] || 0;
    if (s > best) best = s;
  }
  return +best.toFixed(3);
}

function entityCard(rec) {
  return {
    name: rec.name,
    kind: rec.kind,
    note: rec.note || null,
    trend: aestheticTrend(rec.name),
    pills: (rec.interpretations || []).slice(0, 4).map((i) => ({
      id: i.id, label: i.label, tags: i.tags || [],
    })),
  };
}

function cultureRail(kinds, day, profile) {
  const pool = CULTURE.filter((rec) => kinds.includes(rec.kind));
  const picked = rotate(pool, day, ENTITIES_PER_RAIL)
    .map((rec) => ({ ...entityCard(rec), affinity: entityAffinity(rec, profile) }))
    .sort((a, b) => b.affinity - a.affinity);
  return { entities: picked, poolSize: pool.length };
}

function trendRail(day, profile) {
  const live = Object.entries(AESTHETIC_TRENDS)
    .filter(([, t]) => ["rising", "peaking"].includes(t.phase));
  const byName = new Map(CULTURE.map((rec) => [rec.name.toLowerCase(), rec]));
  const cards = live.map(([name, t]) => {
    const rec = byName.get(name);
    return {
      name,
      phase: t.phase,
      note: t.note || null,
      pills: rec ? entityCard(rec).pills : [],
      affinity: rec ? entityAffinity(rec, profile) : 0,
    };
  });
  return { entities: rotate(cards, day, ENTITIES_PER_RAIL), poolSize: live.length };
}

async function explorationRail(userId, day) {
  // A correction is a promise on every PERSONALIZED surface, not just the feed
  // (audit #8). This rail reads the user's taste vector to choose far-reach
  // pieces, so it owes the same filter the feed and the stylist give. Without a
  // user (guidance paused, or anonymous) there is nothing to exclude, and the
  // read is skipped rather than defaulted.
  const pool = userId
    ? applyRecommendationExclusions(
        await getDiscoverablePool(),
        await getUserRecommendationExclusions(userId))
    : await getDiscoverablePool();
  let taste = null;
  if (userId) {
    const profile = migrateProfile(await getProfile(userId).catch(() => ({})));
    const vec = tasteVector(profile);
    if (Object.values(vec).some((w) => w > 0)) taste = vec;
  }
  // With a taste vector: genuinely far pieces. Without one: an honest note —
  // exploration is meaningless before taste exists, so we say so and rotate
  // the whole pool instead of pretending distance.
  const candidates = taste
    ? pool.filter((item) => vecSim(item.tags || {}, taste) < FAR_REACH_SIM)
    : pool;
  const items = rotate(candidates, day, EXPLORATION_ITEMS)
    .map(publicProduct).filter(Boolean);
  return {
    items,
    poolSize: candidates.length,
    basis: taste ? `pieces with taste similarity below ${FAR_REACH_SIM}` : "no taste on file yet — the whole pool rotates",
  };
}

// Assemble every enabled rail from the registry, content resolved live,
// prefs merged when an identity is present.
export async function discoverRails(userId = null, now = new Date()) {
  const [registry, prefs, memoryPreferences] = await Promise.all([
    listDiscoverRails(),
    userId ? getRailPrefs(userId) : Promise.resolve({}),
    userId ? getMemoryPreferences(userId).catch(() => ({ guidanceEnabled: false }))
      : Promise.resolve({ guidanceEnabled: false }),
  ]);
  const guidanceEnabled = !!userId && memoryPreferences.guidanceEnabled !== false;
  const styleProfile = guidanceEnabled
    ? await getUserStyleProfile(userId).catch(() => null) : null;
  const day = dayIndex(now);
  const rails = [];
  for (const rail of registry) {
    if (!rail.enabled) continue;
    const base = {
      id: rail.id, kind: rail.kind, title: rail.title, version: rail.version,
      collapsed: !!prefs[rail.id]?.collapsed, hidden: !!prefs[rail.id]?.hidden,
    };
    if (rail.kind === "screen") rails.push({ ...base, ...cultureRail(["film", "tv"], day, styleProfile) });
    else if (rail.kind === "soundtrack") rails.push({ ...base, ...cultureRail(["music"], day + 1, styleProfile) });
    else if (rail.kind === "trend") rails.push({ ...base, ...trendRail(day, styleProfile) });
    else if (rail.kind === "exploration") {
      rails.push({ ...base, ...(await explorationRail(guidanceEnabled ? userId : null, day)) });
    }
  }
  return {
    rails,
    rotatesDaily: true,
    personalized: !!(styleProfile && styleProfile.dominantAesthetics?.length),
    guidanceEnabled,
  };
}
