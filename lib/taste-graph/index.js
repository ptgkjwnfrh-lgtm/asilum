// lib/taste-graph/index.js
// TikTok-inspired layer: cross-user feed intelligence. Learn not only from
// one user's actions but from what SIMILAR users save, buy, skip, favorite,
// follow, and search — taste clusters, rising items inside communities.
// Explicit rule (user spec): relevance and discovery only, never
// addiction mechanics. No autoplay loops, no dark-pattern ranking.
//
// LIVE today via the Alpha Learning Bridge: item-item co-engagement edges
// ("users who saved this also saved…" — the gamma bridge) and global
// popularity counters. Those are the first cross-user signals.
// v0 below adds real user-to-user similarity from stored profiles.
// SERVER-ONLY: imports lib/db.

import { getProfile, listProfiles, listEvents } from "../db/index.js";
import { tagSimilarity } from "../embeddings/index.js";
import { notImplemented, real } from "../ai/contract.js";

// v0: cosine similarity of two users' long-term taste vectors.
export async function userSimilarity(uidA, uidB) {
  const [a, b] = await Promise.all([getProfile(uidA), getProfile(uidB)]);
  const sim = tagSimilarity(a?.long || a || {}, b?.long || b || {});
  return real({ uidA, uidB, similarity: sim.data }, "v0 profile cosine");
}

// LIVE (Day 6): nearest-neighbor users, computed on read over stored profiles.
// Honest scale note: this scans up to `scanCap` profiles per call — right for
// a prototype, wrong at real scale; the precomputed user_similarity table +
// recalc job (lib/background-jobs) replaces the scan, not this contract.
// Result reports scanned/scanCap so a partial scan never reads as full.
export async function similarUsers(uid, limit = 10, scanCap = 500) {
  const me = await getProfile(uid);
  const mine = me?.long || me || {};
  if (!Object.keys(mine).length) {
    return real({ uid, neighbors: [], scanned: 0, scanCap,
      note: "no taste profile yet — cold start belongs to taste clusters" }, "profile cosine scan");
  }
  const all = await listProfiles(scanCap);
  const neighbors = [];
  for (const { userId, vec } of all) {
    if (userId === uid) continue;
    const other = vec?.long || vec || {};
    if (!Object.keys(other).length) continue;
    const s = tagSimilarity(mine, other).data;
    if (s > 0) neighbors.push({ uid: userId, similarity: +s.toFixed(4) });
  }
  neighbors.sort((a, b) => b.similarity - a.similarity);
  return real({ uid, neighbors: neighbors.slice(0, limit), scanned: all.length, scanCap },
    "profile cosine scan (compute-on-read)");
}

// FUTURE: taste clusters (style communities). Cluster user embeddings, then:
// cold-start = seed a new user from their cluster's centroid; trends =
// engagement velocity within a cluster, not global charts.
export async function tasteClusters() {
  return notImplemented("tasteClusters", "needs taste_clusters table + clustering job");
}

// LIVE (Day 6): collaborative-filtering candidates — the first READER of the
// canonical event history. Items that taste-neighbors engaged with, weighted
// by signal strength × neighbor similarity; items the user already touched
// are excluded. Negative signals (skip/reject) subtract.
const EVENT_WEIGHT = {
  USER_ADDED_TO_BAG: 2,
  USER_SHARED_ITEM: 1.5,
  USER_ADDED_TO_MOOD_BOARD: 1.3,
  USER_SAVED_ITEM: 1.2,
  USER_FAVORITED_ITEM: 1,
  USER_VIEWED_PRODUCT: 0.2,
  USER_SKIPPED_PRODUCT: -0.5,
  USER_REJECTED_RECOMMENDATION: -1,
};

export async function crossUserCandidates(uid, limit = 24, { neighborCount = 5, eventsPerNeighbor = 100 } = {}) {
  const sims = await similarUsers(uid, neighborCount);
  const neighbors = sims.data.neighbors;
  if (!neighbors.length) {
    return real({ uid, candidates: [], neighbors: 0,
      note: "no taste neighbors yet — needs more users with profiles" }, "cross-user event scoring");
  }
  const seen = new Set(
    (await listEvents(uid, 500)).map((e) => e.payload?.itemId).filter(Boolean)
  );
  const scores = new Map(); // itemId -> { score, from: Set<uid> }
  for (const n of neighbors) {
    for (const evt of await listEvents(n.uid, eventsPerNeighbor)) {
      const itemId = evt.payload?.itemId;
      const w = EVENT_WEIGHT[evt.type];
      // AD FIREWALL (audit #19): sponsored engagement never lifts a neighbor's
      // discovery — it is tagged at write time and excluded here.
      if (!itemId || w === undefined || seen.has(itemId) || evt.payload?.sponsored) continue;
      const cur = scores.get(itemId) || { score: 0, from: new Set() };
      cur.score += w * n.similarity;
      cur.from.add(n.uid);
      scores.set(itemId, cur);
    }
  }
  const candidates = [...scores.entries()]
    .map(([itemId, { score, from }]) => ({ itemId, score: +score.toFixed(4), fromNeighbors: from.size }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return real({ uid, candidates, neighbors: neighbors.length }, "cross-user event scoring (reads user_events)");
}

// FUTURE: what's gaining traction inside a cluster (brands and items).
export async function risingInCluster(_clusterId) {
  return notImplemented("risingInCluster", "needs taste clusters + event velocity");
}
