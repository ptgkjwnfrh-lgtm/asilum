// app/api/reset/route.js
// POST /api/reset { user }
// FULL AMNESIA: wipes the learned taste profile (long + session vectors,
// streaks, fatigue, forgetting log, feed rotation memory). Boards, orders,
// and the co-engagement graph survive — this deletes taste, not history.
// The client gates this behind a two-step confirmation.

import { NextResponse } from "next/server";
import { mutateProfile } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "profile-reset", subject: userId, limit: 3, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  await mutateProfile(userId, () => ({}));
  return NextResponse.json({
    userId, reset: true,
    retained: ["boards", "event history", "purchase tickets", "co-engagement graph"],
  });
}
