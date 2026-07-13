// app/api/auth/route.js
// GET issues a server-signed anonymous device identity in an HttpOnly cookie.
// POST adopts that verified device identity into the Supabase account proven by
// the bearer token. The client never chooses the source identity.

import { NextResponse } from "next/server";
import { authConfigured, getAuthenticatedUser } from "../../../lib/supabase.js";
import {
  DEVICE_COOKIE, newDeviceId, signedDeviceValue, verifiedDevice,
} from "../../../lib/identity.js";
import {
  getProfile, saveProfile, getBoards, createBoard, addBoardItem, withUserLock,
} from "../../../lib/db/index.js";
import { adoptUserCorrections } from "../../../lib/db/production.js";
import { rebuildUserStyleProfile } from "../../../lib/ai/styleProfile.js";

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
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }
  return NextResponse.json({ uid });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = null; }
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
  const claimedUser = body && typeof body.user === "string" ? body.user : "";
  if (claimedUser && claimedUser !== user) {
    return NextResponse.json({ error: "account does not match bearer token" }, { status: 403 });
  }

  return withUserLock(user, async () => {
    let movedProfile = false;
    let movedBoards = 0;
    const existing = await getProfile(user);
    if (!existing || Object.keys(existing).length === 0) {
      const old = await getProfile(from);
      if (old && Object.keys(old).length > 0) {
        await saveProfile(user, old);
        movedProfile = true;
      }
    }
    const boards = await getBoards(user);
    if (!boards || boards.length === 0) {
      const oldBoards = await getBoards(from);
      for (const b of oldBoards || []) {
        const nb = await createBoard(user, b.name);
        for (const it of b.items || []) await addBoardItem(nb.id, it);
        movedBoards++;
      }
    }
    const movedCorrections = await adoptUserCorrections(from, user);
    let correctionProfileUpdated = null;
    if (movedCorrections > 0) {
      correctionProfileUpdated = (await rebuildUserStyleProfile(user)).ok;
    }
    return NextResponse.json({
      ok: true, movedProfile, movedBoards, movedCorrections, correctionProfileUpdated,
    });
  });
}
