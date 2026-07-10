// app/api/profile/route.js
// GET /api/profile?user=<id> — read-only view of the learned profile, used by
// the brain visualization (vizState runs client-side on this payload).

import { NextResponse } from "next/server";
import { getProfile } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const profile = await getProfile(userId).catch(() => ({}));
  return NextResponse.json({ userId, profile });
}
