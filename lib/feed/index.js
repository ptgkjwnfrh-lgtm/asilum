// lib/feed/index.js
// Feed system foundation. The LIVE product feed is /api/feed (Alpha Learning
// Bridge): zoned core/discovery/reach, seen-item rotation, 2-per-brand cap,
// skip-fatigue exploration. This module names where that feed grows into a
// MIXED feed (products + editorials + brands + boards + culture) without
// touching the live one. Discovery, not addiction: rotation and caps are
// design principles here, not engagement-maximization knobs.

import { notImplemented } from "../ai/contract.js";

export const FEED_SOURCES = [
  "product", "editorial", "brand", "outfit", "moodboard",
  "similar-item", "rising-designer", "archive-reference", "culture-link",
];

// Ranking factor registry — the future composed score, one weight per signal.
// Weights are STARTING POINTS for tuning, not learned values (honest note).
export const RANKING_FACTORS = {
  visualTaste: 0.25,        // profile ⟷ item tag/visual similarity
  savedItems: 0.15,         // proximity to saves/boards (edges)
  moodboard: 0.15,          // board-level profiles (visual-personalization)
  similarUsers: 0.15,       // cross-user candidates (taste-graph)
  followedBrands: 0.08,
  purchaseBehavior: 0.07,
  freshness: 0.05,
  priceRelevance: 0.04,
  sizeAvailability: 0.03,
  editorialRelevance: 0.02,
  clusterTrends: 0.01,
};

// FUTURE: compose the mixed feed. Contract: pull candidates per source,
// score with RANKING_FACTORS (taste axes via the Bridge, logistics via
// lib/recommendations.rankPractical), interleave with slot policy like the
// live zoning (keep explorer slots — always-on exploration is load-bearing).
export async function composeMixedFeed(_uid, _opts = {}) {
  return notImplemented("composeMixedFeed",
    "products live at /api/feed; mixed sources need editorial/brand/board candidates first");
}
