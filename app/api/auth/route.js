// app/api/auth/route.js
// GET issues a server-signed anonymous device identity in an HttpOnly cookie.
// POST adopts that verified device identity into the Supabase account proven by
// the bearer token. The client never chooses the source identity.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { authConfigured, getAuthenticatedUser } from "../../../lib/supabase.js";
import {
  getProfile, saveProfile, getBoards, createBoard, addBoardItem, withUserLock,
} from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

const DEVICE_COOKIE = "asilum-device";

function deviceSecret() {
  const value = process.env.DEVICE_COOKIE_SECRET || "";
  return value.length >= 32 ? value : null;
}

function signature(uid, secret) {
  return createHmac("sha256", secret).update(uid).digest("hex");
}

function verifiedDevice(req) {
  const secret = deviceSecret();
  const value = req.cookies.get(DEVICE_COOKIE)?.value || "";
  const dot = value.lastIndexOf(".");
  if (!secret || dot < 1) return null;
  const uid = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  if (!/^u-[0-9a-f-]{36}$/.test(uid) || !/^[0-9a-f]{64}$/.test(supplied)) return null;
  const expected = signature(uid, secret);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex")) ? uid : null;
}

export async function GET(req) {
  const secret = deviceSecret();
  if (!secret) {
    return NextResponse.json({ error: "device identity is not configured" }, { status: 503 });
  }
  let uid = verifiedDevice(req);
  if (!uid) {
    uid = "u-" + randomUUID();
    const response = NextResponse.json({ uid });
    response.cookies.set(DEVICE_COOKIE, uid + "." + signature(uid, secret), {
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
    return NextResponse.json({ ok: true, movedProfile, movedBoards });
  });
}
