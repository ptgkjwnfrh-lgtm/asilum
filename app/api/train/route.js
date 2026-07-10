// app/api/train/route.js
// POST /api/train
// Body: { user, prompt }
// Cold-starts or reshapes a user's profile from a free-text prompt / moodboard
// caption, persists it, and returns the resulting profile. The prompt blends
// into long-term taste and REPLACES session interest — an explicit prompt is
// the strongest statement of what the user wants right now.

import { NextResponse } from "next/server";
import { coldStart, migrateProfile } from "../../../lib/brain/index.js";
import { getProfile, saveProfile } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const prompt = body.prompt || "";

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  const profile = migrateProfile(await getProfile(userId));
  const fresh = coldStart(prompt).profile;
  for (const k in fresh) {
    if (!fresh[k]) continue;
    profile.long[k] = profile.long[k] ? (profile.long[k] + fresh[k]) / 2 : fresh[k];
  }
  profile.session = { ...fresh };

  await saveProfile(userId, profile);
  return NextResponse.json({ userId, profile });
}
