// lib/db/dm.js
// The mail desk's store (schema v40). SERVER-ONLY.
//
// THERE IS NO MEMORY-MODE MIRROR, AND THAT IS THE POINT.
//
// Every other lib/db module ships a mem branch so the unit suite can run
// without Postgres. This one refuses instead, and the red team's last finding
// is why: the DM laws are triggers — a block stops delivery both ways, a
// closed passport receives nothing, a business cannot be closed, one knock
// until a reply. A JS mirror written from that same prose is a SECOND
// implementation of the law, and the unit suite would then certify the second
// one while production runs the first. lib/db/production.js:2645 already
// records that exact failure in this codebase: "Every unit test runs mem,
// which is why it survived."
//
// So the laws are proven in tests/postgres-integration.test.js against a real
// database, and mem mode says "unavailable" rather than approximating. A
// developer without Postgres gets an honest refusal; they do not get a
// messaging system that behaves differently from the one users have.

import { getPool } from "./index.js";
import { decodeCursor, encodeCursor, normalizeBody } from "../dm.js";

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MessagingUnavailable extends Error {
  constructor() {
    super("direct messages require Postgres — mem mode does not reimplement the laws");
    this.name = "MessagingUnavailable";
    this.code = "DM_UNAVAILABLE";
  }
}

/** A refusal raised by one of the v40 triggers, carrying its SQLSTATE. */
export class MessageRefused extends Error {
  constructor(code, detail) {
    super(detail || "message refused");
    this.name = "MessageRefused";
    this.code = code;
  }
}

function accountId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!ACCOUNT_UUID.test(raw)) {
    throw new Error("direct messages key on the bare auth uuid (ADR-002)");
  }
  return raw;
}

async function pool() {
  const p = await getPool();
  if (!p) throw new MessagingUnavailable();
  return p;
}

