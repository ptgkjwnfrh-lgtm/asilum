// app/api/feed/route.js
// GET /api/feed?user=<id>&epsilon=<0|1>&q=<prompt>&board=<boardId>
// Returns a ranked feed. With Asterisk guidance active it uses the Passport
// profile, optional prompt, and shared-board taste transfer; while paused it
// uses general signals plus explicit fit/craving filters and does not update
// taste-rotation memory. Impressions still feed global popularity.

import { NextResponse } from "next/server";
import { buildFeed, coldStart, markSeen, itemsVector } from "../../../lib/brain/index.js";
import { enrichItemVec } from "../../../lib/tagging/dense.js";
import { applyTimeDecay } from "../../../lib/brain/memory.js";
import { fitIndex } from "../../../lib/brain/sizing.js";
import {
  getProfile, mutateProfile,
  getEdges, getPopularity, getBoard, bumpPopularity,
} from "../../../lib/db/index.js";
import {
  getMemoryPreferences, getUserCorrectionSignalSummary, getUserRecommendationExclusions,
} from "../../../lib/db/production.js";
import { applyCorrectionSignalsToBrainProfile } from "../../../lib/asterisk/correctionSignals.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { cravingVector, hasCravingContext, parseCravingContext } from "../../../lib/craving/index.js";
import { getDiscoverablePool, publicProduct } from "../../../lib/products.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const quota = await consumeRateLimit({ scope: "feed", subject: userId, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }
  const globalQuota = await consumeGlobalBudget("feed");
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }
  const guidanceEnabled =
    (await getMemoryPreferences(userId).catch(() => ({ guidanceEnabled: false }))).guidanceEnabled !== false;
  const epsilonParam = searchParams.get("epsilon") === "1";
  const q = (searchParams.get("q") || "").slice(0, 400);
  const boardId = (searchParams.get("board") || "").slice(0, 80);
  const craving = parseCravingContext({
    text: searchParams.get("craving"),
    occasion: searchParams.get("occasion"),
    mood: searchParams.get("mood"),
    novelty: searchParams.get("novelty"),
  });
  const cravingActive = hasCravingContext(craving);
  const contextVec = cravingActive ? cravingVector(craving) : null;

  // Item pool: DB items if available, else the seed catalog.
  let pool = await getDiscoverablePool();
  // Dense tagging (Day 25): sharpen item vectors with the brain's own
  // affinity bleed before scoring — primaries untouched, kill switch below.
  if ((process.env.DENSE_FEED_ENABLED ?? "1") !== "0") {
    pool = pool.map((it) => ({ ...it, tags: enrichItemVec(it.tags || {}) }));
  }
  let correctionSummary, exclusions;
  try {
    [correctionSummary, exclusions] = await Promise.all([
      guidanceEnabled ? getUserCorrectionSignalSummary(userId) : Promise.resolve({}),
      getUserRecommendationExclusions(userId),
    ]);
  } catch {
    return NextResponse.json({ error: "correction state unavailable" }, { status: 503 });
  }
  const excludedBrands = new Set(exclusions.brands);
  const excludedProducts = new Set(exclusions.productIds);
  pool = pool.filter((item) =>
    !excludedProducts.has(item.id) &&
    !(item.brand && excludedBrands.has(item.brand.trim().toLowerCase())));

  // Hard filters run BEFORE ranking so taste ordering applies within them.
  const category = (searchParams.get("category") || "").slice(0, 80);
  const parsedMaxPrice = Number.parseFloat(searchParams.get("maxPrice"));
  const maxPrice = Number.isFinite(parsedMaxPrice) ? Math.max(0, Math.min(1_000_000, parsedMaxPrice)) : 0;
  const fit = (searchParams.get("fit") || "").slice(0, 20).toUpperCase();
  if (category) pool = pool.filter((it) => it.category === category);
  if (maxPrice > 0) pool = pool.filter((it) => it.price != null && it.price <= maxPrice);
  if (fit) {
    const want = fitIndex(fit);
    if (want != null) {
      pool = pool.filter((it) => {
        const got = fitIndex(it.size && it.size.fitsLikeUS);
        return got != null && Math.abs(got - want) <= 1;
      });
    }
  }

  // Profile: persisted (with clock-based forgetting applied on read),
  // else cold-start from prompt.
  let storedProfile = {};
  if (guidanceEnabled) {
    try { storedProfile = await getProfile(userId); } catch { storedProfile = {}; }
  }
  let profile = storedProfile;
  ({ profile } = applyTimeDecay(profile));
  const hasProfile =
    Object.keys(profile.long || {}).length > 0 ||
    Object.keys(profile.session || {}).length > 0;
  if (guidanceEnabled && !hasProfile && q) profile = coldStart(q).profile;
  const profileBeforeCorrections = profile;
  profile = guidanceEnabled
    ? applyCorrectionSignalsToBrainProfile(profile, correctionSummary)
    : applyCorrectionSignalsToBrainProfile({}, {});

  // Shared-board taste transfer — an explicit ?board= link, else the standing
  // influence of the boards this user follows.
  let boardVec = null;
  if (guidanceEnabled && boardId) {
    try {
      const board = await getBoard(boardId);
      if (board && board.items.length) boardVec = itemsVector(board.items);
    } catch {}
  } else if (guidanceEnabled) {
    const follows = (profile && profile._meta && profile._meta.follows) || [];
    if (follows.length) {
      try {
        const boards = await Promise.all(follows.map((id) => getBoard(id)));
        const pooled = boards.filter(Boolean).flatMap((b) => b.items);
        if (pooled.length) boardVec = itemsVector(pooled);
      } catch {}
    }
  }

  // Graph neighborhood of the user's recent engagements + global popularity.
  const recent = guidanceEnabled
    ? (profile && profile._meta && profile._meta.recent) || [] : [];
  const [edges, popularity] = await Promise.all([
    recent.length ? getEdges(recent) : {},
    getPopularity(),
  ]);

  const { split, items, epsilonActive, epsilonAuto, safeMode, zones } = buildFeed(
    {
      profile,
      epsilonActive: epsilonParam || craving.novelty === "wildcard",
      edges, popularity, boardVec, contextVec, novelty: craving.novelty,
    },
    pool
  );

  // Feed rotation memory + impression counting (best-effort). The profile is
  // re-read inside the lock so we never clobber a concurrent interaction, and
  // the clock decay is persisted so idle forgetting sticks.
  const ids = items.map((it) => it.id);
  try {
    const writes = [bumpPopularity(ids.map((id) => ({ id, imp: 1 })))];
    if (guidanceEnabled) {
      writes.push(mutateProfile(userId, (current) => {
        const base = current && Object.keys(current).length ? current : profileBeforeCorrections;
        const { profile: decayed } = applyTimeDecay(base);
        return markSeen(decayed, ids);
      }));
    }
    await Promise.all(writes);
  } catch {}

  return NextResponse.json({
    userId,
    epsilonActive,
    epsilonAuto,
    safeMode,
    guidanceEnabled,
    boardSeeded: !!boardVec,
    craving: cravingActive ? craving : null,
    split,
    zones,
    count: items.length,
    items: items.map(publicProduct).filter(Boolean),
  });
}
