// app/api/reset/route.js
// POST /api/reset { user }
// FULL AMNESIA: wipes the learned taste profile (long + session vectors,
// streaks, fatigue, forgetting log, feed rotation memory). Boards, orders,
// and the co-engagement graph survive — this deletes taste, not history.
// The client gates this behind a two-step confirmation.

import { NextResponse } from "next/server";
import { saveProfile, withUserLock } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  await withUserLock(userId, () => saveProfile(userId, {}));
  return NextResponse.json({ userId, reset: true });
}
