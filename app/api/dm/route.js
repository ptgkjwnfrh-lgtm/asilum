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
import {
  consumeGlobalBudget, consumeRateLimit, rateLimitResponse,
} from "../../../lib/security/rateLimit.js";
// `me || requestSubject(req)` is the house pattern (app/api/discover/rails).
// requestSubject takes ONE argument: `requestSubject(req, me)` silently
// DISCARDED the account and keyed every DM quota on the device cookie, so one
// account on three devices got three times the budget and the account was
// never the unit being limited. JS drops extra arguments without a word.
import { requestSubject } from "../../../lib/security/request.js";
import {
  describeRefusal, messagingEnabled, normalizeBody, rateBucketFor, readBucketFor,
} from "../../../lib/dm.js";
import {
  MessageRefused, MessagingUnavailable,
  acceptRequest, blockAccount, declineRequest, findAddressees, handlesFor, iBlocked,
  listBlocks, listFolder, markRead, openConversation, readDmsOpen, readThread,
  peerActivity, peerOf, peerOfMessage, pingTyping, clearTyping, react,
  reactionKinds, reactionsFor, recipientFollowsSender,
  readActivitySignals, resolveAddressee, unsendMessage,
  sendMessage, setDmSettings, setMediaConsent, setMuted,
  unblockByConversation, unblockByHandle,
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
  // EVERY read is bounded, and every read draws the aggregate breaker.
  //
  // Four of six GET ops had neither: `summary`, polled by every signed-in
  // reader on a 45-second timer; `inbox`, a keyset page carrying a correlated
  // unread count AND a correlated preview subquery per row; `thread`, a member
  // probe plus a 101-row read plus a reactions aggregate plus the palette; and
  // `blocks`. Only `find` and `activity` were limited — bounded because
  // somebody reasoned about enumeration and about polling, not because the
  // line had been drawn at "every op".
  //
  // The global budget is the half that matters here: per-subject quotas bound
  // ONE caller, and a flood of fresh identities shares no subject. Every other
  // expensive surface in this codebase draws one; the mail desk drew none.
  const readBucket = readBucketFor(op);
  const readQuota = await consumeRateLimit({
    scope: readBucket.scope,
    subject: me || requestSubject(req),
    limit: readBucket.limit,
    windowMs: 60 * 60 * 1000,
  });
  if (!readQuota.allowed) return NextResponse.json(rateLimitResponse(readQuota), { status: 429 });
  const readBudget = await consumeGlobalBudget("dm-read");
  if (!readBudget.allowed) {
    return NextResponse.json(rateLimitResponse(readBudget), {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(readBudget.retryAfterMs / 1000))) },
    });
  }
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
      //
      // `state` is stripped for the same class of reason. It is the SHARED
      // column, so the opener's own inbox row carried the word "declined" —
      // naming outright the fact describeRefusal collapses P0001 and P0002 to
      // hide. Nothing in the panel reads it: the request controls key on the
      // reader's own `folder`, which is per-side and says only where the
      // thread sits for them.
      const handles = await handlesFor(page.items.map((i) => i.otherId));
      return NextResponse.json({
        ...page,
        items: page.items.map(({ otherId, state, ...rest }) => ({
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
      // Reactions ride with the thread rather than a second round-trip: they
      // are per-message and useless without it.
      const reactions = await reactionsFor(thread.messages.map((m) => m.id), me);
      return NextResponse.json({ ...thread, reactions, palette: await reactionKinds() });
    }
    if (op === "find") {
      // Its tight bucket is in the table above: searching is cheap for us and
      // valuable to an enumerator.
      return NextResponse.json({ people: await findAddressees(me, url.searchParams.get("q") || "") });
    }
    if (op === "activity") {
      // Polled every few seconds while a thread is open, so it is one small
      // read and nothing else. Its own generous bucket in the table above:
      // throttling this into failure would make the indicator lie rather than
      // go quiet.
      // `reciprocal` is the store's own account of WHY a null is null, and it
      // does not go on the wire: a payload that names the reason defeats the
      // indistinguishability the nulls exist to provide. The panel never read
      // it — it renders `typing` and `readUpTo` and nothing else.
      const { reciprocal, ...activity } = await peerActivity(me, url.searchParams.get("c") || "");
      return NextResponse.json(activity);
    }
    if (op === "blocks") {
      // Projected exactly like the inbox is: HANDLE and the conversation id,
      // never the account uuid. The store carries the uuid because it is the
      // key; the wire carries the two things a client can address with. A
      // block against someone who never published a room has no handle — most
      // decline-blocks are exactly that, since knocking requires no room of
      // your own — so the conversation id is what names them.
      const blocks = await listBlocks(me);
      const handles = await handlesFor(blocks.map((b) => b.accountId));
      return NextResponse.json({
        blocks: blocks.map(({ accountId, ...rest }) => ({
          ...rest, handle: handles[accountId] || null,
        })),
      });
    }
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
  // THREE BUCKETS, BECAUSE THE SAFETY CONTROLS MUST NOT SHARE ONE WITH THE
  // CHATTER. Sending is the abusable op and keeps its own tight bucket. The
  // rest used to share a single 240/hour — and the two highest-frequency
  // writes in the product were in it: typing fires up to once per 2.5 seconds
  // while composing (1440/hour from one composer) and read fires on every
  // thread open, while block, decline, unblock and mute drew from the same
  // 240. The old comment said "a burst of READS cannot exhaust the ability to
  // block"; the traffic that could exhaust it was writes in that very bucket.
  //
  // So presence gets its own generous bucket and cannot starve the controls a
  // person reaches for when they need them. Throttling presence into failure
  // only makes an indicator lie; throttling a BLOCK is a safety failure.
  //
  // The table itself lives in lib/dm.js so the rule can be tested without a
  // request: a safety rule asserted only by reading this file is not asserted.
  const bucket = rateBucketFor(op);
  const quota = await consumeRateLimit({
    scope: bucket.scope,
    subject: me || requestSubject(req),
    limit: bucket.limit,
    windowMs: 60 * 60 * 1000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  // The write side draws its own aggregate breaker, for the reason the read
  // side does: a per-subject quota does not bound a flood of identities.
  const writeBudget = await consumeGlobalBudget("dm-write");
  if (!writeBudget.allowed) {
    return NextResponse.json(rateLimitResponse(writeBudget), {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(writeBudget.retryAfterMs / 1000))) },
    });
  }

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
        // A THREAD YOU ASKED FOR SHOULD NOT ARRIVE AS A REQUEST. This option
        // existed, was documented and was unit-tested from the first day, and
        // had no caller — the route always took the false default, so someone
        // the recipient explicitly follows still landed in REQUESTS,
        // previewless, under an ACCEPT / DECLINE + BLOCK prompt. It only moves
        // the knock between folders; the one-knock law is untouched.
        const convo = await openConversation(me, them, {
          knownToRecipient: await recipientFollowsSender(them, me).catch(() => false),
        });
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
        //
        // `them` is only assigned on the first-contact-by-handle branch, so
        // this used to be answerable on exactly one path: the FIRST message
        // ever sent to somebody. Every send after that, and every send from the
        // thread view, had nobody to ask about and collapsed the caller's own
        // block into "this person is not reachable right now." — the exact
        // withholding the ambiguity rule exists to prevent, aimed at the only
        // person entitled to the answer. Resolve the counterparty from the
        // conversation when the handle path did not hand one over.
        let mine = false;
        if (error instanceof MessageRefused) {
          const peer = them || await peerOf(me, conversationId).catch(() => null);
          if (peer) mine = await iBlocked(me, peer).catch(() => false);
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
      // By conversation or by handle — never by account uuid, which the client
      // has never held. The conversation form is the one that works for a
      // decline-block against someone with no published room.
      const ok = body.conversationId
        ? await unblockByConversation(me, String(body.conversationId))
        : await unblockByHandle(me, String(body.handle || ""));
      return NextResponse.json({ ok });
    }
    if (op === "consent") {
      // The per-conversation "receive images and videos" toggle. Recorded now;
      // nothing can send an attachment yet (OWNER-DECISIONS #3).
      const ok = await setMediaConsent(me, String(body.conversationId || ""), body.allow === true);
      return NextResponse.json({ ok, allow: body.allow === true });
    }
    if (op === "react") {
      try {
        const result = await react(me, body.messageId, body.emoji ?? null);
        return NextResponse.json({ ok: true, ...result });
      } catch (error) {
        // The reaction path holds a message id rather than a conversation, and
        // it used to call failure() with no `extra` at all — so a reaction
        // refused by the caller's OWN block was described as the other person
        // being unreachable, in a thread the caller is looking at.
        let mine = false;
        if (error instanceof MessageRefused) {
          const peer = await peerOfMessage(me, body.messageId).catch(() => null);
          if (peer) mine = await iBlocked(me, peer).catch(() => false);
        }
        return failure(error, { callerBlockedThem: mine });
      }
    }
    if (op === "unsend") {
      // One answer for "not yours", "no such message" and "already gone":
      // distinguishing them describes a message the caller has no claim to.
      return NextResponse.json({ ok: await unsendMessage(me, body.messageId) });
    }
    if (op === "mute") {
      const muted = await setMuted(me, String(body.conversationId || ""), body.muted !== false);
      return NextResponse.json({ ok: muted !== null, muted });
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
        // ONE act, one transaction. These were two autocommit writes: a
        // business closing its door is refused by the v40 trigger, and by then
        // the activity-signals write had already committed — a 409 with half
        // the request standing and no way for the client to tell which half.
        await setDmSettings(me, {
          activitySignals: typeof body.activitySignals === "boolean" ? body.activitySignals : null,
          dmsOpen: typeof body.dmsOpen === "boolean" ? body.dmsOpen : null,
        });
        return NextResponse.json({
          ok: true,
          dmsOpen: await readDmsOpen(me),
          activitySignals: await readActivitySignals(me),
        });
      } catch (error) {
        // A business trying to close its door is refused by the v40 trigger.
        // The refusal SAYS what stands, because a control that reports a
        // failure without its state leaves the checkbox and the database
        // disagreeing until the next poll.
        const response = failure(error);
        if (response.status !== 409) return response;
        return NextResponse.json({
          ...(await response.json()),
          dmsOpen: await readDmsOpen(me),
          activitySignals: await readActivitySignals(me),
        }, { status: 409 });
      }
    }
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