/** The ordered pair, as the CHECK requires. */
function orderPair(a, b) {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

// A per-pair advisory lock. Every write that must read-then-write inside one
// transaction takes it, so two concurrent sends cannot both decide they are
// the first knock. Derived from the ordered pair, so both sides hash to the
// same key regardless of who is sending.
function pairLockKey(lo, hi) {
  let h = 0n;
  for (const ch of lo + hi) h = (h * 131n + BigInt(ch.charCodeAt(0))) % 9223372036854775783n;
  return h.toString();
}

/**
 * Open or fetch the conversation between two accounts.
 * Never creates a duplicate: the UNIQUE(lo,hi) makes a second one
 * unrepresentable, so a race loses the insert and re-reads.
 */
export async function openConversation(meRaw, themRaw, { knownToRecipient = false } = {}) {
  const me = accountId(meRaw);
  const them = accountId(themRaw);
  if (me === them) throw new Error("dm: cannot open a conversation with yourself");
  const { lo, hi } = orderPair(me, them);
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);

    let found = await client.query(
      `SELECT id, state, opened_by FROM dm_conversations WHERE lo_account_id=$1 AND hi_account_id=$2`,
      [lo, hi]);
    if (!found.rows.length) {
      const created = await client.query(
        `INSERT INTO dm_conversations (lo_account_id, hi_account_id, opened_by) VALUES ($1,$2,$3)
         RETURNING id, state, opened_by`, [lo, hi, me]);
      const id = created.rows[0].id;
      // The owner's ruling: a stranger's first contact lands in REQUESTS on
      // the recipient's side only. The sender chose to send it.
      await client.query(
        `INSERT INTO dm_participants (conversation_id, account_id, folder) VALUES ($1,$2,'inbox'),($1,$3,$4)`,
        [id, me, them, knownToRecipient ? "inbox" : "requests"]);
      found = created;
    }
    await client.query("COMMIT");
    const row = found.rows[0];
    return { id: row.id, state: row.state, openedBy: row.opened_by };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send. Idempotent on `clientOperationId`.
 *
 * IDEMPOTENCY IS RESOLVED BY SELECT, BEFORE THE INSERT IS ATTEMPTED, INSIDE
 * THE LOCK — never by catching the unique violation. The block trigger fires
 * BEFORE INSERT, so it raises ahead of any conflict: a retry of a message that
 * was already delivered, from someone who has since been blocked, would be
 * reported as undelivered while it sits in the recipient's thread. That is the
 * red team's finding, and the ordering is the fix. It is also the ordering
 * processed_operations already uses.
 */
export async function sendMessage({ conversationId, senderId, body, clientOperationId = null }) {
  const sender = accountId(senderId);
  const text = normalizeBody(body);
  if (!text) throw new Error("dm: an empty message is not a message");

  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const convo = await client.query(
      `SELECT lo_account_id, hi_account_id FROM dm_conversations WHERE id=$1`, [conversationId]);
    if (!convo.rows.length) throw new Error("dm: no such conversation");
    const { lo_account_id: lo, hi_account_id: hi } = convo.rows[0];
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);

    if (clientOperationId) {
      const already = await client.query(
        `SELECT id, created_at FROM dm_messages
         WHERE sender_account_id=$1 AND client_operation_id=$2`, [sender, clientOperationId]);
      if (already.rows.length) {
        await client.query("COMMIT");
        return { id: already.rows[0].id, at: already.rows[0].created_at, duplicate: true };
      }
    }

    const inserted = await client.query(
      `INSERT INTO dm_messages (conversation_id, sender_account_id, body, client_operation_id)
       VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      [conversationId, sender, text, clientOperationId]);
    // THE INBOX KEY ONLY MOVES FORWARD. It used to be `= now()`, which is the
    // TRANSACTION START time — earlier than the transaction that committed
    // while this one waited on the pair lock, so the row that landed second
    // could stamp the earlier time. listFolder's keyset is
    // `(last_activity_at, id) < (cursor)`, so a key that walks backwards
    // returns a conversation twice and the panel's de-dupe spends its slot.
    //
    // Two changes, and both are needed. The value is the created_at of the
    // message just inserted (v45 defaults it to clock_timestamp(), the wall
    // clock at the statement) rather than a second, unrelated clock reading:
    // the conversation's activity time IS its newest message's time. GREATEST
    // is the belt — no writer, present or future, can move the key back past a
    // write already made.
    await client.query(
      `UPDATE dm_conversations
          SET last_activity_at = GREATEST(last_activity_at, $2::timestamptz)
        WHERE id=$1`, [conversationId, inserted.rows[0].created_at]);
    await client.query("COMMIT");
    return { id: inserted.rows[0].id, at: inserted.rows[0].created_at, duplicate: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // The triggers speak in SQLSTATEs; hand them up intact so the route can
    // describe the refusal without re-deriving why.
    if (["P0001", "P0002", "P0003", "P0004", "42501"].includes(error.code)) {
      throw new MessageRefused(error.code, error.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * One page of a folder. Keyset on the COMPOSITE cursor, never OFFSET, and
 * bounded by the page-1 snapshot so a conversation that becomes active
 * mid-scroll is not skipped — it surfaces at the top on refresh instead.
 *
 * Unread is DERIVED here rather than read from a counter. There is no drift
 * to reconcile because there is nothing to drift.
 */
export async function listFolder(meRaw, { folder = "inbox", cursor = "", limit = 25 } = {}) {
  const me = accountId(meRaw);
  const n = Math.max(1, Math.min(50, Math.trunc(Number(limit)) || 25));
  const parsed = decodeCursor(cursor);
  const snapshot = parsed ? parsed.snapshot : new Date().toISOString();
  const p = await pool();

  const rows = await p.query(
    `SELECT c.id, c.state, c.opened_by, c.last_activity_at,
            CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END AS other_id,
            part.folder,
            (part.muted_at IS NOT NULL) AS muted,
            (SELECT count(*) FROM dm_messages m
              WHERE m.conversation_id = c.id
                AND m.id > part.last_read_message_id
                AND m.sender_account_id <> $1
                AND m.redacted_at IS NULL
                AND m.unsent_at IS NULL
                AND NOT m.hidden_for_recipient)::int AS unread,
            -- unsent_at IS NULL is load-bearing: without it the newest
            -- row is still chosen after an unsend and its NULL body renders
            -- as an empty preview, rather than falling back to the newest
            -- SURVIVING message. Caught by the derived-preview test.
            (SELECT m2.body FROM dm_messages m2
              WHERE m2.conversation_id = c.id
                AND m2.redacted_at IS NULL
                AND m2.unsent_at IS NULL
                AND m2.body IS NOT NULL
                AND NOT (m2.hidden_for_recipient AND m2.sender_account_id <> $1)
              ORDER BY m2.id DESC LIMIT 1) AS last_body
       FROM dm_participants part
       JOIN dm_conversations c ON c.id = part.conversation_id
      WHERE part.account_id = $1
        AND part.folder = $2
        AND c.last_activity_at <= $3::timestamptz
        AND ($4::timestamptz IS NULL
             OR (c.last_activity_at, c.id) < ($4::timestamptz, $5::uuid))
      ORDER BY c.last_activity_at DESC, c.id DESC
      LIMIT $6`,
    [me, folder, snapshot,
     parsed ? parsed.activityAt : null, parsed ? parsed.conversationId : null, n]);

  const items = rows.rows.map((r) => ({
    id: r.id,
    state: r.state,
    otherId: r.other_id,
    folder: r.folder,
    unread: r.unread,
    muted: r.muted,
    lastActivityAt: r.last_activity_at,
    // NO PREVIEW IN REQUESTS. A snippet renders an unaccepted stranger's words
    // in the recipient's list before they agreed to hear from them, which is
    // how a request folder becomes a free billboard.
    preview: folder === "requests" ? null : (r.last_body || null),
  }));
  const last = rows.rows[rows.rows.length - 1];
  return {
    items,
    cursor: rows.rows.length === n && last
      ? encodeCursor({ activityAt: last.last_activity_at, conversationId: last.id, snapshot })
      : "",
  };
}

/** The badge. One derived count; a read that fails throws rather than saying 0. */
export async function unreadSummary(meRaw) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    `SELECT part.folder, count(*)::int AS conversations
       FROM dm_participants part
      WHERE part.account_id = $1
        AND part.folder IN ('inbox','requests')
        -- A muted conversation still receives, still marks unread INSIDE
        -- itself, and still appears in the list. It just stops shouting from
        -- the corner. That is the entire difference between mute and block.
        AND part.muted_at IS NULL
        AND EXISTS (SELECT 1 FROM dm_messages m
                     WHERE m.conversation_id = part.conversation_id
                       AND m.id > part.last_read_message_id
                       AND m.sender_account_id <> $1
                       AND m.redacted_at IS NULL
                       AND m.unsent_at IS NULL
                       AND NOT m.hidden_for_recipient)
      GROUP BY part.folder`, [me]);
  const out = { inbox: 0, requests: 0 };
  for (const row of r.rows) out[row.folder] = row.conversations;
  return out;
}

/** Messages in a thread, newest-first, keyset on the BIGSERIAL. */
export async function readThread(meRaw, conversationId, { before = null, limit = 40 } = {}) {
  const me = accountId(meRaw);
  const n = Math.max(1, Math.min(100, Math.trunc(Number(limit)) || 40));
  const p = await pool();

  // Authorization IS the participant probe. A non-member gets the same answer
  // as a nonexistent conversation, so the endpoint is not a membership oracle.
  const member = await p.query(
    `SELECT folder, last_read_message_id, media_consent_at, media_consent_revoked_at,
            (muted_at IS NOT NULL) AS muted
       FROM dm_participants WHERE conversation_id=$1 AND account_id=$2`, [conversationId, me]);
  if (!member.rows.length) return null;

  // n + 1 to learn whether an older page exists WITHOUT a second count query.
  // A COUNT over the thread grows with the conversation; this does not.
  const rows = await p.query(
    `SELECT id, sender_account_id, body, created_at, redacted_at, hidden_for_recipient, unsent_at
       FROM dm_messages
      WHERE conversation_id=$1
        AND ($2::bigint IS NULL OR id < $2::bigint)
      ORDER BY id DESC LIMIT $3`, [conversationId, before, n + 1]);
  const hasOlder = rows.rows.length > n;
  if (hasOlder) rows.rows.length = n;

  return {
    folder: member.rows[0].folder,
    muted: member.rows[0].muted,
    lastReadMessageId: Number(member.rows[0].last_read_message_id),
    mediaConsent: {
      given: Boolean(member.rows[0].media_consent_at) && !member.rows[0].media_consent_revoked_at,
      // Kept so "was this sent under a consent that still stands?" remains
      // answerable when the pipeline exists.
      revokedAt: member.rows[0].media_consent_revoked_at,
    },
    hasOlder,
    // The keyset for the next page up. Null when this is the whole thread.
    olderBefore: hasOlder ? Number(rows.rows[rows.rows.length - 1].id) : null,
    messages: rows.rows.map((m) => ({
      id: Number(m.id),
      mine: m.sender_account_id === me,
      // "unsent" and "removed by moderation" are different facts and stay
      // separate all the way to the reader.
      unsent: Boolean(m.unsent_at),
      // A redacted message keeps its envelope and loses its body. Hidden means
      // hidden from the RECIPIENT only — the sender still sees what they sent.
      body: (m.redacted_at || m.unsent_at) ? null
        : (m.hidden_for_recipient && m.sender_account_id !== me ? null : m.body),
      redacted: Boolean(m.redacted_at),
      hidden: m.hidden_for_recipient,
      at: m.created_at,
    })),
  };
}

/** Monotonic: a stale client cannot un-read a newer message. */
export async function markRead(meRaw, conversationId, upToMessageId) {
  const me = accountId(meRaw);
  const p = await pool();
  await p.query(
    `UPDATE dm_participants
        SET last_read_message_id = GREATEST(last_read_message_id, $3::bigint)
      WHERE conversation_id=$1 AND account_id=$2`,
    [conversationId, me, Math.max(0, Math.trunc(Number(upToMessageId)) || 0)]);
}

/**
 * Accept a request: the thread moves out of the requests folder.
 *
 * THE ONLY ACCEPTABLE STATE IS 'requested'. The predicate used to read
 * `state <> 'accepted'`, which says yes to a DECLINED row — and the register's
 * blocker 1 is what that produced: state='accepted' with declined_at still
 * set, the recipient's folder pushed back to 'inbox', and the decline's block
 * row untouched, so LAW 1 refused every message in both directions while the
 * panel displayed a live thread. A decline is a decision; accepting is not a
 * way to overwrite it. The way back is unblock, then a fresh knock.
 *
 * The folder UPDATE is inside the rowCount branch for the same reason: it is a
 * consequence of the state change, and it used to run whether or not the state
 * changed — which is how a declined-and-archived thread climbed back into the
 * inbox.
 */
export async function acceptRequest(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const convo = await client.query(
      `SELECT lo_account_id, hi_account_id, state, opened_by FROM dm_conversations WHERE id=$1`,
      [conversationId]);
    if (!convo.rows.length) { await client.query("ROLLBACK"); return false; }
    const { lo_account_id: lo, hi_account_id: hi } = convo.rows[0];
    // Same lock every other read-then-write in this file takes, so an accept
    // and a decline arriving together are ordered rather than interleaved.
    // The state predicate below is what makes the race SAFE — the loser
    // re-evaluates against the winner's committed row and matches nothing —
    // but the lock is what keeps the block row and the folder in step with it.
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);

    const r = await client.query(
      `UPDATE dm_conversations SET state='accepted', accepted_at=COALESCE(accepted_at, now())
        WHERE id=$1 AND state = 'requested'
          AND opened_by <> $2
          AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id=$1 AND account_id=$2)
        RETURNING id`, [conversationId, me]);
    if (r.rowCount) {
      await client.query(
        `UPDATE dm_participants SET folder='inbox' WHERE conversation_id=$1 AND account_id=$2`,
        [conversationId, me]);
    }
    // Accepting an already-accepted thread is what the caller asked for and
    // already true. Answering false there would make a double-tap look like a
    // failure the panel cannot explain — but ONLY for the recipient, and only
    // from 'accepted'. From 'declined' the answer stays false. Re-read inside
    // the lock rather than trusting the row read before it: if the other tab
    // won the race, the copy read before the wait says 'requested' and would
    // report the loser a failure for work that is done.
    let answer = r.rowCount > 0;
    if (!r.rowCount) {
      const now = await client.query(
        `SELECT state, opened_by FROM dm_conversations WHERE id=$1`, [conversationId]);
      const row = now.rows[0];
      answer = !!row && row.state === "accepted" && row.opened_by !== me;
    }
    await client.query("COMMIT");
    return answer;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Decline a request. Blocks the sender, and SAYS SO — `source='decline'` so
 * the block can be listed back to the person who made it and undone. The red
 * team found a decline installing a permanent block that an ambiguous refusal
 * then hid from its own author.
 */
export async function declineRequest(meRaw, conversationId, { block = true } = {}) {
  const me = accountId(meRaw);
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const convo = await client.query(
      `SELECT lo_account_id, hi_account_id, state, opened_by FROM dm_conversations c
        WHERE c.id=$1 AND EXISTS (
          SELECT 1 FROM dm_participants WHERE conversation_id=$1 AND account_id=$2)`,
      [conversationId, me]);
    if (!convo.rows.length) { await client.query("ROLLBACK"); return false; }
    const { lo_account_id: lo, hi_account_id: hi } = convo.rows[0];
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);

    // DECLINING IS THE RECIPIENT'S ANSWER TO A KNOCK. It used to check only
    // that the caller was A participant, with no state predicate at all, and
    // the register's blocker 3 is what that produced: an OPENER could decline
    // their own thread, `them !== me` skipped the block insert so nothing was
    // listed anywhere, and LAW 1's `state='declined' AND sender=opened_by`
    // then refused them forever with no way back — accept requires
    // `opened_by <> me`, there is no block to undo, and UNIQUE(lo,hi) makes a
    // second thread with that person unrepresentable. Both halves of the
    // predicate live in the UPDATE, evaluated against the row as it stands
    // after the lock, not against the copy read before it.
    const r = await client.query(
      `UPDATE dm_conversations SET state='declined', declined_at=COALESCE(declined_at, now())
        WHERE id=$1 AND state='requested' AND opened_by <> $2
        RETURNING opened_by`, [conversationId, me]);
    if (!r.rowCount) {
      // Already declined by this recipient is what the caller asked for and
      // already true — a double-tap is not a failure. Anything else is. Read
      // the row as it stands INSIDE the lock, not the copy read before it.
      const now = await client.query(
        `SELECT state, opened_by FROM dm_conversations WHERE id=$1`, [conversationId]);
      const row = now.rows[0];
      await client.query("ROLLBACK");
      return !!row && row.state === "declined" && row.opened_by !== me;
    }
    const them = r.rows[0].opened_by;
    await client.query(
      `UPDATE dm_participants SET folder='archived' WHERE conversation_id=$1 AND account_id=$2`,
      [conversationId, me]);
    if (block) {
      // `them !== me` is no longer a guard, it is a fact: the UPDATE matched
      // only because opened_by <> me.
      await client.query(
        `INSERT INTO dm_blocks (blocker_account_id, blocked_account_id, source)
         VALUES ($1,$2,'decline') ON CONFLICT DO NOTHING`, [me, them]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Per-account (owner ruling): the block names the person, not the thread. */
export async function blockAccount(meRaw, themRaw) {
  const me = accountId(meRaw), them = accountId(themRaw);
  if (me === them) throw new Error("dm: cannot block yourself");
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO dm_blocks (blocker_account_id, blocked_account_id, source)
       VALUES ($1,$2,'manual') ON CONFLICT (blocker_account_id, blocked_account_id) DO NOTHING`,
      [me, them]);
    // Presence written BEFORE the block must not outlive it. v44's migration
    // DELETE only sweeps what existed when it ran; a block made afterwards
    // needs this. Caught by v44's own test, which asserted a sweep the
    // migration could not perform for a future block.
    await client.query(
      `DELETE FROM dm_typing t
        USING dm_conversations c
        WHERE t.conversation_id = c.id
          AND ((c.lo_account_id = $1 AND c.hi_account_id = $2)
            OR (c.lo_account_id = $2 AND c.hi_account_id = $1))`,
      [me, them]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The direct primitive, by account. The desk cannot call it — the client has
 * never held an account uuid — so unblocking from the panel goes through
 * `unblockByConversation` or `unblockByHandle` below. This one stays because
 * it is what the store tests and any server-side caller address with.
 */
export async function unblockAccount(meRaw, themRaw) {
  const me = accountId(meRaw), them = accountId(themRaw);
  const p = await pool();
  const r = await p.query(
    `DELETE FROM dm_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2`, [me, them]);
  return r.rowCount > 0;
}

/**
 * Everyone I have blocked, including the decline-blocks I may not remember.
 *
 * Each row carries the CONVERSATION with that person when there is one,
 * because that is the only handle-free way for a client to name them: a block
 * made by DECLINE + BLOCK is against whoever knocked, and a person can knock
 * without ever having published a room. The account uuid stays here — the
 * route projects handle + conversation id and nothing else.
 */
export async function listBlocks(meRaw) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    `SELECT b.blocked_account_id, b.source, b.created_at, c.id AS conversation_id
       FROM dm_blocks b
       LEFT JOIN dm_conversations c
         ON c.lo_account_id = LEAST(b.blocker_account_id, b.blocked_account_id)
        AND c.hi_account_id = GREATEST(b.blocker_account_id, b.blocked_account_id)
      WHERE b.blocker_account_id=$1
      ORDER BY b.created_at DESC`, [me]);
  return r.rows.map((x) => ({
    accountId: x.blocked_account_id,
    conversationId: x.conversation_id,
    source: x.source,
    at: x.created_at,
  }));
}

