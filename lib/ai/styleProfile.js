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
} from "../db/production.js";

const top = (map = {}, n = 6) =>
  Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([tag, weight]) => ({ tag, weight: +Number(weight).toFixed(3) }));

export async function rebuildUserStyleProfile(userId) {
  if (!userId) return { ok: false, error: "user required" };
  try {
    const [signals, brainProfile, boards, feedback] = await Promise.all([
      extractMoodBoardSignals(userId),
      getProfile(userId),
      getBoards(userId),
      listStylistFeedback(userId, 100).catch(() => []),
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
        for (const t of f.matchedTags || []) avoided[t] = (avoided[t] || 0) + 1;
      }
    }

    const sources = {
      moodBoardUploads: signals.uploads, analyses: signals.analyses,
      savedItems, feedback: feedback.length,
      brainTags: Object.keys(brainProfile?.long || {}).length,
    };
    const signalCount = Object.values(sources).reduce((s, n) => s + n, 0);
    const dominant = top(aesthetics);
    const summary = dominant.length
      ? `Leans ${dominant.slice(0, 3).map((d) => d.tag).join(", ")}` +
        (top(signals.byType.color, 3).length
          ? ` in ${top(signals.byType.color, 3).map((c) => c.tag).join("/")}`
          : "") + ". Deterministic summary from live signals — a model rewrites this later."
      : "No taste signal yet — train the moodboard or save pieces.";

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
      tasteSummary: summary,
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
