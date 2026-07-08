// lib/visual-personalization/index.js
// Pinterest-inspired layer: taste as a VISUAL WORLD, learned from what users
// save, organize, and return to — boards first, clicks second.
//
// LIVE today via the Alpha Learning Bridge: board saves are the strongest
// taste + graph signal (board co-membership edges), and saved items carry
// tag weights. v0 below computes real board-level profiles from those tags.
// FUTURE: image embeddings per pin (lib/vision + lib/embeddings) so
// non-fashion imagery (interiors, album covers, architecture, photography)
// shapes the same profile through color/mood/texture/era.

import { notImplemented, real } from "../ai/contract.js";
import { tagSimilarity } from "../embeddings/index.js";

// v0 board-level taste profile: aggregate tag weights across board items.
// Works on any board shape { items: [{ tags: {TAG: w} }] } (lib/db boards).
export function boardProfile(board) {
  const agg = {};
  let n = 0;
  for (const it of board?.items || []) {
    for (const [t, w] of Object.entries(it.tags || {})) agg[t] = (agg[t] || 0) + w;
    n++;
  }
  for (const t of Object.keys(agg)) agg[t] = +(agg[t] / Math.max(1, n)).toFixed(4);
  return real({ boardId: board?.id || null, items: n, tags: agg }, "v0 tag aggregation");
}

// v0 visual similarity between boards = tag-space cosine of their profiles.
export function boardSimilarity(a, b) {
  return tagSimilarity(boardProfile(a).data.tags, boardProfile(b).data.tags);
}

// FUTURE: fold analyzed pin/image signals (lib/vision results) into a board
// profile — colors, palette, mood, textures join the tag weights.
export function foldImageAnalysis(_boardProfile, _imageAnalysis) {
  return notImplemented("foldImageAnalysis", "needs lib/vision provider first");
}

// FUTURE: Pinterest pin ingestion (real OAuth only — see lib/connectors).
export async function ingestPins(_userId) {
  return notImplemented("ingestPins", "pinterest connector is coming-soon; opt-in only");
}

// FUTURE: aesthetic clustering of a user's boards into distinct "worlds"
// (a user can love brutalist minimalism AND romantic archive at once —
// clusters keep the feed from averaging them into mush).
export function aestheticClusters(_boards) {
  return notImplemented("aestheticClusters", "needs embeddings; batch job in lib/background-jobs");
}