/**
 * Undo a block naming the person by the CONVERSATION with them.
 *
 * The client has never held an account uuid and must not start now, and a
 * handle cannot name someone who never published a room — which is most of
 * the people a DECLINE + BLOCK is aimed at, since knocking requires no room of
 * your own. The conversation id is already on the wire, the caller must be a
 * participant of it, and the other participant is the only person it can name.
 */
export async function unblockByConversation(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    `DELETE FROM dm_blocks b
      USING dm_conversations c
      WHERE c.id = $2
        AND $1 IN (c.lo_account_id, c.hi_account_id)
        AND b.blocker_account_id = $1
        AND b.blocked_account_id =
            CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END`,
    [me, conversationId]);
  return r.rowCount > 0;
}

/**
 * Undo a block naming the person by HANDLE. Resolved against profile_rooms
 * directly and NOT through resolveAddressee, which excludes the very people
 * this is for: someone I blocked is by definition unaddressable.
 */
export async function unblockByHandle(meRaw, handleRaw) {
  const me = accountId(meRaw);
  const handle = String(handleRaw || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{3,24}$/.test(handle)) return false;
  const p = await pool();
  const r = await p.query(
    `DELETE FROM dm_blocks b
      USING profile_rooms r
      WHERE r.handle = $2
        AND b.blocker_account_id = $1
        AND b.blocked_account_id = r.account_id`,
    [me, handle]);
  return r.rowCount > 0;
}

