// app/api/profile/route.js
// GET /api/profile?user=<id> — read-only view of the learned profile, used by
// the brain visualization (vizState runs client-side on this payload).

import { NextResponse } from "next/server";
import { getProfile, listEvents } from "../../../lib/db/index.js";
import { tunedSplit, bridgeEngagementFromEvents, explainMix } from "../../../lib/brain/tuning.js";
import { baseSplit } from "../../../lib/brain/bridges.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { withPrivateCache } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

async function handleGET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const quota = await consumeRateLimit({ scope: "profile-read", subject: userId, limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const profile = await getProfile(userId).catch(() => ({}));
  // (r16) the user's bridge mix, in plain words — same computation as the
  // feed route, purely explanatory here.
  let bridgeMix = null;
  try {
    const events = await listEvents(userId, 300);
    const tuned = tunedSplit(
      (profile?._meta && profile._meta.bridgeStats) || {},
      bridgeEngagementFromEvents(events),
      baseSplit()
    );
    bridgeMix = explainMix(baseSplit(), tuned);
  } catch { bridgeMix = null; }
  return NextResponse.json({ userId, profile, bridgeMix });
}

// Personal data: never shared-cacheable (see withPrivateCache).
export const GET = withPrivateCache(handleGET);
