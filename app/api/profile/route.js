// app/api/profile/route.js
// GET /api/profile?user=<id> — read-only view of the learned profile, used by
// the brain visualization (vizState runs client-side on this payload).

import { NextResponse } from "next/server";
import { getProfile } from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user") || "guest";
  const profile = await getProfile(userId).catch(() => ({}));
  return NextResponse.json({ userId, profile });
}
