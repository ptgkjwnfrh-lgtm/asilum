// lib/ai/styleProfile.js
// User style profile: the distilled taste document that Mood Board Brain,
// Search, Discover, and the Stylist all read. Rebuilt from REAL signals:
// mood-board tags + analyses, the live brain taste vector, saved board items,
// and stylist feedback. Server-only. Local/deterministic today; the
// style-profile prompt seam adds model-written summaries later.

import { extractMoodBoardSignals } from "./moodBoardAnalyzer.js";
import { getProfile, getBoards } from "../db/index.js";
import {
  upsertUserStyleProfile, getUserStyleProfileRow, listStylistFeedback,
  getUserCorrectionSignalSummary,
} from "../db/production.js";
import { NEGATIVE_CORRECTION_CODES } from "../asterisk/correctionSignals.js";

const top = (map = {}, n = 6) =>
  Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([tag, weight]) => ({ tag, weight: +Number(weight).toFixed(3) }));

/**
 * Rebuild a reader's style profile from REAL signals — mood boards, taste
 * vector, boards, feedback and corrections — and store it.
 *
 * The distilled document that Mood Board Brain, Search, Discover and the
 * Stylist all read, so they cannot each derive a different account of the same
 * person. Returns `{ ok, ... }` and never throws: a profile rebuild failing
 * must not fail the action that triggered it.
 *
 * Corrections are SUBTRACTED, not merely absent — a piece someone explicitly
 * rejected is a statement, not a gap.
 */
export async function rebuildUserStyleProfile(userId) {
  if (!userId) return { ok: false, error: "user required" };
  try {
    const [signals, brainProfile, boards, feedback, correctionSummary] = await Promise.all([
      extractMoodBoardSignals(userId),
      getProfile(userId),
      getBoards(userId),
      listStylistFeedback(userId, 100).catch(() => []),
      getUserCorrectionSignalSummary(userId),
    ]);

    // Aesthetics: brain long-term vector + mood-board aesthetic/palette tags.
    const aesthetics = {};
    for (const [t, w] of Object.entries(brainProfile?.long || {})) {
      if (typeof w === "number" && w > 0.05) aesthetics[t.toLowerCase()] = w;
    }
    for (const [t, w] of Object.entries(signals.byType.aesthetic || {})) {
      aesthetics[t] = +((aesthetics[t] || 0) + w * 0.5).toFixed(3);
    }
    // Saved board items reinforce aesthetics + brands.
    const brands = {};
    let savedItems = 0;
    for (const b of boards || []) for (const it of b.items || []) {
      savedItems++;
      if (it.brand) brands[it.brand.toLowerCase()] = (brands[it.brand.toLowerCase()] || 0) + 1;
      for (const [t, w] of Object.entries(it.tags || {})) {
        if (typeof w === "number") aesthetics[t.toLowerCase()] = +((aesthetics[t.toLowerCase()] || 0) + w * 0.2).toFixed(3);
      }
    }
    // Rejected stylist outfits push their matched tags toward "avoided".
    const avoided = {};
    for (const f of feedback) {
      if (f.rejected || f.feedbackType === "dislike" || f.feedbackType === "reject") {
        for (const t of f.matchedTags || []) {
          const tag = String(t).toLowerCase();
          avoided[tag] = (avoided[tag] || 0) + 1;
        }
      }
    }
    // Structured corrections (Day 11): explicit correction OVERRIDES inference.
    // Negative taste codes weigh 2× a stylist rejection; more-like-this gently
    // reinforces; data-report codes (wrong-*) never touch taste — they route
    // to moderation in lib/asterisk/explain.js.
    for (const signal of correctionSummary.signals) {
      const tag = String(signal.tag).toLowerCase();
      const occurrences = Math.max(0, Number(signal.occurrences) || 0);
      if (NEGATIVE_CORRECTION_CODES.has(signal.code)) {
        avoided[tag] = (avoided[tag] || 0) + occurrences * 2;
      } else if (signal.code === "more-like-this") {
        aesthetics[tag] = +((aesthetics[tag] || 0) + occurrences * 0.3).toFixed(3);
      }
    }

    const sources = {
      moodBoardUploads: signals.uploads, analyses: signals.analyses,
      // How many of those analyses came from a MODEL rather than local rules.
      // Stored at write time, dropped at read time until now — see the note in
      // moodBoardAnalyzer.extractMoodBoardSignals.
      modelAnalyses: signals.modelAnalyses || 0,
      savedItems, feedback: feedback.length,
      corrections: correctionSummary.count,
      brainTags: Object.keys(brainProfile?.long || {}).length,
    };
    // modelAnalyses is a BREAKDOWN of `analyses`, not another signal — adding
    // it to the count would inflate the profile's own confidence with the same
    // evidence twice.
    const signalCount = Object.entries(sources)
      .filter(([k]) => k !== "modelAnalyses")
      .reduce((s, [, n]) => s + n, 0);
    const dominant = top(aesthetics);
    const summary = dominant.length
      ? `Leans ${dominant.slice(0, 3).map((d) => d.tag).join(", ")}` +
        (top(signals.byType.color, 3).length
          ? ` in ${top(signals.byType.color, 3).map((c) => c.tag).join("/")}`
          : "") + ". Deterministic summary from live signals — a model rewrites this later."
      : "No taste signal yet — train the moodboard or save pieces.";
    // The sentence above calls itself deterministic. That stops being true the
    // moment a model-sourced analysis is inside the aesthetics map it
    // summarises, so it says which it is instead of asserting the wrong one.
    const honestSummary = (signals.modelAnalyses || 0) > 0
      ? summary.replace(
          "Deterministic summary from live signals — a model rewrites this later.",
          `Summary from live signals, ${signals.modelAnalyses} of them model-analysed.`)
      : summary;

    const profile = {
      userId,
      dominantAesthetics: dominant,
      preferredColors: top(signals.byType.color),
      preferredSilhouettes: top(signals.byType.silhouette),
      preferredFabrics: top(signals.byType.fabric),
      preferredEras: top(signals.byType.era),
      preferredBrands: top(brands),
      preferredDesigners: top(signals.byType["designer-ref"]),
      avoidedTags: top(avoided),
      tasteSummary: honestSummary,
      confidenceScore: Math.min(0.9, +(signalCount * 0.02).toFixed(2)),
      sources,
    };
    const row = await upsertUserStyleProfile(profile);
    return { ok: true, profile: row };
  } catch (e) {
    return { ok: false, error: "style profile rebuild failed: " + String(e.message).slice(0, 200) };
  }
}

// Read; rebuild transparently when missing or stale (>10 min).
export async function getUserStyleProfile(userId, { maxAgeMs = 10 * 60_000 } = {}) {
  if (!userId) return null;
  const row = await getUserStyleProfileRow(userId).catch(() => null);
  if (row && Date.now() - (row.lastRebuiltAt || 0) < maxAgeMs) return row;
  const rebuilt = await rebuildUserStyleProfile(userId);
  return rebuilt.ok ? rebuilt.profile : row;
}
