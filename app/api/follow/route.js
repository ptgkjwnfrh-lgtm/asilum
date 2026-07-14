// app/api/follow/route.js
// POST /api/follow { user, boardId, follow: true|false }
// Following a moodboard makes its taste a standing influence on your feed —
// the "following" jump-start for users who don't connect a buyer history.
// Followed board ids live on the profile (_meta.follows); the feed route
// blends their vectors into the taste vector.

import { NextResponse } from "next/server";
import { migrateProfile } from "../../../lib/brain/index.js";
import { getBoard, mutateProfile } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

const FOLLOW_CAP = 10;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const boardId = typeof body.boardId === "string" ? body.boardId.slice(0, 80) : "";
  const follow = body.follow !== false;

  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "follow", subject: userId, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  if (follow) {
    const board = await getBoard(boardId);
    if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  }

  let follows = [];
  await mutateProfile(userId, (current) => {
    const profile = migrateProfile(current);
    const cur = profile._meta.follows || [];
    profile._meta.follows = follow
      ? [boardId, ...cur.filter((id) => id !== boardId)].slice(0, FOLLOW_CAP)
      : cur.filter((id) => id !== boardId);
    follows = profile._meta.follows;
    return profile;
  });

  return NextResponse.json({ userId, follows });
}
