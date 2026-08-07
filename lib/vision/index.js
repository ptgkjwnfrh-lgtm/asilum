// lib/vision/index.js
// Image understanding contracts: Mood Board Intelligence + Fit Pic Analyzer.
// LIVE today: palette v0 (./palette.js) — real color statistics from pixels,
// mapped into the shared tag space; moodboard uploads train on colors + mood
// + filename words (records marked analyzed_by "palette-v0"). ALSO LIVE (r27):
// image embedding v0 (./embed.js) — the same pixels as a 50-dim VECTOR whose
// cosine is visual similarity, so two pieces can be compared by how they LOOK
// rather than by the words attached to them. Everything deeper (objects,
// silhouette, garment recognition, "that is a peaked lapel") still needs a
// provider — those functions return an honest notImplemented() until then.
//
// Design rule (user spec): never promise exact identification. Results carry
// confidence scores and fall back to similar items, never to fake certainty.

import { notImplemented } from "../ai/contract.js";
import {
  embedImage as embedImageV0,
  IMAGE_EMBED_VERSION as IMAGE_EMBED_VERSION_V0,
  IMAGE_EMBED_DIM as IMAGE_EMBED_DIM_V0,
} from "./embed.js";

export { dominantPalette, analyzePalette, mergePalettes } from "./palette.js";
export {
  embedImage, imageSim, blockSimilarities, nearestByImage,
  IMAGE_EMBED_DIM, IMAGE_EMBED_VERSION, BLOCK_WEIGHTS,
} from "./embed.js";

export function visionConfigured() {
  return !!(process.env.VISION_PROVIDER && process.env.VISION_API_KEY);
}

// The one shape every future analyzer must return for ANY image — fashion or
// not. Non-fashion images still influence taste through colors/mood/texture/
// era/atmosphere; fashionRelevance says how literally to read the rest.
export function emptyImageAnalysis(imageRef) {
  return {
    imageRef,
    provider: null,            // set by a real adapter
    colors: [],                // hex or lib/fashion-taxonomy COLORS
    palette: [],               // dominant swatches with weights
    mood: [],                  // MOODS with confidence 0..1
    textures: [],              // MATERIALS-ish with confidence
    silhouettes: [],           // SILHOUETTES with confidence
    objects: [],               // detected objects (garments or not)
    styleReferences: [],       // era/scene/designer references
    aestheticTags: [],         // {tag, confidence} in the shared tag space
    fashionRelevance: null,    // 0..1 — null until a model scores it
    confidence: 0,
  };
}

/**
 * THE SEAM a learned model plugs into (r27). Returns a described vector plus
 * the provenance needed to know what produced it — the r18 lesson, where an
 * unstamped vector artifact could not be told apart from a stale one.
 *
 * Deliberately does NOT consult visionConfigured(): v0 works with no key and
 * no network, and a provider is an UPGRADE, not a precondition. Gating it on a
 * key would mean setting one turned working sight OFF until an adapter existed
 * — the shape of failure this codebase spent August removing, where features
 * shipped inert and nothing noticed.
 */
export function imageVector(rgba, width, opts = {}) {
  const vector = embedImageV0(rgba, width, opts);
  return {
    version: IMAGE_EMBED_VERSION_V0,
    dim: IMAGE_EMBED_DIM_V0,
    vector,
    via: "pixel statistics: colour distribution, texture energy, spatial layout",
    limits: "no semantics — cannot name a garment, a silhouette, or a material",
  };
}

// Mood Board Intelligence: analyze any uploaded/saved image.
export async function analyzeImage(imageRef) {
  if (!visionConfigured()) return notImplemented("analyzeImage", "set VISION_PROVIDER/_API_KEY");
  return notImplemented("analyzeImage", "provider adapter not written yet");
}

// Fit Pic Analyzer: detect pieces, then match against the product database.
// Future result shape: { pieces: [{ category, colors, silhouette, material,
// aestheticTags, confidence, exactMatch: item|null, similarItems: [item] }],
// overallConfidence } — exactMatch stays null unless confidence is high;
// similarItems (via embeddings/tag space) are the honest default answer.
export async function analyzeFitPic(imageRef) {
  if (!visionConfigured()) return notImplemented("analyzeFitPic", "set VISION_PROVIDER/_API_KEY");
  return notImplemented("analyzeFitPic", "piece detection + product matching not written yet");
}
