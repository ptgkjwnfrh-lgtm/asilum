// lib/ai/moodBoardAnalyzer.js
// Mood Board intelligence service. Server-only.
// Route: model if enabled (through the adapter) → local rules otherwise.
// Every pass is persisted to mood_board_analysis with its true source, so
// items can be RE-analyzed when a real model arrives.

import { runModel } from "./adapter.js";
import { interpretMoodBoardItem } from "./localFashionInterpreter.js";
import { validateMoodBoardAnalysisOutput } from "./validate.js";
import { PROMPT_VERSION_MOOD_BOARD_ANALYSIS_V1 } from "./promptVersions.js";
import {
  createMoodBoardAnalysis, listMoodBoardUploads, listMoodBoardAnalyses,
} from "../db/production.js";

// Analysis output → typed tag rows (the house {tag, tag_type, confidence} shape).
const TYPE_OF = {
  aestheticTags: "aesthetic", moodTags: "mood", colorTags: "color",
  silhouetteTags: "silhouette", fabricTags: "fabric",
  designerReferences: "designer-ref", eraTags: "era",
};
export function analysisToTagRows(a) {
  const rows = [];
  for (const [k, type] of Object.entries(TYPE_OF)) {
    for (const tag of a[k] || []) rows.push({ tag, tag_type: type, confidence: a.confidenceScore || 0 });
  }
  return rows;
}

// Manual tags always win: they keep confidence 1 and survive dedupe.
export function mergeManualAndAiTags(manualTags = [], aiTagRows = []) {
  const rows = manualTags.map((t) => ({ tag: String(t).toLowerCase(), tag_type: "manual", confidence: 1 }));
  const seen = new Set(rows.map((r) => r.tag));
  for (const r of aiTagRows) if (!seen.has(r.tag)) { seen.add(r.tag); rows.push(r); }
  return rows.slice(0, 40);
}

/**
 * Analyze one upload (record object or by scanning the user's uploads for id).
 * NEVER throws — failures come back as a failed analysis record.
 */
export async function analyzeMoodBoardItem(upload, { userId, allowExternalAi = false } = {}) {
  const item = upload && typeof upload === "object" ? upload : null;
  if (!item || !item.userId) {
    return { ok: false, error: "mood board item required" };
  }
  const input = {
    caption: item.caption || "",
    userNotes: item.userNotes || "",
    manualTags: (item.tags || []).filter((t) => t.tag_type === "manual" || t.tag_type === "personalization").map((t) => t.tag),
    palette: (item.colors || []).map((s) => ({ hex: s.hex, weight: s.weight })),
    sourceTags: (item.tags || []).filter((t) => t.tag_type === "aesthetic").map((t) => t.tag),
  };

  // Try the model seam first; it refuses honestly while AI is disabled.
  const model = allowExternalAi ? await runModel({
    feature: "mood-board",
    promptVersionId: PROMPT_VERSION_MOOD_BOARD_ANALYSIS_V1.id,
    context: input,
    userId: item.userId,
    validate: validateMoodBoardAnalysisOutput,
  }) : { ok: false, disabled: true };

  const usedModel = model.ok;
  const analysis = usedModel ? model.data : interpretMoodBoardItem(input);
  try {
    const rec = await createMoodBoardAnalysis({
      uploadId: item.id,
      userId: item.userId,
      analysisStatus: "complete",
      analysisSource: usedModel ? "model" : "local-rules",
      modelProvider: usedModel ? model.provider : null,
      modelName: usedModel ? model.modelName : null,
      promptVersion: usedModel ? model.promptVersion : null,
      rawModelOutput: null, // adapter stores summaries in ai_model_events; raw kept null for local
      parsedTags: analysisToTagRows(analysis),
      summary: analysis.summary,
      confidenceScore: analysis.confidenceScore,
    });
    return { ok: true, analysis, record: rec, source: usedModel ? "model" : "local-rules" };
  } catch (e) {
    // Analysis is derived data — persist the failure if we can, never break the caller.
    await createMoodBoardAnalysis({
      uploadId: item.id, userId: item.userId, analysisStatus: "failed",
      analysisSource: usedModel ? "model" : "local-rules",
      errorMessage: String(e.message).slice(0, 300), parsedTags: [],
    }).catch(() => {});
    return { ok: false, error: "analysis persistence failed", analysis };
  }
}

// Aggregate a user's analyzed + typed tags into per-type weight maps —
// the raw material for user_style_profiles.
export async function extractMoodBoardSignals(userId) {
  const [uploads, analyses] = await Promise.all([
    listMoodBoardUploads(userId, 100),
    listMoodBoardAnalyses(userId, 100),
  ]);
  const byType = {};
  const add = (tag, type, w) => {
    if (!tag) return;
    byType[type] = byType[type] || {};
    byType[type][tag] = +((byType[type][tag] || 0) + w).toFixed(3);
  };
  for (const u of uploads) for (const t of u.tags || []) add(t.tag, t.tag_type, t.confidence ?? 0.5);
  for (const a of analyses) {
    if (a.analysisStatus !== "complete") continue;
    for (const t of a.parsedTags || []) add(t.tag, t.tag_type, (t.confidence ?? 0.5) * 0.8);
  }
  return { byType, uploads: uploads.length, analyses: analyses.length };
}
