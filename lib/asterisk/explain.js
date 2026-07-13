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

import { getItem } from "../db/index.js";
import {
  createUserCorrectionWithEvent, getUserCorrectionState, getProductAiTags,
} from "../db/production.js";
import { getUserStyleProfile, rebuildUserStyleProfile } from "../ai/styleProfile.js";
import { EVENTS } from "../events/index.js";
import { getCatalogItem } from "../ingest/catalog.js";
import { resolveTag } from "./ontology.js";
import { PROFILE_SHAPING_CODES } from "./correctionSignals.js";

// Recommendation feedback stays separate from listing-data error reports.
export const RECOMMENDATION_FEEDBACK_CODES = new Set([
  "not-my-style", "less-like-this", "more-like-this", "right-vibe-wrong-product",
  "already-own", "dont-recommend-brand", "dont-recommend-silhouette",
  "too-literal", "too-abstract",
]);
export const DATA_REPORT_CODES = new Set([
  "wrong-brand", "wrong-color", "wrong-category", "wrong-material", "wrong-era",
]);
export const CORRECTION_CODES = new Set([...RECOMMENDATION_FEEDBACK_CODES, ...DATA_REPORT_CODES]);

const round = (n) => +Number(n).toFixed(3);
const normalized = (value) => String(value || "").trim().toLowerCase();

// Deterministic taste-match: normalized overlap between the product's brain
// tag vector and the profile's dominant aesthetics. 0 when either side is
// silent — an honest "we don't know you yet", not a fake score.
function tasteMatch(itemVec = {}, dominant = []) {
  if (!dominant.length) return { score: 0, matched: [] };
  const productWeights = new Map(Object.entries(itemVec)
    .map(([tag, weight]) => [normalized(tag), weight]));
  const matched = [];
  let overlap = 0, weightSum = 0;
  for (const { tag, weight } of dominant) {
    const profileWeight = Number(weight);
    if (!Number.isFinite(profileWeight) || profileWeight <= 0) continue;
    weightSum += profileWeight;
    const w = productWeights.get(normalized(tag));
    if (typeof w === "number" && w > 0.15) {
      overlap += Math.min(w, 1) * profileWeight;
      matched.push({ tag: normalized(tag), productWeight: round(w), profileWeight: round(profileWeight) });
    }
  }
  return { score: weightSum ? round(Math.min(1, overlap / weightSum)) : 0, matched };
}

/**
 * Build the honest "why this" for one product + one user. Never throws.
 * @returns {ok, explanation} | {ok:false, error}
 */