/** Did I block them? Used so a refusal of MINE is explained, not obscured. */
export async function iBlocked(meRaw, themRaw) {
  const me = accountId(meRaw), them = accountId(themRaw);
  const p = await pool();
  const r = await p.query(
    `SELECT 1 FROM dm_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2`, [me, them]);
  return r.rows.length > 0;
}

/**
 * The blanket switch. A business is refused by the v40 trigger (P0004), not by
 * a check here — the route is not the only writer.
 */
export async function setDmsOpen(meRaw, open) {
  const me = accountId(meRaw);
  const p = await pool();
  try {
    await p.query(
      `INSERT INTO dm_settings (account_id, dms_open) VALUES ($1,$2)
       ON CONFLICT (account_id) DO UPDATE SET dms_open=EXCLUDED.dms_open, updated_at=now()`,
      [me, Boolean(open)]);
  } catch (error) {
    if (error.code === "P0004") throw new MessageRefused("P0004", error.message);
    throw error;
  }
}

export async function readDmsOpen(meRaw) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(`SELECT dms_open FROM dm_settings WHERE account_id=$1`, [me]);
  return r.rows.length ? r.rows[0].dms_open : true;
}

/**
 * The per-conversation "receive images and videos" toggle. BOTH sides hold
 * one; nothing reads them yet because no attachment can be sent. Revocation
 * stamps rather than clears, so the window a past attachment was sent under
 * stays answerable once the pipeline exists.
 */
