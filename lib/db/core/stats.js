// lib/db/core/stats.js — AGGREGATES FOR THE DASHBOARD.
//
// Four unbounded aggregates and a popularity sort, on a route any visitor can
// reach, all answering the SAME question for every visitor — so the result is
// cached per instance for a few seconds, with the in-flight promise shared so a
// burst collapses to one read. Raw getStats stays exported and uncached because
// tests want the real thing.
//
// Every caller gets its own shallow copy. /api/stats decorates the result by
// assigning onto it, and handing out the cached instance would let one
// request's decorations leak into the next — a cache that edits its own
// contents. What it reports is deliberately unflattering: an edge COUNT is not
// a working graph, so the snapshot carries gamma health beside the total.

import { corroborationEnabled } from "../../brain/edges.js";
import { getPool } from "./pool.js";
import { mem } from "./store.js";

// ---- Aggregates for the stats dashboard ---------------------------------------

// (audit #20) getStats runs four unbounded aggregates plus a popularity sort
// with no caching, on a route any visitor can reach. Measured against live:
// ~30ms of pure database work per call, and every one of those aggregates
// answers the same question for every visitor. Same short-lived per-instance
// snapshot as getDiscoverablePool and getPopularitySnapshot, including the
// in-flight promise so a burst collapses to one read. Raw getStats stays
// exported and uncached — tests want the real thing.
let statsCache = null;
let statsCacheAt = 0;
let statsPromise = null;
const STATS_TTL_MS = 15_000;

// Every caller gets its OWN shallow copy. /api/stats decorates the result
// (alphaEvents, hydrated topItems) by assigning onto it, and handing out the
// cached instance would let one request's decorations leak into the next
// request's response — a cache that quietly changes its own contents.
// Gamma health: an edge COUNT is not a working graph.
//
// The Aug-15 audit found the gamma bridge inert on production — 2,632 edges,
// every one at contributors = 0, so edgeStrength() returned 0 and getEdges
// answered every anchor with nothing. /stats reported "graph edges 2632",
// which reads as a healthy graph and was the only number anyone could see.
//
// `usable` counts edges that score above zero UNDER THE RULE CURRENTLY IN
// FORCE, so the number stays honest whichever way BRAIN_EDGE_CORROBORATION is
// set. Both counts ride along so a reader can see what the other rule would
// give — that is the difference between "the graph is empty" and "the graph is
// full but this rule cannot see it".
function gammaHealth(edges) {
  const corroborated = edges.filter((e) => (e.contributors || 0) > 0).length;
  const weighted = edges.filter((e) => (e.w || 0) > 0).length;
  const corroboration = corroborationEnabled();
  return {
    rule: corroboration ? "corroboration" : "legacy-weight",
    usable: corroboration ? corroborated : weighted,
    corroborated,
    weighted,
    total: edges.length,
  };
}

export async function getStatsSnapshot() {
  if (statsCache && Date.now() - statsCacheAt < STATS_TTL_MS) return { ...statsCache };
  if (!statsPromise) {
    statsPromise = (async () => {
      statsCache = await getStats();
      statsCacheAt = Date.now();
      return statsCache;
    })().finally(() => { statsPromise = null; });
  }
  return { ...(await statsPromise) };
}

export async function getStats() {
  const p = await getPool();
  if (!p) {
    const actions = {};
    for (const i of mem.interactions) actions[i.action] = (actions[i.action] || 0) + 1;
    // Ranked by PEOPLE, not events — otherwise a forged leaderboard stays
    // published on /hotlist after ranking itself is fixed. eng/imp ride along
    // as diagnostics: an eng-to-engagers ratio of 120:1 is an abuse signature.
    const top = Array.from(mem.popularity.entries())
      .map(([id, v]) => ({ id, eng: v.eng, imp: v.imp, engagers: v.engagers || 0, viewers: v.viewers || 0 }))
      .sort((a, b) => b.engagers - a.engagers || b.eng - a.eng)
      .slice(0, 10);
    return {
      persistent: false,
      interactions: mem.interactions.length,
      actions,
      users: mem.profiles.size,
      boards: mem.boards.size,
      edges: mem.edges.size,
      gamma: gammaHealth([...mem.edges.values()].map((edge) => ({
        contributors: edge.contributors || 0, w: edge.w || 0,
      }))),
      topItems: top,
    };
  }
  const [acts, users, boards, edges, top] = await Promise.all([
    p.query("SELECT action, COUNT(*)::int AS n FROM interactions GROUP BY action"),
    p.query("SELECT COUNT(*)::int AS n FROM profiles"),
    p.query("SELECT COUNT(*)::int AS n FROM boards"),
    // One query, three numbers: the count /stats always showed, plus how many
    // edges either rule could actually use (audit 2026-08-15).
    p.query(`SELECT COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE contributors > 0)::int AS corroborated,
               COUNT(*) FILTER (WHERE w > 0)::int AS weighted
             FROM edges`),
    p.query("SELECT item_id, eng, imp, engagers, viewers FROM popularity ORDER BY engagers DESC, eng DESC LIMIT 10"),
  ]);
  const actions = {};
  let total = 0;
  for (const r of acts.rows) { actions[r.action] = r.n; total += r.n; }
  return {
    persistent: true,
    interactions: total,
    actions,
    users: users.rows[0].n,
    boards: boards.rows[0].n,
    edges: edges.rows[0].n,
    gamma: {
      ...gammaHealth([]),
      corroborated: edges.rows[0].corroborated,
      weighted: edges.rows[0].weighted,
      total: edges.rows[0].n,
      usable: corroborationEnabled() ? edges.rows[0].corroborated : edges.rows[0].weighted,
    },
    topItems: top.rows.map((r) => ({ id: r.item_id, eng: Number(r.eng), imp: Number(r.imp), engagers: Number(r.engagers), viewers: Number(r.viewers) })),
  };
}
