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
  listItems, getProfile, saveProfile,
  getEdges, getPopularity, getBoard, bumpPopularity, withUserLock,
} from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const epsilonParam = searchParams.get("epsilon") === "1";
  const q = searchParams.get("q") || "";
  const boardId = searchParams.get("board") || "";

  // Item pool: DB items if available, else the seed catalog.
  let pool = [];
  try { pool = await listItems(1000); } catch { pool = []; }
  if (!pool || pool.length === 0) pool = CATALOG;

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
  let profile = {};
  try { profile = await getProfile(userId); } catch { profile = {}; }
  ({ profile } = applyTimeDecay(profile));
  const hasProfile =
    Object.keys(profile.long || {}).length > 0 ||
    Object.keys(profile.session || {}).length > 0;
  if (!hasProfile && q) profile = coldStart(q).profile;

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

  const { split, items, epsilonActive, epsilonAuto, zones } = buildFeed(
    { profile, epsilonActive: epsilonParam, edges, popularity, boardVec },
    pool
  );

  // Feed rotation memory + impression counting (best-effort). The profile is
  // re-read inside the lock so we never clobber a concurrent interaction, and
  // the clock decay is persisted so idle forgetting sticks.
  const ids = items.map((it) => it.id);
  try {
    await Promise.all([
      withUserLock(userId, async () => {
        const current = await getProfile(userId);
        const base = current && Object.keys(current).length ? current : profile;
        const { profile: decayed } = applyTimeDecay(base);
        await saveProfile(userId, markSeen(decayed, ids));
      }),
      bumpPopularity(ids.map((id) => ({ id, imp: 1 }))),
    ]);
  } catch {}

  return NextResponse.json({
    userId,
    epsilonActive,
    epsilonAuto,
    boardSeeded: !!boardVec,
    split,
    zones,
    count: items.length,
    items,
  });
}