export async function setMediaConsent(meRaw, conversationId, allow) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    allow
      ? `UPDATE dm_participants
            SET media_consent_at = COALESCE(media_consent_at, now()),
                media_consent_revoked_at = NULL
          WHERE conversation_id=$1 AND account_id=$2 RETURNING 1`
      : `UPDATE dm_participants
            SET media_consent_revoked_at = now()
          WHERE conversation_id=$1 AND account_id=$2 AND media_consent_at IS NOT NULL
          RETURNING 1`,
    [conversationId, me]);
  return r.rowCount > 0;
}

/**
 * Find people you can write to.
 *
 * THE SEARCH DOMAIN IS PUBLISHED PROFILE ROOMS, AND THAT IS THE WHOLE
 * ENUMERATION ANSWER. A DM search over "all accounts" turns the product into a
 * directory of everyone who ever signed up, and there is no rate limit that
 * makes that acceptable — it is the shape that is wrong, not the speed. Here,
 * appearing in a search result is something a person DID: they published a
 * room under a handle. Someone who never published is not hidden by a policy
 * that could be relaxed later; they are absent from the table this reads.
 *
 * Three exclusions here, and the reason each one is not optional:
 *   - MYSELF. A self-conversation is unrepresentable one layer down; offering
 *     it here would only produce a refusal.
 *   - ANYONE **I** HAVE BLOCKED. My own state, which I already know — hiding
 *     it tells me nothing I did not do myself.
 *   - ANYONE WHO CANNOT RECEIVE, and HIDDEN OR UNDER-REVIEW ROOMS. Both are
 *     the same for every caller, so absence carries no fact about the person
 *     asking. Moderation applies to discovery first.
 *
 * A business is always listed: it cannot switch messages off (v40 trigger).
 *
 * WHAT IS DELIBERATELY *NOT* EXCLUDED: SOMEONE WHO BLOCKED **ME**.
 *
 * It used to be, and that made search a block detector. Absence was
 * caller-specific, so a harasser could search a handle from their own account
 * and from a throwaway and compare: present there, gone here, therefore the
 * block landed. For a business it took no second account at all — a business
 * cannot close its door, so vanishing could only mean a block. Detecting the
 * block is the whole cost driver in ban evasion: someone who cannot tell
 * whether it landed wastes effort, and someone who gets a definitive read
 * re-registers immediately.
 *
 * That defeated the ambiguity built one file over on purpose (lib/dm.js:
 * P0001 and P0002 collapse "they blocked you" and "their door is shut" into
 * one sentence "precisely because distinguishing them tells a stranger which
 * one it was"). I wrote that rule and then broke it here three PRs later.
 *
 * Listing them costs nothing, because the exclusion never enforced anything:
 * a profile room IS a public page, so the handle was already visible; and
 * `resolveAddressee` below KEEPS the bidirectional predicate, so addressing
 * them still fails — with the same collapsed refusal, from the same branch,
 * as a closed door or a handle that never existed. Nothing is created; there
 * is no thread, no request, no notification. The searcher learns exactly what
 * they learn about everyone they cannot write to: nothing.
 *
 * Ruling made 23 Aug under the owner's autonomy window and recorded in
 * docs/dm-core-decisions-2026-08-23.md. To reverse it, restore the second arm
 * of the NOT EXISTS below — and re-read that note first, because the reversal
 * restores the oracle.
 */
