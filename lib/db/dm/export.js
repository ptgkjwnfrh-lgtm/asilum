// lib/db/dm/export.js — HANDING SOMEONE THE RECORD OF THEIR OWN
// CONVERSATIONS (CONSTITUTION §6).
//
// OWNER RULING, 23 August: two people should have records. A conversation is
// two people's history, so the alternative to exporting it is a record only
// the company holds. Both sides are in it, so both sides may have it — and
// that is why the mail desk is the one thing that is EXPORTED AND RETAINED,
// rather than the usual "what we delete is what we show you".
//
// Not gated on messagingEnabled(). An access right is not a feature: the flag
// decides whether the desk is open, not whether a person may have the record
// of what was already said there.
//
// It reports WHICH cap it hit rather than deriving truncation from row counts.
// Conversations are limited first and messages read only for the survivors, so
// an account past the conversation cap loses whole conversations' worth of
// messages while the message list sits far below its own cap — `length >= cap`
// answered `false` and the export looked complete.

import { accountId, pool } from "./core.js";
import { handlesFor } from "./people.js";
import { mediaConsentGiven } from "./settings.js";
import { visibleBody } from "./threads.js";

/**
 * ONE PERSON'S RECORD OF EVERY CONVERSATION THEY WERE IN.
 *
 * OWNER RULING, 23 August: **two people should have records.** The question
 * left open by #395 was whether a DM export ships at all, given that a
 * conversation is two people's record and one side asking for a copy is asking
 * for words the other side wrote. The answer is that both sides are IN it, so
 * both sides get it — a person's own conversation is theirs to keep, and the
 * alternative is a record only the company holds.
 *
 * Four rules this obeys, none of them optional:
 *
 * 1. IT SHOWS EXACTLY WHAT THE THREAD SHOWS. Bodies come through
 *    `visibleBody`, the same function readThread uses — so a moderator's
 *    redaction stays redacted, an unsent message stays withdrawn, and a
 *    message hidden from the recipient does not reappear in their download.
 *    An export is a copy of the record, not a way around it.
 * 2. THE ACCOUNT UUID NEVER LEAVES THE SERVER (law 7). Counterparties are
 *    named by handle, and someone who never published a room has none —
 *    `with: null`, and the conversation is still theirs to read.
 * 3. NO SILENT CAPS (§6). Every list reports the cap it was read under, so the
 *    caller can say whether it truncated in the same shape as every other
 *    domain in the export.
 * 4. PRESENCE IS NOT A RECORD. Typing rows expire in six seconds and say
 *    nothing about what was said. They are not exported, and dm_typing stays
 *    declared-absent with that as its reason.
 */
