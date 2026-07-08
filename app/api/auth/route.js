// app/api/auth/route.js
// POST /api/auth { user: <account uid>, from: <anonymous device uid> }
// One-time identity adoption on first sign-in: the anonymous device profile
// and moodboards move under the account uid ("sb-<supabase user id>"), so a
// user keeps the taste they trained before creating an account.
// Guards: only fills an EMPTY account profile / board list — signing in on a
// second device never clobbers an account that already has taste or boards.
// NOTE (Day 4+ hardening): like every route here, this trusts the client's
// uid. Verifying the Supabase JWT server-side is the follow-up.

import { NextResponse } from "next/server";
import {
  getProfile, saveProfile, getBoards, createBoard, addBoardItem, withUserLock,
} from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = null; }
  const user = body && typeof body.user === "string" ? body.user.slice(0, 80) : "";
  const from = body && typeof body.from === "string" ? body.from.slice(0, 80) : "";
  if (!user || !from || user === from) {
    return NextResponse.json({ error: "user and from (distinct) required" }, { status: 400 });
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
