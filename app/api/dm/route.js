// app/api/dm/route.js
// The mail desk. One route, op-dispatched.
//
// FEATURE F IS ABSENT UNLESS MESSAGING_ENABLED=1. FEATURE-FLAGS.md is explicit
// that "absent" means absent — a 404, not a 200 carrying a "coming soon"
// state. A flag that answers politely is a feature that shipped.
//
// Every path resolves the caller through resolveRequestUser and then
// accountIdFromIdentity: DMs are impossible for signed-out users by
// construction (ADR-002), so a device identity is refused rather than served
// an empty inbox that looks like "no messages".

import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../lib/identity.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { describeRefusal, messagingEnabled, normalizeBody } from "../../../lib/dm.js";
import {
  MessageRefused, MessagingUnavailable,
  acceptRequest, blockAccount, declineRequest, findAddressees, handlesFor, iBlocked,
  listBlocks, listFolder, markRead, openConversation, readDmsOpen, readThread,
  peerActivity, pingTyping, clearTyping, readActivitySignals, resolveAddressee,
  sendMessage, setActivitySignals, setDmsOpen, setMediaConsent, unblockAccount,
  unreadSummary,
} from "../../../lib/db/dm.js";

export const dynamic = "force-dynamic";

const absent = () => NextResponse.json({ error: "not found" }, { status: 404 });

/** Map a store failure onto a response without leaking which law fired. */
function failure(error, extra = {}) {
  if (error instanceof MessagingUnavailable) {
    // Honest: the desk cannot be read right now. NOT an empty inbox — showing
    // "no messages" when the store is unreachable is a false statement.
    return NextResponse.json({ error: "the mail desk is unavailable" }, { status: 503 });
  }
  if (error instanceof MessageRefused) {
    return NextResponse.json({ delivered: false, ...describeRefusal(error.code, extra) }, { status: 409 });
  }
  return NextResponse.json({ error: "could not complete that" }, { status: 500 });
}

async function caller(req, claimed) {
  const user = await resolveRequestUser(req, claimed);
  return user ? accountIdFromIdentity(user) : null;
}