export async function exportMessagesFor(meRaw, caps = {}, { queryTarget = null } = {}) {
  const me = accountId(meRaw);
  // GARBAGE IS NOT A CAP. `Math.max(1, …)` would turn a negative into a cap of
  // ONE — a truncation to a single message, arrived at by accident, which is
  // precisely the silent cap §6 forbids. Anything that is not a positive
  // finite number means "not specified", and the default applies.
  const capOf = (value, fallback) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const conversationCap = capOf(caps.conversations, 500);
  const messageCap = capOf(caps.messages, 5000);
  const blockCap = capOf(caps.blocks, 500);
  // A THIRD CAP, IN BYTES, because the row cap alone can build a response that
  // cannot be delivered. 5000 messages x the 2000-character body limit is ~10MB
  // of bodies before anything else in the export, and a serverless response
  // body has a ceiling well under that. The export would then fail for exactly
  // the people whose history is large enough to need it — and the route's catch
  // does not see a response-size rejection, so they would get a failure with no
  // explanation rather than a truncated file that says it was truncated.
  const byteCap = capOf(caps.bytes, 2_000_000);
  // `queryTarget` for the same reason exportPersonalizationData takes one: a
  // caller running the whole export inside one transaction must not have this
  // read silently escape to a different connection.
  const p = queryTarget || await pool();

  const convos = await p.query(
    `SELECT c.id, c.state, c.created_at, c.last_activity_at,
            (c.opened_by = $1) AS opened_by_me,
            CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END AS other_id,
            part.folder, part.joined_at, part.last_read_message_id,
            (part.muted_at IS NOT NULL) AS muted,
            part.media_consent_at, part.media_consent_revoked_at
       FROM dm_participants part
       JOIN dm_conversations c ON c.id = part.conversation_id
      WHERE part.account_id = $1
      ORDER BY c.last_activity_at DESC
      LIMIT $2`, [me, conversationCap]);

  const ids = convos.rows.map((r) => r.id);
  const messages = ids.length
    ? await p.query(
        `SELECT id, conversation_id, sender_account_id, body, created_at,
                unsent_at, redacted_at, hidden_for_recipient
           FROM dm_messages
          WHERE conversation_id = ANY($1::uuid[])
          ORDER BY id DESC
          LIMIT $2`, [ids, messageCap])
    : { rows: [] };

  // Reactions ride with the messages they are on, and only for the page of
  // messages actually exported — a reaction without its message is noise.
  // Newest-first, so a byte cut drops the OLDEST — the same end the row cap
  // drops, which keeps `oldestExportedMessageId` meaningful for both.
  let budget = byteCap;
  let byteCut = false;
  const kept = [];
  for (const m of messages.rows) {
    const cost = (m.body ? Buffer.byteLength(m.body, "utf8") : 0) + 120;   // + the envelope
    if (kept.length && budget - cost < 0) { byteCut = true; break; }
    budget -= cost;
    kept.push(m);
  }
  messages.rows = kept;

  const messageIds = messages.rows.map((m) => m.id);
  const reactions = messageIds.length
    ? await p.query(
        `SELECT message_id, emoji, (account_id = $1) AS mine
           FROM dm_reactions WHERE message_id = ANY($2::bigint[])
          ORDER BY message_id DESC, emoji`, [me, messageIds])
    : { rows: [] };
  const marksByMessage = new Map();
  for (const r of reactions.rows) {
    const key = String(r.message_id);
    if (!marksByMessage.has(key)) marksByMessage.set(key, []);
    marksByMessage.get(key).push({ emoji: r.emoji, mine: r.mine });
  }

  // The conversation travels with each block for the reason listBlocks carries
  // it: a decline blocks whoever knocked, knocking needs no published room, so
  // in the common case the handle is NULL. Without the conversation id a heavy
  // user's export is a list of `{handle: null, source: "decline"}` — a record
  // they can neither identify nor act on.
  const blocks = await p.query(
    `SELECT b.blocked_account_id, b.source, b.created_at, c.id AS conversation_id
       FROM dm_blocks b
       LEFT JOIN dm_conversations c
         ON c.lo_account_id = LEAST(b.blocker_account_id, b.blocked_account_id)
        AND c.hi_account_id = GREATEST(b.blocker_account_id, b.blocked_account_id)
      WHERE b.blocker_account_id = $1
      ORDER BY b.created_at DESC LIMIT $2`, [me, blockCap]);

  const settings = await p.query(
    `SELECT dms_open, activity_signals, updated_at FROM dm_settings WHERE account_id=$1`, [me]);

  // One handle lookup for every counterparty and every blocked person. The
  // uuid is the key here, and it stops here.
  const handles = await handlesFor([
    ...convos.rows.map((r) => r.other_id),
    ...blocks.rows.map((r) => r.blocked_account_id),
  ]);

  return {
    conversations: convos.rows.map((r) => ({
      id: r.id,
      with: handles[r.other_id] || null,
      // NO `state`. It is the SHARED column, and the route strips it from the
      // inbox for exactly this reason: it names "declined" to the person who
      // was declined, which is the fact P0001 and P0002 are collapsed to hide.
      // An export is not a way around that. The reader's OWN decision is still
      // here — a decline writes a `source: "decline"` block, and their blocks
      // are below — so nothing of theirs is lost; only the other person's
      // answer about them is withheld, the same way the desk withholds it.
      openedByMe: r.opened_by_me,
      folder: r.folder,
      muted: r.muted,
      mediaConsent: {
        given: mediaConsentGiven(r.media_consent_at, r.media_consent_revoked_at),
        grantedAt: r.media_consent_at,
        revokedAt: r.media_consent_revoked_at,
      },
      lastReadMessageId: Number(r.last_read_message_id),
      joinedAt: r.joined_at,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
    })),
    messages: messages.rows.map((m) => ({
      id: Number(m.id),
      conversationId: m.conversation_id,
      mine: m.sender_account_id === me,
      // The SAME rule the thread renders by — see visibleBody.
      body: visibleBody(m, me),
      unsent: Boolean(m.unsent_at),
      redacted: Boolean(m.redacted_at),
      hidden: m.hidden_for_recipient,
      reactions: marksByMessage.get(String(m.id)) || [],
      at: m.created_at,
    })),
    blocks: blocks.rows.map((b) => ({
      handle: handles[b.blocked_account_id] || null,
      conversationId: b.conversation_id,
      source: b.source,
      at: b.created_at,
    })),
    settings: settings.rows[0]
      ? {
          dmsOpen: settings.rows[0].dms_open,
          activitySignals: settings.rows[0].activity_signals,
          updatedAt: settings.rows[0].updated_at,
        }
      : null,
    caps: { conversations: conversationCap, messages: messageCap, blocks: blockCap, bytes: byteCap },
    // WHICH CAP BIT, not merely whether one did.
    //
    // TWO caps feed one list: conversations are limited first, and messages
    // are then read only for the conversations that survived. So an account
    // with 620 conversations of four messages each loses EVERY message of 120
    // conversations while the message list is nowhere near its own 5000 — and
    // the caller, computing `rows.length >= cap` on each list separately, said
    // `items.truncated: false`. §6 forbids a silent cap, and the field that
    // exists to satisfy §6 was the one making the false statement.
    truncated: {
      conversations: convos.rows.length >= conversationCap,
      // A message list is short EITHER because the message cap bit or because
      // the conversations it would have come from were cut away.
      messages: messages.rows.length >= messageCap || byteCut
        || convos.rows.length >= conversationCap,
      blocks: blocks.rows.length >= blockCap,
    },
    // WHERE THE CUT FELL — and only when it is the MESSAGE cap that cut it.
    // When the CONVERSATION cap bit, the missing messages are not "everything
    // older than this id": they are whole conversations from anywhere in the
    // history, and an id would describe the loss wrongly. `truncated` above
    // says which cap it was; this stays null unless the answer is meaningful.
    oldestExportedMessageId: (messages.rows.length >= messageCap || byteCut) && messages.rows.length
      ? Number(messages.rows[messages.rows.length - 1].id)
      : null,
  };
}
