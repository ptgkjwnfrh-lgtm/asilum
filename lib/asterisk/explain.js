// lib/asterisk/explain.js
// Asterisk AI — the explanation system. Every recommendation can answer
// "why am I seeing this?" with reasons built ONLY from real, named signals:
// the user's live taste profile, the product's tag vector, palette colors,
// era, brand history, and the user's own corrections. Confidence is honest,
// uncertainty is stated, and NOTHING is invented to sound intelligent.
// Deterministic today; the adapter seam can polish wording later without
// changing a single signal.
//
// Also home of the structured correction loop: corrections become
// user_corrections rows + a canonical event, feed avoided tags on the next
// profile rebuild, and data-report codes open moderation tasks instead of
// warping taste.

import { getItem, getProfile } from "../db/index.js";
import {
  createUserCorrectionWithEvent, listUserCorrections, getProductAiTags,
  createModerationTask,
} from "../db/production.js";
import { getUserStyleProfile, rebuildUserStyleProfile } from "../ai/styleProfile.js";
import { EVENTS } from "../events/index.js";
import { resolveTag } from "./ontology.js";

// Taste codes shape preference; data-report codes flag listing errors.
export const TASTE_CODES = new Set([
  "not-my-style", "less-like-this", "more-like-this", "right-vibe-wrong-product",
  "already-own", "dont-recommend-brand", "dont-recommend-silhouette",
  "too-literal", "too-abstract",
]);
export const DATA_REPORT_CODES = new Set([
  "wrong-brand", "wrong-color", "wrong-category", "wrong-material", "wrong-era",
]);
export const CORRECTION_CODES = new Set([...TASTE_CODES, ...DATA_REPORT_CODES]);

const round = (n) => +Number(n).toFixed(3);
const listTags = (arr = []) => arr.map((x) => x.tag);

// Deterministic taste-match: normalized overlap between the product's brain
// tag vector and the profile's dominant aesthetics. 0 when either side is
// silent — an honest "we don't know you yet", not a fake score.
function tasteMatch(itemVec = {}, dominant = []) {
  if (!dominant.length) return { score: 0, matched: [] };
  const matched = [];
  let overlap = 0, weightSum = 0;
  for (const { tag, weight } of dominant) {
    weightSum += weight;
    const w = itemVec[tag] ?? itemVec[tag.toUpperCase()] ?? itemVec[tag.toLowerCase()];
    if (typeof w === "number" && w > 0.15) {
      overlap += Math.min(w, 1) * weight;
      matched.push({ tag, productWeight: round(w), profileWeight: round(weight) });
    }
  }
  return { score: weightSum ? round(Math.min(1, overlap / weightSum)) : 0, matched };
}

/**
 * Build the honest "why this" for one product + one user. Never throws.
 * @returns {ok, explanation} | {ok:false, error}
 */
