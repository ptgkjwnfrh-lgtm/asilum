// app/api/follow/route.js
// POST /api/follow { user, boardId, follow: true|false }
// Following a moodboard makes its taste a standing influence on your feed —
// the "following" jump-start for users who don't connect a buyer history.
// Followed board ids live on the profile (_meta.follows); the feed route
// blends their vectors into the taste vector.

import { NextResponse } from "next/server";
import { migrateProfile } from "../../../lib/brain/index.js";
import { getProfile, saveProfile, getBoard, withUserLock } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";

export const dynamic = "force-dynamic";

const FOLLOW_CAP = 10;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const boardId = body.boardId || "";
  const follow = body.follow !== false;

  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });
  if (follow) {
    const board = await getBoard(boardId);
    if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  }

  const follows = await withUserLock(userId, async () => {
    const profile = migrateProfile(await getProfile(userId));
    const cur = profile._meta.follows || [];
    profile._meta.follows = follow
      ? [boardId, ...cur.filter((id) => id !== boardId)].slice(0, FOLLOW_CAP)
      : cur.filter((id) => id !== boardId);
    await saveProfile(userId, profile);
    return profile._meta.follows;
  });

  return NextResponse.json({ userId, follows });
}
