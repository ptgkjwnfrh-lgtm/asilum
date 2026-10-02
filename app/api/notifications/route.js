// app/api/notifications/route.js — the in-app notification outbox and its
// one switch (V.2 brief §5). GET ?user=&unread=1 → the person's notices;
// PATCH { user, read: [ids] } marks them read; PATCH { user, prefs:
// { soldLikes } } flips the switch. Identity from proof, as everywhere.
import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { listNotifications, markNotificationsRead, getNotificationPrefs, setNotificationPrefs } from "../../../lib/db/production.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, String(searchParams.get("user") || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const [notifications, prefs] = await Promise.all([
    listNotifications(user, { unreadOnly: searchParams.get("unread") === "1", limit: 50 }),
    getNotificationPrefs(user),
  ]);
  return NextResponse.json({ notifications, prefs, delivery: "in-app only — no push or email channel exists" });
}

export async function PATCH(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "notifications", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const out = {};
  if (Array.isArray(body.read)) out.read = await markNotificationsRead(user, body.read.slice(0, 100));
  if (body.prefs && typeof body.prefs === "object" && "soldLikes" in body.prefs) out.prefs = await setNotificationPrefs(user, { soldLikes: !!body.prefs.soldLikes });
  if (!("read" in out) && !("prefs" in out)) return NextResponse.json({ error: "nothing to do" }, { status: 400 });
  return NextResponse.json(out);
}
