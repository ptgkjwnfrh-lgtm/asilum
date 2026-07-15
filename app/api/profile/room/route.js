// app/api/profile/room/route.js — MySpace-inspired profile rooms (Feature E).
// GET  ?handle=<claimed>  → the PUBLIC room: published + moderation-visible
//      only, visible modules only. Identity optional (curated-shaped read).
// GET  ?user=             → the OWNER's room incl. drafts + the editor
//      catalogs. Rooms are a social/trust domain (ADR-002): only verified
//      sb- accounts hold one — device identities get an honest
//      {available:false} gate, never a fake room.
// POST { user, op, ... }  →
//      op "room.set"   { handle?, themeId?, published? }
//      op "module.set" { module, visible?, position?, content? }
//        statement content runs the sanitize + screen pipeline; a tripped
//        screen parks the room under_review and files a moderation task.
//      op "report"     { handle, reason? } — any verified identity may
//        report a public room; a task is filed, nothing auto-hides.

import { NextResponse } from "next/server";
import { resolveRequestUser, accountIdFromIdentity } from "../../../../lib/identity.js";
import {
  profileRoomsEnabled, ownRoomView, publicRoomView,
  validateHandle, sanitizeStatement, screenStatement, validateAnthem, MODULE_IDS,
} from "../../../../lib/profile/rooms.js";
import {
  upsertProfileRoom, setProfileModule, setProfileRoomModeration,
  getProfileRoom, getProfileRoomByHandle, createModerationTask,
} from "../../../../lib/db/production.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../../lib/security/request.js";
import { readJsonRequest } from "../../../../lib/security/json.js";
import { recordEvent } from "../../../../lib/db/index.js";
import { EVENTS } from "../../../../lib/events/index.js";

// Room writes land in the canonical events ledger (audit trail, not a taste
// signal). Write-then-event: an event failure fails the request loudly and
// the idempotent upserts make the retry safe.
function roomEvent(user, payload) {
  return recordEvent({ userId: user, type: EVENTS.USER_UPDATED_PROFILE_ROOM, payload, at: Date.now() });
}

export const dynamic = "force-dynamic";

function disabled() {
  return NextResponse.json({ error: "profile rooms are not enabled on this deployment" }, { status: 503 });
}

const SIGN_IN_GATE = {
  available: false,
  reason: "profile rooms belong to signed-in accounts — sign in on PROFILE to claim yours",
};

export async function GET(req) {
  if (!profileRoomsEnabled()) return disabled();
  const { searchParams } = new URL(req.url);
  const handle = (searchParams.get("handle") || "").toLowerCase();
  const user = await resolveRequestUser(req, searchParams.get("user") || "").catch(() => null);
  const quota = await consumeRateLimit({
    scope: "profile-room-read", subject: user || requestSubject(req), limit: 120, windowMs: 60_000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  if (handle) {
    const room = await publicRoomView(handle);
    return room
      ? NextResponse.json({ room })
      : NextResponse.json({ error: "no room at that handle" }, { status: 404 });
  }

  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json(SIGN_IN_GATE);
  const view = await ownRoomView(accountId);
  return NextResponse.json({ available: true, ...view },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

async function screenAndFlag(accountId, text) {
  const flags = screenStatement(text);
  if (!flags.length) return null;
  await setProfileRoomModeration(accountId, "under_review");
  await createModerationTask({
    kind: "profile-content", subjectType: "profile_room", subjectId: accountId,
    payload: { flags, excerpt: text.slice(0, 160) }, priority: "high",
  });
  return flags;
}

export async function POST(req) {
  if (!profileRoomsEnabled()) return disabled();
  const parsed = await readJsonRequest(req, { maxBytes: 16 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  if (body.op === "report") {
    const quota = await consumeRateLimit({ scope: "profile-room-report", subject: user, limit: 5, windowMs: 60 * 60 * 1000 });
    if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
    const room = await getProfileRoomByHandle(String(body.handle || "").toLowerCase());
    if (!room || !room.published || room.moderationStatus !== "visible") {
      return NextResponse.json({ error: "no room at that handle" }, { status: 404 });
    }
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : "";
    await createModerationTask({
      kind: "user-report", subjectType: "profile_room", subjectId: room.accountId,
      payload: { handle: room.handle, reason, reportedBy: user }, priority: "normal",
    });
    return NextResponse.json({ reported: true, note: "a human will review this room" });
  }

  // Everything below mutates the caller's OWN room — accounts only.
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json(SIGN_IN_GATE, { status: 403 });
  const quota = await consumeRateLimit({ scope: "profile-room-write", subject: user, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  try {
    if (body.op === "room.set") {
      const patch = {};
      if (body.handle !== undefined) patch.handle = validateHandle(body.handle);
      if (body.themeId !== undefined) patch.themeId = String(body.themeId);
      if (body.published !== undefined) patch.published = !!body.published;
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "handle, themeId, or published required" }, { status: 400 });
      }
      await upsertProfileRoom(accountId, patch);
      await roomEvent(user, { op: "room.set", fields: Object.keys(patch) });
      return NextResponse.json({ ...(await ownRoomView(accountId)), available: true });
    }

    if (body.op === "module.set") {
      const module = String(body.module || "");
      if (!MODULE_IDS.includes(module)) {
        return NextResponse.json({ error: "unknown module" }, { status: 400 });
      }
      const patch = {};
      if (body.visible !== undefined) patch.visible = !!body.visible;
      if (body.position !== undefined) patch.position = body.position;
      let flagged = null;
      if (body.content !== undefined) {
        if (module === "statement") {
          const text = sanitizeStatement(body.content?.text ?? "");
          patch.content = { text };
        } else if (module === "soundtrack") {
          patch.content = { entities: validateAnthem(body.content?.entities ?? []) };
        } else {
          return NextResponse.json({ error: `${module} derives live and takes no content` }, { status: 400 });
        }
      }
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "visible, position, or content required" }, { status: 400 });
      }
      if (!(await getProfileRoom(accountId))) await upsertProfileRoom(accountId, {});
      await setProfileModule(accountId, module, patch);
      await roomEvent(user, { op: "module.set", module, fields: Object.keys(patch) });
      if (module === "statement" && patch.content) {
        flagged = await screenAndFlag(accountId, patch.content.text);
      }
      return NextResponse.json({
        ...(await ownRoomView(accountId)), available: true,
        ...(flagged ? { flagged, note: "your draft is saved; the public room is paused for a human review" } : {}),
      });
    }

    return NextResponse.json({ error: "op must be room.set, module.set, or report" }, { status: 400 });
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.message === "handle-taken") {
      return NextResponse.json({ error: "that handle is already claimed" }, { status: 409 });
    }
    if (error?.message === "room-required") {
      return NextResponse.json({ error: "claim your room first" }, { status: 400 });
    }
    throw error;
  }
}