export async function findAddressees(meRaw, query, { limit = 8 } = {}) {
  const me = accountId(meRaw);
  const q = String(query || "").trim().toLowerCase();
  // Two characters minimum, and a PREFIX match. A one-character query walks
  // the alphabet in twenty-six requests; a substring match walks it in one.
  if (q.length < 2 || !/^[a-z0-9-]{2,24}$/.test(q)) return [];
  const n = Math.max(1, Math.min(10, Math.trunc(Number(limit)) || 8));

  const p = await pool();
  const r = await p.query(
    `SELECT r.account_id, r.handle,
            COALESCE(k.kind, 'passport') AS kind
       FROM profile_rooms r
       LEFT JOIN account_kinds k ON k.account_id = r.account_id
       LEFT JOIN dm_settings s   ON s.account_id = r.account_id
      WHERE r.published = true
        AND r.moderation_status = 'visible'
        AND r.handle IS NOT NULL
        AND r.handle LIKE $2 || '%'
        AND r.account_id <> $1
        -- ONE DIRECTION ONLY: blocks I MADE. A block made against me is not a
        -- fact this result set may carry — see the note above.
        AND NOT EXISTS (
          SELECT 1 FROM dm_blocks b
           WHERE b.blocker_account_id = $1 AND b.blocked_account_id = r.account_id)
        -- reachable: a business always, a passport only with its door open
        AND (COALESCE(k.kind,'passport') = 'business' OR COALESCE(s.dms_open, true) = true)
      ORDER BY r.handle
      LIMIT $3`,
    [me, q, n]);

  return r.rows.map((row) => ({
    handle: row.handle,
    kind: row.kind,
    // The uuid is NOT returned. The client addresses people by handle and the
    // server resolves it — otherwise the search hands out the very identifier
    // that lets a caller skip the search next time.
  }));
}

/**
 * Resolve a handle to an account for addressing. This is where the FULL
 * predicate lives, blocks in BOTH directions included, so a handle learned
 * some other way — guessed, read off a public room, or kept from before a
 * block — cannot open a thread. Returns null when it is not addressable,
 * without saying why.
 *
 * The search above is deliberately more permissive than this. That asymmetry
 * is the whole fix for the oracle: what you can SEE says nothing about you,
 * and what you can SEND is refused identically whatever the reason. A null
 * here becomes the same 409 "this person is not reachable right now" as a
 * closed door and as a handle nobody ever registered — and it returns before
 * `openConversation`, so a blocked sender cannot even bring an empty thread
 * into existence in someone's requests folder.
 */
