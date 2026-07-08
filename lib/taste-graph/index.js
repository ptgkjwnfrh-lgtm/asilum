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

import { getProfile } from "../db/index.js";
import { tagSimilarity } from "../embeddings/index.js";
import { notImplemented, real } from "../ai/contract.js";

// v0: cosine similarity of two users' long-term taste vectors.
export async function userSimilarity(uidA, uidB) {
  const [a, b] = await Promise.all([getProfile(uidA), getProfile(uidB)]);
  const sim = tagSimilarity(a?.long || a || {}, b?.long || b || {});
  return real({ uidA, uidB, similarity: sim.data }, "v0 profile cosine");
}

// FUTURE: nearest-neighbor users. Needs a user_similarity table (schema-alpha)
// maintained by a background job — scanning all profiles per request is the
// wrong shape at any real scale.
export async function similarUsers(_uid, _limit = 20) {
  return notImplemented("similarUsers", "needs user_similarity table + recalc job");
}

// FUTURE: taste clusters (style communities). Cluster user embeddings, then:
// cold-start = seed a new user from their cluster's centroid; trends =
// engagement velocity within a cluster, not global charts.
export async function tasteClusters() {
  return notImplemented("tasteClusters", "needs taste_clusters table + clustering job");
}

// FUTURE: collaborative-filtering candidates — items rising among a user's
// neighbors, weighted by neighbor similarity and signal strength
// (buy > bag > share > save > favorite > dwell; skips subtract).
export async function crossUserCandidates(_uid, _limit = 48) {
  return notImplemented("crossUserCandidates", "needs similarUsers() + user_events history");
}

// FUTURE: what's gaining traction inside a cluster (brands and items).
export async function risingInCluster(_clusterId) {
  return notImplemented("risingInCluster", "needs taste clusters + event velocity");
}
