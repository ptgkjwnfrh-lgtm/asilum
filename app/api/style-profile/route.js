// app/api/style-profile/route.js
// GET  ?user= → the user's style profile (rebuilt transparently when stale).
// POST { user } → force a rebuild now.
// Identity: resolveRequestUser proof — you can only read/rebuild your own.
// The profile is deterministic local aggregation today (sources reported in
// the row); a model rewrites taste_summary later via the style-profile seam.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { getUserStyleProfile, rebuildUserStyleProfile } from "../../../lib/ai/styleProfile.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "style-profile-read", subject: user, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const profile = await getUserStyleProfile(user);
  if (!profile) return NextResponse.json({ error: "profile unavailable" }, { status: 500 });
  return NextResponse.json({ profile });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "style-profile-rebuild", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const result = await rebuildUserStyleProfile(user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ profile: result.profile });
}