export async function resolveAddressee(meRaw, handleRaw) {
  const me = accountId(meRaw);
  const handle = String(handleRaw || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{3,24}$/.test(handle)) return null;

  const p = await pool();
  const r = await p.query(
    `SELECT r.account_id
       FROM profile_rooms r
       LEFT JOIN account_kinds k ON k.account_id = r.account_id
       LEFT JOIN dm_settings s   ON s.account_id = r.account_id
      WHERE r.published = true
        AND r.moderation_status = 'visible'
        AND r.handle = $2
        AND r.account_id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM dm_blocks b
           WHERE (b.blocker_account_id = $1 AND b.blocked_account_id = r.account_id)
              OR (b.blocker_account_id = r.account_id AND b.blocked_account_id = $1))
        AND (COALESCE(k.kind,'passport') = 'business' OR COALESCE(s.dms_open, true) = true)
      LIMIT 1`,
    [me, handle]);
  return r.rows.length ? r.rows[0].account_id : null;
}

/** The handle to show for a counterparty, or null if they have no room. */
export async function handlesFor(accountIds) {
  const ids = [...new Set((accountIds || []).map((x) => String(x || "").toLowerCase())
    .filter((x) => ACCOUNT_UUID.test(x)))];
  if (!ids.length) return {};
  const p = await pool();
  const r = await p.query(
    `SELECT account_id, handle FROM profile_rooms
      WHERE account_id = ANY($1::uuid[]) AND handle IS NOT NULL`, [ids]);
  const out = {};
  for (const row of r.rows) out[row.account_id] = row.handle;
  return out;
}

// --- activity signals: read receipts + typing (schema v41) ------------------
//
// RECIPROCITY IS THE WHOLE CONTROL. Switching your signals off also switches
// off your ability to see anyone else's. Without that it is a one-way mirror,
// which is precisely what a privacy setting is supposed to prevent — and it is
// enforced HERE, in the read, rather than in the UI, so a caller hitting the
// API directly gets the same answer as the panel.

/** How long a "typing" ping stays true without a refresh. */
export const TYPING_TTL_SECONDS = 6;

export async function setActivitySignals(meRaw, on) {
  const me = accountId(meRaw);
  const p = await pool();
  await p.query(
    `INSERT INTO dm_settings (account_id, activity_signals) VALUES ($1,$2)
     ON CONFLICT (account_id) DO UPDATE SET activity_signals=EXCLUDED.activity_signals, updated_at=now()`,
    [me, Boolean(on)]);
}

export async function readActivitySignals(meRaw) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(`SELECT activity_signals FROM dm_settings WHERE account_id=$1`, [me]);
  return r.rows.length ? r.rows[0].activity_signals : true;
}

/** Refresh my typing ping. Upsert, because "still typing" is the common case. */
export async function pingTyping(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  // Someone with signals off does not broadcast. Checked before the write so
  // no row exists to leak even for the seconds before it lapses.
  if (!(await readActivitySignals(me))) return false;
  await p.query(
    `INSERT INTO dm_typing (conversation_id, account_id, typing_until)
     VALUES ($1,$2, now() + ($3 || ' seconds')::interval)
     ON CONFLICT (conversation_id, account_id)
       DO UPDATE SET typing_until = EXCLUDED.typing_until`,
    [conversationId, me, String(TYPING_TTL_SECONDS)]);
  return true;
}

/** Leaving the composer. Best-effort: the expiry is the real mechanism. */
export async function clearTyping(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  await p.query(`DELETE FROM dm_typing WHERE conversation_id=$1 AND account_id=$2`,
    [conversationId, me]);
}

/**
 * The other side's activity in this conversation.
 * Returns { typing, readUpTo } — both null when reciprocity denies them, so a
 * caller cannot tell "they are not typing" from "you switched signals off".
 */
export async function peerActivity(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();

  // Reciprocity first: if MY signals are off I see nothing, whatever they set.
  if (!(await readActivitySignals(me))) return { typing: null, readUpTo: null, reciprocal: false };

  const r = await p.query(
    `SELECT part.account_id,
            part.last_read_message_id,
            COALESCE(s.activity_signals, true) AS signals,
            (t.typing_until IS NOT NULL AND t.typing_until > now()) AS typing
       FROM dm_participants part
       LEFT JOIN dm_settings s ON s.account_id = part.account_id
       LEFT JOIN dm_typing   t ON t.conversation_id = part.conversation_id
                              AND t.account_id = part.account_id
      WHERE part.conversation_id = $1
        AND part.account_id <> $2
        -- v44: a block stops PRESENCE, not only words. Without this the person
        -- you blocked kept seeing you type and kept seeing your read position,
        -- and you kept seeing theirs. The trigger stops new typing rows; this
        -- stops the READ, including the receipt, which no trigger can.
        AND NOT EXISTS (
          SELECT 1 FROM dm_blocks b
           WHERE (b.blocker_account_id = $2 AND b.blocked_account_id = part.account_id)
              OR (b.blocker_account_id = part.account_id AND b.blocked_account_id = $2))
        -- and I must actually be in this conversation to ask about it
        AND EXISTS (
          SELECT 1 FROM dm_participants mine
           WHERE mine.conversation_id = $1 AND mine.account_id = $2)`,
    [conversationId, me]);
  if (!r.rows.length) return { typing: null, readUpTo: null, reciprocal: true };

  const peer = r.rows[0];
  // THEIR setting governs what they emit.
  if (!peer.signals) return { typing: null, readUpTo: null, reciprocal: true };
  return {
    typing: Boolean(peer.typing),
    readUpTo: Number(peer.last_read_message_id) || 0,
    reciprocal: true,
  };
}

