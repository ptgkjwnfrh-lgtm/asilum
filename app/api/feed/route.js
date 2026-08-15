// app/api/feed/route.js
// GET /api/feed?user=<id>&epsilon=<0|1>&q=<prompt>&board=<boardId>
// Returns a ranked feed. With Asterisk guidance active it uses the Passport
// profile, optional prompt, and shared-board taste transfer; while paused it
// uses general signals plus explicit fit/craving filters and does not update
// taste-rotation memory. Impressions still feed global popularity.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildFeed, coldStart, markSeen, markBridgeImpressions, markBridgeServed, recordServe, itemsVector } from "../../../lib/brain/index.js";
import { examinedImpressionsEnabled } from "../../../lib/brain/attribution.js";
import { popularityDedupEnabled } from "../../../lib/brain/popularity.js";
import { tunedSplit, tuningEnabled, bridgeEngagementFromEvents } from "../../../lib/brain/tuning.js";
import { baseSplit } from "../../../lib/brain/bridges.js";
import { listEvents } from "../../../lib/db/index.js";
import { enrichItemVec } from "../../../lib/tagging/dense.js";
import { applyTimeDecay } from "../../../lib/brain/memory.js";
import { fitIndex } from "../../../lib/brain/sizing.js";
import {
  getProfile, mutateProfile,
  getEdges, getBoard, bumpPopularity,
} from "../../../lib/db/index.js";
import {
  getMemoryPreferences, getUserCorrectionSignalSummary, getUserRecommendationExclusions,
} from "../../../lib/db/production.js";
import { applyCorrectionSignalsToBrainProfile } from "../../../lib/asterisk/correctionSignals.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { crossUserCandidates } from "../../../lib/taste-graph/index.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { cravingVector, hasCravingContext, parseCravingContext } from "../../../lib/craving/index.js";
import {
  applyRecommendationExclusions, getDiscoverablePool, getPopularitySnapshot, publicProduct,
} from "../../../lib/products.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  // A visitor without an identity gets the cold-start feed rather than a 401.
  // /api/feed was the ONLY read surface that failed closed — discover, search,
  // related, suggest and editorial all already serve anonymously — so this one
  // route turned an issuance hiccup into a blank product. Anonymous callers
  // get no personalization, no profile writes, and no attribution; they get
  // the catalog. Their quota is the shared public bucket, not a per-user one.
  const anonymous = !userId;
  const quotaSubject = userId || requestSubject(req);
  const quota = await consumeRateLimit({ scope: "feed", subject: quotaSubject, limit: 60, windowMs: 60_000 });
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
  // No identity ⇒ no guidance, which makes every profile read and write below
  // fall away by construction: an anonymous serve reads nothing personal and
  // records nothing. It is a catalog view, not a de-personalized user.
  const guidanceEnabled = anonymous
    ? false
    : (await getMemoryPreferences(userId).catch(() => ({ guidanceEnabled: false }))).guidanceEnabled !== false;
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
      anonymous ? Promise.resolve({ brands: [], productIds: [] }) : getUserRecommendationExclusions(userId),
    ]);
  } catch {
    return NextResponse.json({ error: "correction state unavailable" }, { status: 503 });
  }
  pool = applyRecommendationExclusions(pool, exclusions);

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
  // Gate on MAGNITUDE, not key presence (audit #4): a persisted all-zero
  // vector (a pre-fix gibberish coldStart, or any decayed-to-zero profile)
  // has keys but no taste, and treating it as a real profile blocks the
  // coldStart re-seed forever. A profile counts only when some tag actually
  // carries signal.
  const hasSignal = (vec) => Object.values(vec || {}).some((v) => Math.abs(Number(v)) > 1e-9);
  const hasProfile = hasSignal(profile.long) || hasSignal(profile.session);
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
    getPopularitySnapshot(),
  ]);

  // Cross-user layer (asterisk-boost r1): what taste-neighbors engaged
  // with lifts the DISCOVERY zone. Only for users with standing taste,
  // best-effort — the feed never fails because of it. Weights normalized
  // to the strongest candidate so the boost is bounded 0..1.
  let crossUser = null;
  if (guidanceEnabled && hasProfile) {
    try {
      const xu = await crossUserCandidates(userId, 24);
      const cands = xu?.data?.candidates || [];
      if (cands.length) {
        const top = cands[0].score || 1;
        crossUser = {};
        for (const c of cands) crossUser[c.itemId] = c.score / top;
      }
    } catch {}
  }

  // (r16) bounded bridge self-tuning: the user's attributed history drifts
  // the base blend inside declared floors/caps. Server-computed only —
  // nothing here reads request input. Evidence-gated: cold users get null
  // and stay byte-identical to the shipped split. BRAIN_BRIDGE_TUNING=0
  // kills it without a deploy.
  let tuned = null;
  if (guidanceEnabled && hasProfile && tuningEnabled()) {
    try {
      const events = await listEvents(userId, 300);
      tuned = tunedSplit(
        (profile._meta && profile._meta.bridgeStats) || {},
        bridgeEngagementFromEvents(events),
        baseSplit()
      );
    } catch { tuned = null; }
  }

  const { split, items, epsilonActive, epsilonAuto, safeMode, zones } = buildFeed(
    {
      profile,
      epsilonActive: epsilonParam || craving.novelty === "wildcard",
      edges, popularity, boardVec, contextVec, crossUser, novelty: craving.novelty,
      tunedSplit: tuned,
    },
    pool
  );

  // Feed rotation memory + impression counting (best-effort). The profile is
  // re-read inside the lock so we never clobber a concurrent interaction, and
  // the clock decay is persisted so idle forgetting sticks.
  const ids = items.map((it) => it.id);
  const serveId = randomUUID();
  try {
    // (Aug 6) A GET no longer mutates global ranking state. This write counted
    // an impression for all 60 served slots on every serve, while
    // caller-controlled category/maxPrice/fit filters chose WHICH items got
    // them — ~3600 aimed impressions/minute, enough to collapse a targeted
    // item's novelty to 0.007 for everyone, permanently. It also sat OUTSIDE
    // the guidanceEnabled gate, so users who had explicitly turned Asterisk
    // off still moved global ranking. Exposure is now counted from the r19
    // examined-slot beacon (POST /api/impressions), where the identity is
    // known and one person counts once. BRAIN_POPULARITY_DEDUP=0 restores
    // this write together with the raw-count scoring, as one behaviour.
    const writes = [];
    if (!popularityDedupEnabled()) {
      writes.push(bumpPopularity(ids.map((id) => ({ id, imp: 1 }))));
    }
    if (guidanceEnabled) {
      writes.push(mutateProfile(userId, (current) => {
        const base = current && Object.keys(current).length ? current : profileBeforeCorrections;
        const { profile: decayed } = applyTimeDecay(base);
        // (r14) attribution: count this serve's bridges on the profile.
        const bridgeCounts = {};
        for (const it of items) if (it._bridge) bridgeCounts[it._bridge] = (bridgeCounts[it._bridge] || 0) + 1;
        // (r19) Serving is not seeing. Served counts are diagnostic; the
        // tuning denominator (bridgeStats) is fed by POST /api/impressions
        // with the slots the user actually examined. A client that never
        // reports examination still accrues evidence here — otherwise a
        // JS-disabled or beacon-blocked user could never tune at all — but
        // that fallback is declared, and examinationCoverage reports it.
        const served = markBridgeServed(markSeen(decayed, ids), bridgeCounts);
        if (!examinedImpressionsEnabled()) return markBridgeImpressions(served, bridgeCounts);
        // Remember what this serve WAS, so the examination beacon is
        // attributed from the server's record rather than the client's word.
        return recordServe(served, serveId, items);
      }));
    }
    await Promise.all(writes);
  } catch {}

  return NextResponse.json({
    userId,
    serveId,
    epsilonActive,
    epsilonAuto,
    safeMode,
    guidanceEnabled,
    boardSeeded: !!boardVec,
    craving: cravingActive ? craving : null,
    split,
    // (r16) honest influence: whether tuning shaped THIS page's blend
    // (safety modes suppress it even when computed), and the tuned weights.
    tuning: { active: !!tuned && !epsilonActive && !safeMode, split: tuned },
    zones,
    count: items.length,
    items: items.map(publicProduct).filter(Boolean),
  });
}
