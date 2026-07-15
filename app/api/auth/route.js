// app/api/auth/route.js
// GET issues a server-signed anonymous device identity in an HttpOnly cookie.
// POST adopts that verified device identity into the Supabase account proven by
// the bearer token. The client never chooses the source identity.

import { NextResponse } from "next/server";
import { authConfigured, getAuthenticatedUser } from "../../../lib/supabase.js";
import {
  DEVICE_COOKIE, newDeviceId, signedDeviceValue, verifiedDevice,
} from "../../../lib/identity.js";
import { adoptAccountData } from "../../../lib/db/production.js";
import { rebuildUserStyleProfile } from "../../../lib/ai/styleProfile.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!signedDeviceValue("probe")) {
    return NextResponse.json({ error: "device identity is not configured" }, { status: 503 });
  }
  let uid = verifiedDevice(req);
  if (!uid) {
    uid = newDeviceId();
    const response = NextResponse.json({ uid });
    response.cookies.set(DEVICE_COOKIE, signedDeviceValue(uid), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }
  return NextResponse.json({ uid });
}

export async function POST(req) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "authentication is not configured" }, { status: 503 });
  }
  const from = verifiedDevice(req);
  if (!from) {
    return NextResponse.json({ error: "verified device identity required" }, { status: 401 });
  }
  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "valid bearer token required" }, { status: 401 });
  }
  const user = "sb-" + authUser.id;
  const quota = await consumeRateLimit({ scope: "auth-adopt", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const claimedUser = body && typeof body.user === "string" ? body.user : "";
  if (claimedUser && claimedUser !== user) {
    return NextResponse.json({ error: "account does not match bearer token" }, { status: 403 });
  }

  const adopted = await adoptAccountData(from, user);
  let correctionProfileUpdated = null;
  if (adopted.movedCorrections > 0 || adopted.movedProfile ||
      adopted.movedBoards > 0 || adopted.movedRecords > 0) {
    correctionProfileUpdated = (await rebuildUserStyleProfile(user)).ok;
  }
  return NextResponse.json({ ok: true, ...adopted, correctionProfileUpdated });
}
