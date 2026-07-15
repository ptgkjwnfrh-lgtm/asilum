// app/api/train/route.js
// POST /api/train
// Body: { user, prompt }
// Cold-starts or reshapes a user's profile from a free-text prompt / moodboard
// caption, persists it, and returns the resulting profile. The prompt blends
// into long-term taste and REPLACES session interest — an explicit prompt is
// the strongest statement of what the user wants right now.

import { NextResponse } from "next/server";
import { coldStart, migrateProfile } from "../../../lib/brain/index.js";
import { mutateProfile } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 16 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 400) : "";

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  const quota = await consumeRateLimit({ scope: "train", subject: userId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }
  const fresh = coldStart(prompt).profile;
  const profile = await mutateProfile(userId, (current) => {
    const next = migrateProfile(current);
    for (const k in fresh) {
      if (!fresh[k]) continue;
      next.long[k] = next.long[k] ? (next.long[k] + fresh[k]) / 2 : fresh[k];
    }
    next.session = { ...fresh };
    return next;
  });
  return NextResponse.json({ userId, profile });
}
