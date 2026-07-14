// lib/ai/stylistReasoningEngine.js
// Stylist intelligence service — separated from the UI entirely.
// Today: REAL tag-based logic reusing the live outfit engine (lib/brain/
// stylist buildOutfit — slots, pair coherence, fit) plus the user style
// profile, budget/size/color/excluded-tag constraints, and availability.
// Tomorrow: runModel() through the stylist prompt seam; its output passes
// validateStylistOutput against the SAME candidate set, so a model can never
// recommend a product that isn't really available.

import { buildSlate } from "../brain/stylist.js";
import { listItems } from "../db/index.js";
import { CATALOG } from "../ingest/catalog.js";
import { runModel } from "./adapter.js";
import { validateStylistOutput } from "./validate.js";
import { PROMPT_VERSION_STYLIST_OUTFIT_V2 } from "./promptVersions.js";
import { getUserStyleProfile } from "./styleProfile.js";
import {
  getCurrentFashionTrends, getFashionTrendContext, scoreProductTrendRelevance,
} from "./trendKnowledge.js";
import {
  createStylistRequest, updateStylistRequestStatus, saveStylistOutfit,
  createStylistFeedback, getStylistOutfit, getUserRecommendationExclusions,
} from "../db/production.js";

// Available, budget-fitting, non-excluded candidates from the REAL database
// (in-memory catalog when keyless). Sold/hidden products never surface.
// Day 11: brands the user explicitly corrected away ("dont-recommend-brand")
// are excluded at the CANDIDATE level — a correction is a promise, not a hint.
export async function getCandidateProductsForStylist(request = {}, userId = null) {
  let pool = [];
  try { pool = await listItems(5000); } catch { pool = []; }
  if (!pool.length) pool = CATALOG;
  const excluded = new Set((request.excludedTags || []).map((t) => String(t).toLowerCase()));
  const exclusions = userId
    ? await getUserRecommendationExclusions(userId)
    : { brands: [], productIds: [] };
  const excludedBrands = new Set(exclusions.brands);
  const excludedProducts = new Set(exclusions.productIds);
  return pool.filter((it) => {
    if (excludedProducts.has(it.id)) return false;
    if (it.brand && excludedBrands.has(it.brand.trim().toLowerCase())) return false;
    if ((it.availability_status || "unknown") === "unavailable") return false;
    if ((it.moderation_status || "visible") !== "visible") return false;
    if (request.budgetMax && it.price && it.price > request.budgetMax) return false;
    if (request.budgetMin && it.price && it.price < request.budgetMin) return false;
    if (excluded.size && Object.keys(it.tags || {}).some((t) => excluded.has(t.toLowerCase()))) return false;
    return true;
  });
}

// Taste fit of one product for one profile: aesthetic overlap + brand +
// color preference + avoided-tag penalty. Deterministic and explainable.
export function scoreProductForUser(product, profile, trends = getCurrentFashionTrends()) {
  let s = 0;
  const weights = Object.fromEntries((profile?.dominantAesthetics || []).map((d) => [d.tag.toUpperCase(), d.weight]));
  for (const [t, w] of Object.entries(product.tags || {})) {
    if (typeof w === "number" && weights[t.toUpperCase()]) s += w * weights[t.toUpperCase()];
  }
  const brands = new Set((profile?.preferredBrands || []).map((b) => b.tag));
  if (product.brand && brands.has(product.brand.toLowerCase())) s += 0.3;
  const avoided = new Set((profile?.avoidedTags || []).map((a) => a.tag.toUpperCase()));
  for (const t of Object.keys(product.tags || {})) if (avoided.has(t.toUpperCase())) s -= 0.4;
  // Current-trend relevance is deliberately capped below a single preferred
  // brand hit. It helps exploration without outranking demonstrated taste.
  s += Math.min(0.18, scoreProductTrendRelevance(product, trends).score * 0.18);
  return +s.toFixed(3);
}

// Build N looks with the live engine, taste-weighted toward the profile.
export function buildOutfitCombinations(products, profile, request = {}, n = 3) {
  const taste = {};
  for (const d of profile?.dominantAesthetics || []) taste[d.tag.toUpperCase()] = d.weight;
  const scored = products
    .map((p) => ({ p, s: scoreProductForUser(p, profile) }))
    .sort((a, b) => b.s - a.s);
  const pool = scored.slice(0, Math.max(60, Math.floor(scored.length / 2))).map((x) => x.p);
  return buildSlate(pool, taste, n, {});
}

const colorNames = (items) =>
  [...new Set(items.flatMap((it) => (it.colors || []).map((c) => c.name || c)).filter(Boolean))];

