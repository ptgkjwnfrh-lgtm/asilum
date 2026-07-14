// app/api/feed/route.js
// GET /api/feed?user=<id>&epsilon=<0|1>&q=<prompt>&board=<boardId>
// Returns a ranked, personalized feed. Uses the persisted profile if present,
// otherwise cold-starts from the optional text prompt. A shared board id seeds
// the taste vector (taste transfer), so a shared moodboard link personalizes
// the feed of whoever opens it. Every served page is remembered on the profile
// (feed rotation) and counted as impressions for the popularity signal.

import { NextResponse } from "next/server";
import { buildFeed, coldStart, markSeen, itemsVector } from "../../../lib/brain/index.js";
import { applyTimeDecay } from "../../../lib/brain/memory.js";
import { fitIndex } from "../../../lib/brain/sizing.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import {
  listItems, getProfile, mutateProfile,
  getEdges, getPopularity, getBoard, bumpPopularity,
} from "../../../lib/db/index.js";
import {
  getUserCorrectionSignalSummary, getUserRecommendationExclusions,
} from "../../../lib/db/production.js";
import { applyCorrectionSignalsToBrainProfile } from "../../../lib/asterisk/correctionSignals.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { cravingVector, hasCravingContext, parseCravingContext } from "../../../lib/craving/index.js";
import { isDiscoverableProduct } from "../../../lib/products.js";

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
  let pool = [];
  try { pool = await listItems(5000); } catch { pool = []; }
  pool = pool.filter(isDiscoverableProduct);
  if (!pool || pool.length === 0) pool = CATALOG;
  let correctionSummary, exclusions;
  try {
    [correctionSummary, exclusions] = await Promise.all([
      getUserCorrectionSignalSummary(userId),
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
  const category = searchParams.get("category") || "";
  const maxPrice = parseFloat(searchParams.get("maxPrice")) || 0;
  const fit = (searchParams.get("fit") || "").toUpperCase();
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
  try { storedProfile = await getProfile(userId); } catch { storedProfile = {}; }
  let profile = storedProfile;
  ({ profile } = applyTimeDecay(profile));
  const hasProfile =
    Object.keys(profile.long || {}).length > 0 ||
    Object.keys(profile.session || {}).length > 0;
  if (!hasProfile && q) profile = coldStart(q).profile;
  const profileBeforeCorrections = profile;
  profile = applyCorrectionSignalsToBrainProfile(profile, correctionSummary);

  // Shared-board taste transfer — an explicit ?board= link, else the standing
  // influence of the boards this user follows.
  let boardVec = null;
  if (boardId) {
    try {
      const board = await getBoard(boardId);
      if (board && board.items.length) boardVec = itemsVector(board.items);
    } catch {}
  } else {
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
  const recent = (profile && profile._meta && profile._meta.recent) || [];
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
    await Promise.all([
      mutateProfile(userId, (current) => {
        const base = current && Object.keys(current).length ? current : profileBeforeCorrections;
        const { profile: decayed } = applyTimeDecay(base);
        return markSeen(decayed, ids);
      }),
      bumpPopularity(ids.map((id) => ({ id, imp: 1 }))),
    ]);
  } catch {}

  return NextResponse.json({
    userId,
    epsilonActive,
    epsilonAuto,
    safeMode,
    boardSeeded: !!boardVec,
    craving: cravingActive ? craving : null,
    split,
    zones,
    count: items.length,
    items,
  });
}