export async function GET(req) {
  if (!messagingEnabled()) return absent();
  const url = new URL(req.url);
  const me = await caller(req, url.searchParams.get("user") || "");
  if (!me) return NextResponse.json({ error: "sign in to use messages" }, { status: 401 });

  const op = url.searchParams.get("op") || "summary";
  try {
    if (op === "summary") {
      const counts = await unreadSummary(me);
      return NextResponse.json({
        ...counts,
        dmsOpen: await readDmsOpen(me),
        activitySignals: await readActivitySignals(me),
      });
    }
    if (op === "inbox") {
      const folder = ["inbox", "requests", "archived"].includes(url.searchParams.get("folder"))
        ? url.searchParams.get("folder") : "inbox";
      const page = await listFolder(me, { folder, cursor: url.searchParams.get("cursor") || "" });
      // Render counterparties by HANDLE. The uuid never leaves the server: it
      // is the addressing key, and handing it to the client is handing over
      // the thing that makes the search skippable.
      const handles = await handlesFor(page.items.map((i) => i.otherId));
      return NextResponse.json({
        ...page,
        items: page.items.map(({ otherId, ...rest }) => ({
          ...rest, handle: handles[otherId] || null,
        })),
      });
    }
    if (op === "thread") {
      const id = url.searchParams.get("c") || "";
      const thread = await readThread(me, id, { before: url.searchParams.get("before") || null });
      // A non-member gets exactly what a nonexistent conversation gets, so the
      // endpoint cannot be used to discover that a thread exists.
      if (!thread) return absent();
      return NextResponse.json(thread);
    }
    if (op === "find") {
      // Searching is cheap for us and valuable to an enumerator, so it gets
      // its own tight bucket separate from every other read.
      const quota = await consumeRateLimit({
        scope: "dm-find", subject: requestSubject(req, me), limit: 60, windowMs: 60 * 60 * 1000,
      });
      if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
      return NextResponse.json({ people: await findAddressees(me, url.searchParams.get("q") || "") });
    }
    if (op === "activity") {
      // Polled every few seconds while a thread is open, so it is one small
      // read and nothing else. Its own generous bucket: throttling this into
      // failure would make the indicator lie rather than go quiet.
      const quota = await consumeRateLimit({
        scope: "dm-activity", subject: requestSubject(req, me), limit: 1200, windowMs: 60 * 60 * 1000,
      });
      if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
      return NextResponse.json(await peerActivity(me, url.searchParams.get("c") || ""));
    }
    if (op === "blocks") return NextResponse.json({ blocks: await listBlocks(me) });
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req) {
  if (!messagingEnabled()) return absent();
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body || {};
  const me = await caller(req, String(body.user || ""));
  if (!me) return NextResponse.json({ error: "sign in to use messages" }, { status: 401 });

  const op = String(body.op || "");
  // Sending is the abusable op and gets its own tighter bucket; the rest share
  // a looser one so a burst of reads cannot exhaust the ability to block.
  const quota = await consumeRateLimit({
    scope: op === "send" ? "dm-send" : "dm-act",
    subject: requestSubject(req, me),
    limit: op === "send" ? 120 : 240,
    windowMs: 60 * 60 * 1000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  try {
    if (op === "send") {
      const text = normalizeBody(body.body);
      if (!text) return NextResponse.json({ error: "nothing to send" }, { status: 400 });

      let conversationId = String(body.conversationId || "");
      // ADDRESSED BY HANDLE, NEVER BY UUID. Accepting a raw account id would
      // let a caller message any account whose id they can produce — the
      // search's whole enumeration defence, skipped in one field. The handle
      // is resolved through the same predicate the search applies, so a handle
      // kept from before a block does not still work.
      let them = null;
      if (!conversationId) {
        const handle = String(body.toHandle || "");
        if (!handle) return NextResponse.json({ error: "who to?" }, { status: 400 });
        them = await resolveAddressee(me, handle);
        if (!them) {
          // Deliberately one answer for "no such handle", "they blocked you",
          // "you blocked them" and "their door is shut".
          return NextResponse.json(
            { delivered: false, reason: "not-reachable",
              message: "this person is not reachable right now." }, { status: 409 });
        }
        const convo = await openConversation(me, them);
        conversationId = convo.id;
      }
      try {
        const sent = await sendMessage({
          conversationId, senderId: me, body: text,
          clientOperationId: body.clientOperationId ? String(body.clientOperationId) : null,
        });
        return NextResponse.json({ delivered: true, conversationId, ...sent });
      } catch (error) {
        // If the refusal is MY OWN block, say so and offer the undo. Only
        // someone else's reasons are collapsed — see lib/dm.js.
        let mine = false;
        if (error instanceof MessageRefused && them) {
          mine = await iBlocked(me, them).catch(() => false);
        }
        return failure(error, { callerBlockedThem: mine });
      }
    }

    if (op === "accept") {
      return NextResponse.json({ ok: await acceptRequest(me, String(body.conversationId || "")) });
    }
    if (op === "decline") {
      // Declining blocks by default, and the response SAYS it did, so the UI
      // can tell the person what it just created on their behalf.
      const blocked = body.block !== false;
      const ok = await declineRequest(me, String(body.conversationId || ""), { block: blocked });
      return NextResponse.json({ ok, blocked: ok && blocked });
    }
    if (op === "read") {
      await markRead(me, String(body.conversationId || ""), body.upTo);
      return NextResponse.json({ ok: true });
    }
    if (op === "block") {
      await blockAccount(me, String(body.accountId || ""));
      return NextResponse.json({ ok: true });
    }
    if (op === "unblock") {
      return NextResponse.json({ ok: await unblockAccount(me, String(body.accountId || "")) });
    }
    if (op === "consent") {
      // The per-conversation "receive images and videos" toggle. Recorded now;
      // nothing can send an attachment yet (OWNER-DECISIONS #3).
      const ok = await setMediaConsent(me, String(body.conversationId || ""), body.allow === true);
      return NextResponse.json({ ok, allow: body.allow === true });
    }
    if (op === "typing") {
      // A ping, not a state machine. "Stopped" is the absence of a refresh.
      const ok = body.on === false
        ? (await clearTyping(me, String(body.conversationId || "")), true)
        : await pingTyping(me, String(body.conversationId || ""));
      return NextResponse.json({ ok });
    }
    if (op === "settings") {
      try {
        if (typeof body.activitySignals === "boolean") {
          await setActivitySignals(me, body.activitySignals);
        }
        if (typeof body.dmsOpen === "boolean") await setDmsOpen(me, body.dmsOpen);
        return NextResponse.json({
          ok: true,
          dmsOpen: await readDmsOpen(me),
          activitySignals: await readActivitySignals(me),
        });
      } catch (error) {
        // A business trying to close its door is refused by the v40 trigger.
        return failure(error);
      }
    }
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