export async function explainProduct(userId, productId) {
  try {
    const item = await getItem(productId) || getCatalogItem(productId);
    if (!item) return { ok: false, error: "product not found", status: 404 };
    const brand = normalized(item.brand);
    const [profile, aiTags, correctionState] = await Promise.all([
      getUserStyleProfile(userId).catch(() => null),
      getProductAiTags(productId).catch(() => []),
      getUserCorrectionState(userId, { productId, brand }),
    ]);

    const reasons = [];
    const warnings = [];

    // 1. Aesthetic taste match (brain vector × profile dominants).
    const tm = tasteMatch(item.tags || {}, profile?.dominantAesthetics || []);
    if (tm.matched.length) {
      reasons.push({
        kind: "taste-match",
        text: `matches your ${tm.matched.slice(0, 3).map((m) => m.tag).join(", ")} lean`,
        evidence: tm.matched.slice(0, 4),
        confidence: round(Math.min(0.9, tm.score + 0.2)),
      });
    }

    // 2. Color connection — profile colors vs product's audited color fields.
    const productColors = new Set(aiTags
      .filter((t) => t.field === "color").map((t) => normalized(t.value)));
    const colorHits = (profile?.preferredColors || [])
      .filter((c) => productColors.has(normalized(c.tag)));
    if (colorHits.length) {
      reasons.push({
        kind: "color",
        text: `${colorHits.map((c) => c.tag).join("/")} runs through your moodboard`,
        evidence: colorHits.slice(0, 3),
        confidence: 0.6,
      });
    }

    // 3. Brand history — brands the user actually saved, not guessed affinity.
    const brandHit = (profile?.preferredBrands || []).find((b) => normalized(b.tag) === brand);
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
    const eraHit = eraTag && (profile?.preferredEras || [])
      .find((e) => normalized(e.tag) === normalized(eraTag));
    if (eraHit) {
      reasons.push({ kind: "era", text: `${eraTag} sits in your preferred eras`,
        evidence: [eraHit], confidence: 0.55 });
    }

    // 5. Honest counter-signals — avoided tags and standing corrections.
    const avoided = new Set((profile?.avoidedTags || []).map((entry) => normalized(entry.tag)));
    const clash = Object.keys(item.tags || {}).map(normalized).filter((tag) => avoided.has(tag));
    if (clash.length) {
      warnings.push(`you usually pass on ${clash.slice(0, 2).join(", ")} — this one is a stretch, not a sure thing`);
    }
    if (correctionState.excludedBrand) {
      warnings.push(`you asked not to see ${item.brand} — this should not be recommended (report it if it keeps appearing)`);
    }
    if (correctionState.alreadyOwn) warnings.push("you marked this piece as already owned");

    // 6. Availability, stated plainly.
    if (item.availability_status && item.availability_status !== "available") {
      warnings.push(`availability is "${item.availability_status}" — shown for reference, not as a sure buy`);
    }

    // Uncertainty: young profiles get told so, not dressed up.
    const signalCount = Object.values(profile?.sources || {})
      .reduce((sum, value) => sum + (Number(value) || 0), 0);
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
  } catch {
    return { ok: false, error: "explanation unavailable", status: 500 };
  }
}

/**
 * Record a structured correction. Preference-shaping codes rebuild the style
 * profile; standing exclusions are queried directly; data reports atomically
 * open moderation tasks. Never throws.
 */
export async function recordCorrection(userId, { productId = null, code, note = "" } = {}) {
  if (!CORRECTION_CODES.has(code)) return { ok: false, error: "unknown correction code" };
  if (!productId) return { ok: false, error: "product required", status: 400 };
  try {
    const item = await getItem(productId) || getCatalogItem(productId);
    if (!item) return { ok: false, error: "product not found", status: 404 };

    // Snapshot dominant tags so the correction survives later listing edits.
    const tags = Object.entries(item.tags || {})
      .filter(([, weight]) => typeof weight === "number" && weight >= 0.3)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([tag]) => resolveTag(tag)?.label || tag.toLowerCase());

    const report = DATA_REPORT_CODES.has(code) ? {
      kind: "user-report", subjectType: "product", subjectId: productId,
      priority: "normal",
      payload: { code, note: String(note || "").slice(0, 300), reportedBy: userId },
    } : null;
    const { correction, moderationTask, duplicate } = await createUserCorrectionWithEvent(
      {
        userId, productId, code,
        brand: item?.brand || null,
        tags, note: String(note || "").slice(0, 300),
      },
      {
        userId, type: EVENTS.USER_CORRECTED_RECOMMENDATION,
        payload: { productId, code, brand: item?.brand || null, tags },
      },
      report
    );

    let profileUpdated = null;
    let profileError = null;
    if (!duplicate && PROFILE_SHAPING_CODES.has(code)) {
      const rebuilt = await rebuildUserStyleProfile(userId);
      profileUpdated = rebuilt.ok;
      profileError = rebuilt.ok ? null : rebuilt.error;
    }
    return {
      ok: true, correction, moderationTask, duplicate, profileUpdated, profileError,
    };
  } catch (error) {
    if (error?.code === "CORRECTION_RATE_LIMIT") {
      return { ok: false, error: error.message, status: 429 };
    }
    return { ok: false, error: "correction unavailable", status: 500 };
  }
}
