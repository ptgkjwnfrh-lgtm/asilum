// lib/recommendations/index.js
// Recommendation service facade — ONE place that names every recommender the
// Alpha Learning Brain will offer, delegating to live Alpha Learning Bridge
// code where it exists and refusing honestly where it doesn't.
// SERVER-ONLY: pulls in lib/brain (catalog must never reach the client).

import { relatedItems } from "../brain/index.js";
import { notImplemented, real } from "../ai/contract.js";

// LIVE — "more like this": co-engagement graph neighbors + tag similarity.
// (The full personalized product feed is live too: /api/feed zones core/
// discovery/reach; that endpoint IS the current productsFromTaste service.)
export function similarProducts(sourceItem, { edges = {}, pool = [], limit = 8 } = {}) {
  return real(relatedItems(sourceItem, { edges, pool, limit }), "Alpha Learning Bridge relatedItems");
}

// LIVE elsewhere — mapped, not reimplemented (no duplicate logic):
//   productsFromMoodboard → /api/feed (board saves already train the profile)
//   productsFromSaved     → /api/feed (save = strong signal + edges)
//   outfitsFromSimilarity → /api/outfits (stylist engine)
//   brandsFromBehavior    → discover FOLLOW + profile Brands tab (v0)
export const LIVE_ROUTES = {
  productsFromTaste: "/api/feed",
  outfits: "/api/outfits",
  related: "/api/related",
  discover: "/api/discover",
};

// FUTURE — contracts awaiting their inputs:
export async function productsFromSimilarUsers(_uid, _limit = 24) {
  return notImplemented("productsFromSimilarUsers", "needs lib/taste-graph.crossUserCandidates");
}
/** DELIBERATELY UNIMPLEMENTED — the contract exists so callers can be written
 *  now, but it returns notImplemented rather than a plausible answer. Needs taste clusters. */
export async function brandsFromCluster(_uid) {
  return notImplemented("brandsFromCluster", "needs taste clusters");
}
/** DELIBERATELY UNIMPLEMENTED — the contract exists so callers can be written
 *  now, but it returns notImplemented rather than a plausible answer. Editorial items need tags in the shared space first. */
export async function editorialFromTaste(_uid) {
  return notImplemented("editorialFromTaste", "editorial items need tags in the shared space first");
}
/** DELIBERATELY UNIMPLEMENTED — the contract exists so callers can be written
 *  now, but it returns notImplemented rather than a plausible answer. Needs lib/vision embeddings. */
export async function rankByVisualSimilarity(_anchorImage, _items) {
  return notImplemented("rankByVisualSimilarity", "needs lib/vision embeddings");
}

// v0 utility ranker for practical axes — real, deliberately simple, and
// separate from taste scoring (the Bridge owns taste; this owns logistics).
export function rankPractical(items = [], { maxPrice = null, size = null } = {}) {
  const scored = items.map((it) => {
    let s = 0;
    if (maxPrice && it.price) s += it.price <= maxPrice ? 1 : -1;
    if (size && it.size) s += String(it.size).toUpperCase() === String(size).toUpperCase() ? 1 : 0;
    if (it.availability === "sold") s -= 2;
    if (it.addedAt) s += Date.now() - it.addedAt < 7 * 864e5 ? 0.5 : 0; // freshness nudge
    return { it, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return real(scored.map((x) => x.it), "v0 practical ranking (price/size/availability/freshness)");
}
