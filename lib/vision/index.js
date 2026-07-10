// lib/vision/index.js
// Image understanding contracts: Mood Board Intelligence + Fit Pic Analyzer.
// LIVE today: palette v0 (./palette.js) — real color statistics from pixels,
// mapped into the shared tag space; moodboard uploads train on colors + mood
// + filename words (records marked analyzed_by "palette-v0"). Everything
// deeper (objects, texture, silhouette, garment recognition) still needs a
// provider — those functions return an honest notImplemented() until then.
//
// Design rule (user spec): never promise exact identification. Results carry
// confidence scores and fall back to similar items, never to fake certainty.

import { notImplemented } from "../ai/contract.js";

export { dominantPalette, analyzePalette, mergePalettes } from "./palette.js";

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