export async function explainProduct(userId, productId) {
  const item = await getItem(productId);
  if (!item) return { ok: false, error: "product not found" };
  const [profile, aiTags, corrections] = await Promise.all([
    getUserStyleProfile(userId).catch(() => null),
    getProductAiTags(productId).catch(() => []),
    listUserCorrections(userId, 200).catch(() => []),
  ]);

  const reasons = [];
  const warnings = [];

  // 1. Aesthetic taste match (brain vector × profile dominants).
  const tm = tasteMatch(item.tags || {}, profile?.dominantAesthetics || []);
  if (tm.matched.length) {
    reasons.push({
      kind: "taste-match",
      text: `matches your ${listTags(tm.matched.map((m) => ({ tag: m.tag }))).slice(0, 3).join(", ")} lean`,
      evidence: tm.matched.slice(0, 4),
      confidence: round(Math.min(0.9, tm.score + 0.2)),
    });
  }

  // 2. Color connection — profile colors vs product's audited color fields.
  const productColors = aiTags.filter((t) => t.field === "color").map((t) => t.value);
  const colorHits = (profile?.preferredColors || []).filter((c) => productColors.includes(c.tag));
  if (colorHits.length) {
    reasons.push({
      kind: "color",
      text: `${colorHits.map((c) => c.tag).join("/")} runs through your moodboard`,
      evidence: colorHits.slice(0, 3),
      confidence: 0.6,
    });
  }

  // 3. Brand history — brands the user actually saved, not guessed affinity.
  const brand = (item.brand || "").toLowerCase();
  const brandHit = (profile?.preferredBrands || []).find((b) => b.tag === brand);
  if (brandHit) {
    reasons.push({
      kind: "brand",
      text: `you've saved ${item.brand} pieces before`,
      evidence: [brandHit],
      confidence: 0.7,
    });
  }

  // 4. Era connection.
  const eraTag = aiTags.find((t) => t.field === "era")?.value || null;
  const eraHit = eraTag && (profile?.preferredEras || []).find((e) => e.tag === eraTag);
  if (eraHit) {
    reasons.push({ kind: "era", text: `${eraTag} sits in your preferred eras`,
      evidence: [eraHit], confidence: 0.55 });
  }

  // 5. Honest counter-signals — avoided tags and standing corrections.
  const avoided = new Set(listTags(profile?.avoidedTags || []));
  const clash = Object.keys(item.tags || {}).map((t) => t.toLowerCase()).filter((t) => avoided.has(t));
  if (clash.length) {
    warnings.push(`you usually pass on ${clash.slice(0, 2).join(", ")} — this one is a stretch, not a sure thing`);
  }
  if (corrections.some((c) => c.code === "dont-recommend-brand" && (c.brand || "").toLowerCase() === brand)) {
    warnings.push(`you asked not to see ${item.brand} — this should not be recommended (report it if it keeps appearing)`);
  }
  const alreadyOwn = corrections.some((c) => c.productId === productId && c.code === "already-own");
  if (alreadyOwn) warnings.push("you marked something like this as already owned");

  // 6. Availability, stated plainly.
  if (item.availability_status && item.availability_status !== "available") {
    warnings.push(`availability is "${item.availability_status}" — shown for reference, not as a sure buy`);
  }

  // Uncertainty: young profiles get told so, not dressed up.
  const signalCount = Object.values(profile?.sources || {}).reduce((s, n) => s + (n || 0), 0);
  const uncertainty = !profile || signalCount < 5
    ? "taste profile is young — these reasons are low-confidence until you train the moodboard or save more pieces"
    : null;

  const summary = reasons.length
    ? reasons.slice(0, 2).map((r) => r.text).join("; ")
    : "no strong taste signal connects you to this piece yet — it may be exploration or trending";

  return {
    ok: true,
    explanation: {
      productId, summary, reasons,
      tasteMatch: tm.score,
      matchedTags: tm.matched.map((m) => m.tag),
      warnings,
      uncertainty,
      profileSignals: signalCount,
      generatedBy: "asterisk-local-v1", // deterministic — a model polishes wording later via the seam
    },
  };
}

/**
 * Record a structured correction. Taste codes reshape the profile on next
 * rebuild; data-report codes open a moderation task (listing errors are a
 * data-quality problem, not a preference). Never throws.
 */
export async function recordCorrection(userId, { productId = null, code, note = "" } = {}) {
  if (!CORRECTION_CODES.has(code)) return { ok: false, error: "unknown correction code" };
  const item = productId ? await getItem(productId) : null;
  if (productId && !item) return { ok: false, error: "product not found" };

  // Snapshot the product's dominant tags so the correction stays meaningful
  // even if the listing changes later.
  const tags = item
    ? Object.entries(item.tags || {})
        .filter(([, w]) => typeof w === "number" && w >= 0.3)
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([t]) => resolveTag(t)?.label || t.toLowerCase())
    : [];

  const row = await createUserCorrectionWithEvent(
    {
      userId, productId, code,
      brand: item?.brand || null,
      tags, note: String(note || "").slice(0, 300),
    },
    {
      userId, type: EVENTS.USER_CORRECTED_RECOMMENDATION,
      payload: { productId, code, brand: item?.brand || null, tags },
    }
  );

  if (DATA_REPORT_CODES.has(code) && item) {
    await createModerationTask({
      kind: "user-report", subjectType: "product", subjectId: productId,
      priority: "normal",
      payload: { code, note: String(note || "").slice(0, 300), reportedBy: userId },
    }).catch(() => {});
  }

  // Derived data — fire and forget, same posture as moodboard uploads.
  rebuildUserStyleProfile(userId).catch(() => {});
  return { ok: true, correction: row };
}