/**
 * Remove lapsed typing rows. Not required for correctness — every read already
 * compares against now() — but a table that only grows is a table that will
 * one day be a problem, and the steward should not have to discover it.
 */
export async function sweepTyping() {
  const p = await pool();
  const r = await p.query(`DELETE FROM dm_typing WHERE typing_until < now() - interval '1 minute'`);
  return r.rowCount;
}

// --- reactions and unsend (schema v42) --------------------------------------

/** The palette, read from the law table rather than hardcoded in two places. */
export async function reactionKinds() {
  const p = await pool();
  const r = await p.query(`SELECT emoji FROM dm_reaction_kinds ORDER BY position, emoji`);
  return r.rows.map((x) => x.emoji);
}

/**
 * React, or replace my existing reaction. Passing null removes it.
 * Every refusal the triggers raise is handed up as a MessageRefused so the
 * route describes it the same way it describes a refused send.
 */
export async function react(meRaw, messageId, emoji) {
  const me = accountId(meRaw);
  const id = Math.trunc(Number(messageId)) || 0;
  if (!id) throw new Error("dm: which message?");
  const p = await pool();
  try {
    if (emoji === null || emoji === undefined || emoji === "") {
      const r = await p.query(
        `DELETE FROM dm_reactions WHERE message_id=$1 AND account_id=$2`, [id, me]);
      return { emoji: null, removed: r.rowCount > 0 };
    }
    await p.query(
      `INSERT INTO dm_reactions (message_id, account_id, emoji) VALUES ($1,$2,$3)
       ON CONFLICT (message_id, account_id)
         DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`,
      [id, me, String(emoji)]);
    return { emoji: String(emoji), removed: false };
  } catch (error) {
    if (["P0001", "P0003", "P0005", "42501"].includes(error.code)) {
      throw new MessageRefused(error.code, error.message);
    }
    // A foreign-key violation here means the emoji is not in the palette —
    // which is a refusal, not a server fault.
    if (error.code === "23503") throw new MessageRefused("P0005", "that mark is not available");
    throw error;
  }
}

/**
 * Unsend my own message. The body goes; the envelope stays.
 *
 * Scoped to the sender IN THE UPDATE ITSELF rather than checked first: a
 * check-then-write could be raced, and the WHERE clause cannot be.
 * Returns false when it was not mine, did not exist, or was already gone —
 * one answer, because distinguishing them tells a caller about a message they
 * have no claim to.
 */
export async function unsendMessage(meRaw, messageId) {
  const me = accountId(meRaw);
  const id = Math.trunc(Number(messageId)) || 0;
  if (!id) return false;
  const p = await pool();
  const r = await p.query(
    `UPDATE dm_messages
        SET body = NULL, unsent_at = now()
      WHERE id = $1 AND sender_account_id = $2
        AND unsent_at IS NULL AND redacted_at IS NULL
      RETURNING id`, [id, me]);
  if (r.rowCount) {
    // A reaction to something nobody can read is noise on a tombstone.
    await p.query(`DELETE FROM dm_reactions WHERE message_id=$1`, [id]);
  }
  return r.rowCount > 0;
}

/** Reactions for a page of messages: { messageId: { emoji: count, ... } }. */
export async function reactionsFor(messageIds, meRaw) {
  const me = accountId(meRaw);
  const ids = (messageIds || []).map((x) => Math.trunc(Number(x)) || 0).filter(Boolean);
  if (!ids.length) return {};
  const p = await pool();
  const r = await p.query(
    `SELECT message_id, emoji, count(*)::int AS n,
            bool_or(account_id = $2) AS mine
       FROM dm_reactions WHERE message_id = ANY($1::bigint[])
      GROUP BY message_id, emoji`, [ids, me]);
  const out = {};
  for (const row of r.rows) {
    const key = String(row.message_id);
    (out[key] ||= []).push({ emoji: row.emoji, count: row.n, mine: row.mine });
  }
  return out;
}

// --- mute (schema v43) ------------------------------------------------------

/**
 * Mute or unmute a conversation, for me only.
 *
 * Deliberately NOT symmetric with block: there is no trigger, no refusal and
 * no effect on delivery. The only thing a mute changes is whether this
 * conversation is allowed to put a number in the corner of the screen.
 */
export async function setMuted(meRaw, conversationId, muted) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    `UPDATE dm_participants
        SET muted_at = CASE WHEN $3 THEN COALESCE(muted_at, now()) ELSE NULL END
      WHERE conversation_id = $1 AND account_id = $2
      RETURNING (muted_at IS NOT NULL) AS muted`,
    [conversationId, me, Boolean(muted)]);
  return r.rows.length ? r.rows[0].muted : null;
}