function reasonings(built, profile, request) {
  const items = built.items;
  const cats = [...new Set(items.map((it) => it.category).filter(Boolean))];
  const matched = [...new Set(items.flatMap((it) =>
    Object.keys(it.tags || {}).filter((t) =>
      (profile?.dominantAesthetics || []).some((d) => d.tag.toUpperCase() === t.toUpperCase()))))]
    .map((t) => t.toLowerCase());
  const colors = colorNames(items);
  const trendMatches = [...new Map(items.map((item) => {
    const match = scoreProductTrendRelevance(item);
    return match.trend && match.score >= 0.2 ? [match.trend.id, match.trend.name] : null;
  }).filter(Boolean)).values()];
  return {
    matchedTags: matched,
    colorLogic: colors.length
      ? `palette holds to ${colors.slice(0, 3).join("/")}`
      : "color data pending for these pieces — matched on tags",
    silhouetteLogic: `slots covered: ${cats.join(", ")}; pair coherence scored by the live engine`,
    aestheticLogic: matched.length
      ? `consistent ${matched.slice(0, 3).join(", ")} thread across the look`
      : "exploration pick — outside the profile's dominant tags",
    trendLogic: trendMatches.length
      ? `current styling context: ${trendMatches.slice(0, 2).join(", ")}`
      : null,
    warnings: [
      ...(request.sizePreferences?.length ? items.filter((it) => it.size && !request.sizePreferences.includes(String(it.size))).map((it) => `${it.title || it.id}: size may not match preference`) : []),
      ...items.filter((it) => (it.availability_status || "unknown") === "unknown").map((it) => `${it.title || it.id}: availability unverified`),
    ].slice(0, 4),
  };
}

export function rankOutfits(outfits, profile) {
  return [...outfits].sort((a, b) => {
    const score = (o) => o.items.reduce((s, it) => s + scoreProductForUser(it, profile), 0) + (o.matchScore || 0);
    return score(b) - score(a);
  });
}

export async function saveStylistRequest(request) { return createStylistRequest(request); }
export async function recordStylistFeedback(feedback) { return createStylistFeedback(feedback); }
export { getStylistOutfit };

/**
 * The main entry: persist the request, try the model seam, fall back to the
 * real local engine, persist every outfit with its reasoning. NEVER throws.
 */
export async function generateStylistOutfits(userId, request = {}) {
  if (!userId) return { ok: false, error: "user required" };
  let reqRow = null;
  try {
    reqRow = await createStylistRequest({ ...request, userId });
    const [profile, candidates] = await Promise.all([
      request.useMoodBoardBrain === false ? null : getUserStyleProfile(userId),
      getCandidateProductsForStylist(request, userId),
    ]);
    if (!candidates.length) {
      await updateStylistRequestStatus(reqRow.id, "empty").catch(() => {});
      return { ok: false, error: "no available products match the request", requestId: reqRow.id };
    }

    // Model seam — refuses honestly while AI_STYLIST_ENABLED is off.
    const model = request.aiConsent === true ? await runModel({
      feature: "stylist",
      promptVersionId: PROMPT_VERSION_STYLIST_OUTFIT_V2.id,
      userId,
      context: {
        styleProfile: profile, request,
        fashionTrendContext: getFashionTrendContext(),
        candidates: candidates.slice(0, 80).map((c) => ({ id: c.id, title: c.title, brand: c.brand, category: c.category, price: c.price, tags: Object.keys(c.tags || {}) })),
      },
      validate: (out) => validateStylistOutput(out, new Set(candidates.map((c) => String(c.id)))),
    }) : { ok: false, disabled: true };

    let outfits;
    let provider = null;
    if (model.ok) {
      provider = { modelProvider: model.provider, modelName: model.modelName };
      const byId = new Map(candidates.map((c) => [String(c.id), c]));
      outfits = model.data.outfits.map((o) => ({
        items: o.productIds.map((id) => byId.get(id)),
        matchScore: o.confidenceScore, name: o.name, summary: o.summary,
        ...o,
      }));
    } else {
      const built = buildOutfitCombinations(candidates, profile, request, 3);
      outfits = rankOutfits(built, profile).map((b, i) => {
        const r = reasonings(b, profile, request);
        return {
          items: b.items, matchScore: b.matchScore ?? b.score ?? null,
          name: `LOOK ${String(i + 1).padStart(2, "0")}`,
          summary: r.aestheticLogic, ...r,
        };
      });
    }
    if (!outfits.length) {
      await updateStylistRequestStatus(reqRow.id, "empty").catch(() => {});
      return { ok: false, error: "no coherent outfit could be built", requestId: reqRow.id };
    }

    const saved = [];
    for (const o of outfits) {
      const aestheticLogic = [o.aestheticLogic, o.trendLogic].filter(Boolean).join("; ") || null;
      saved.push(await saveStylistOutfit({
        userId, stylistRequestId: reqRow.id,
        signature: o.items.map((it) => it.id).sort().join("|").slice(0, 200),
        items: o.items, matchScore: o.matchScore,
        reasons: [o.colorLogic, o.silhouetteLogic, o.aestheticLogic, o.trendLogic].filter(Boolean),
        outfitName: o.name, outfitSummary: o.summary,
        matchedTags: o.matchedTags || [],
        colorLogic: o.colorLogic, silhouetteLogic: o.silhouetteLogic,
        aestheticLogic,
        modelProvider: provider?.modelProvider || null,
        modelName: provider?.modelName || null,
      }));
    }
    return {
      ok: true, requestId: reqRow.id, source: model.ok ? "model" : "local-rules",
      outfits: saved.map((row, i) => ({ ...row, warnings: outfits[i].warnings || [] })),
    };
  } catch (e) {
    if (reqRow) await updateStylistRequestStatus(reqRow.id, "failed").catch(() => {});
    return { ok: false, error: "stylist generation failed: " + String(e.message).slice(0, 200) };
  }
}
