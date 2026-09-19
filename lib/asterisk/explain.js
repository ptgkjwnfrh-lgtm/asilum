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
import { hasEnoughEvidence, signalCountOf } from "./margin.js";
import {
  createUserCorrectionWithEvent, getUserCorrectionState, getProductAiTags,
} from "../db/production.js";
import { getUserStyleProfile, rebuildUserStyleProfile } from "../ai/styleProfile.js";
import { EVENTS } from "../events/index.js";
import { getCatalogItem } from "../ingest/catalog.js";
import { resolveTag } from "./ontology.js";
import { PROFILE_SHAPING_CODES, laneOf, CORRECTION_SCOPES } from "./correctionSignals.js";
import { facetOf } from "../tagging/vocabulary.js";
import { undoUserCorrection } from "../db/production.js";

// Recommendation feedback stays separate from listing-data error reports.
export const RECOMMENDATION_FEEDBACK_CODES = new Set([
  "not-my-style", "less-like-this", "more-like-this", "right-vibe-wrong-product",
  "already-own", "dont-recommend-brand", "dont-recommend-silhouette",
  "too-literal", "too-abstract",
  // reason-specific (V.2): each changes only its lane — see REASON_LANES
  "too-expensive", "too-small", "too-large", "dislike-finish", "not-interested",
]);
export const DATA_REPORT_CODES = new Set([
  "wrong-brand", "wrong-color", "wrong-category", "wrong-material", "wrong-era",
  // "this piece is not by the designer it claims" — a report for the desk,
  // never a taste signal, never a demotion of the piece for the reader
  "wrong-attribution",
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
/**
 * Take one correction back. The row stays, stamped undone_at, so the record
 * that it was made and withdrawn survives; every consumer treats an undone
 * row as absent. Re-recording the same code later revives the row.
 */
export async function undoCorrection(userId, correctionId) {
  const id = String(correctionId ?? "").trim();
  if (!id || id.length > 40) return { ok: false, error: "correction id required", status: 400 };
  try {
    const r = await undoUserCorrection(userId, id, {
      userId, type: EVENTS.USER_CORRECTED_RECOMMENDATION,
      payload: { undoOf: id },
    });
    if (!r.correction) return { ok: false, error: "no such active correction", status: 404 };
    let profileUpdated = null;
    if (PROFILE_SHAPING_CODES.has(r.correction.code)) {
      const rebuilt = await rebuildUserStyleProfile(userId);
      profileUpdated = rebuilt.ok;
    }
    return { ok: true, correction: r.correction, lane: laneOf(r.correction.code), profileUpdated };
  } catch {
    return { ok: false, error: "correction unavailable", status: 500 };
  }
}

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
    const signalCount = signalCountOf(profile);
    const uncertainty = !profile || !hasEnoughEvidence(signalCount)
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
const FINISH_WORDS = /^(shine|shiny|gloss|glossy|matte|patent|metallic|satin|sheen|lacquer(ed)?|coated|waxed|distressed|washed|sequin(ed)?|glitter|velvet)$/i;
const MATERIAL_WORDS = /^(leather|suede|wool|cotton|nylon|denim|silk|cashmere|linen|canvas|mesh|shearling|fur|mohair|tweed|corduroy|jersey|velour|vinyl|rubber|polyester|viscose|lace|knit|fleece)$/i;

/** What one correction may carry into the store — its lane's facts, nothing else. */
export function correctionSnapshot(item, code) {
  const lane = laneOf(code);
  const dominant = () => Object.entries(item.tags || {})
    .filter(([, weight]) => typeof weight === "number" && weight >= 0.3)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([tag]) => resolveTag(tag)?.label || tag.toLowerCase());
  if (lane === "price") {
    const cents = Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? Math.round(Number(item.price) * 100) : null;
    return cents ? [`price:${cents}`, `currency:${String(item.currency || "USD").toLowerCase()}`] : [];
  }
  if (lane === "fit") {
    const size = item.size && typeof item.size === "object" ? (item.size.label || item.size.fitsLikeUS || "") : String(item.size || "");
    return [item.brand ? `brand:${item.brand}` : null, item.category ? `category:${item.category}` : null, size ? `size:${size}` : null].filter(Boolean);
  }
  if (lane === "finish") {
    // The finish is read from three honest places: a typed material tag, a
    // descriptor the stream wrote, and the listing's own title words. The
    // seed catalog's tags are aesthetics only, so the title is often the
    // only place the word "leather" or "patent" exists.
    const out = new Set();
    for (const tag of Object.keys(item.tags || {})) {
      if (facetOf(tag) === "material" || FINISH_WORDS.test(tag) || MATERIAL_WORDS.test(tag)) out.add((resolveTag(tag)?.label || tag).toLowerCase());
    }
    for (const d of Array.isArray(item.descriptors) ? item.descriptors : []) {
      if (FINISH_WORDS.test(String(d)) || MATERIAL_WORDS.test(String(d))) out.add(String(d).toLowerCase());
    }
    for (const word of String(item.title || "").toLowerCase().split(/[^a-z]+/)) {
      if (word && (FINISH_WORDS.test(word) || MATERIAL_WORDS.test(word))) out.add(word);
    }
    return [...out].slice(0, 6);
  }
  if (lane === "item" || lane === "data" || lane === "brand" || lane === "note") return [];
  return dominant();
}

export async function recordCorrection(userId, { productId = null, code, note = "", scope = "ongoing" } = {}) {
  if (!CORRECTION_CODES.has(code)) return { ok: false, error: "unknown correction code" };
  if (!productId) return { ok: false, error: "product required", status: 400 };
  if (!CORRECTION_SCOPES.includes(scope)) return { ok: false, error: "unknown correction scope", status: 400 };
  const lane = laneOf(code);
  // A data report is not a preference and has no scope but "the record".
  if (lane === "data" && scope !== "ongoing") return { ok: false, error: "a data report has no scope", status: 400 };
  try {
    const item = await getItem(productId) || getCatalogItem(productId);
    if (!item) return { ok: false, error: "product not found", status: 404 };

    // Snapshot ONLY the lane's facts so the correction survives later listing
    // edits — and so it can never reach another lane (correctionSnapshot).
    const tags = correctionSnapshot(item, code);

    const report = DATA_REPORT_CODES.has(code) ? {
      kind: "user-report", subjectType: "product", subjectId: productId,
      priority: "normal",
      payload: { code, note: String(note || "").slice(0, 300), reportedBy: userId },
    } : null;
    const { correction, moderationTask, duplicate, revived } = await createUserCorrectionWithEvent(
      {
        userId, productId, code, scope,
        brand: item?.brand || null,
        tags, note: String(note || "").slice(0, 300),
      },
      {
        userId, type: EVENTS.USER_CORRECTED_RECOMMENDATION,
        payload: { productId, code, lane, scope, brand: item?.brand || null, tags },
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
      ok: true, correction, moderationTask, duplicate, revived: !!revived, lane, scope,
      profileUpdated, profileError,
    };
  } catch (error) {
    if (error?.code === "CORRECTION_RATE_LIMIT") {
      return { ok: false, error: error.message, status: 429 };
    }
    return { ok: false, error: "correction unavailable", status: 500 };
  }
}
