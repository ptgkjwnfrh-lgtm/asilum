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
// EXPORTED so the store tests can hold the very lock the store takes. There is
// no other way to prove a writer waits for it: a test that only fails on an
// unlucky schedule is not a regression test, and one that reimplements the key
// is testing its own arithmetic.
export function pairLockKey(lo, hi) {
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

/**
 * THE BODY THIS READER IS ENTITLED TO SEE. One rule, and every reader uses it.
 *
 * Three absences, three reasons, and they are not interchangeable:
 *   - UNSENT — the author withdrew it. The body is already NULL in the row.
 *   - REDACTED — a moderator removed it. The envelope stays; the words do not
 *     come back to anybody, in a thread or in an export.
 *   - HIDDEN — hidden from the RECIPIENT only. The sender still sees what they
 *     sent, because those are their own words.
 *
 * It lives here rather than inside readThread because the export reads the
 * same rows for the same person, and a second copy of this rule is how an
 * export ends up showing something the thread would not.
 */
export function visibleBody(row, me) {
  if (row.redacted_at || row.unsent_at) return null;
  if (row.hidden_for_recipient && row.sender_account_id !== me) return null;
  return row.body;
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
      // The LATER stamp is the state. `revoked_at IS NOT NULL` used to mean
      // "not given", which made a re-grant impossible to represent without
      // deleting the revocation — and deleting it is what the columns exist to
      // prevent.
      given: mediaConsentGiven(member.rows[0].media_consent_at, member.rows[0].media_consent_revoked_at),
      // Kept so "was this sent under a consent that still stands?" remains
      // answerable when the pipeline exists — including after a re-grant.
      grantedAt: member.rows[0].media_consent_at,
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
      body: visibleBody(m, me),
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
export async function declineRequest(meRaw, conversationId, options = {}) {
  return (await declineRequestDetailed(meRaw, conversationId, options)).ok;
}

/**
 * The same act, reporting WHAT IT DID rather than what it was asked to do.
 *
 * The route answered `blocked: ok && body.block !== false` — the REQUEST FLAG,
 * not the world. So a second decline of an already-declined request said
 * `blocked: true` whether or not a block row existed, which the shipped UI can
 * reach: decline, unblock from the BLOCKED list, then decline again from a
 * panel that had not reloaded.
 *
 * `rowCount` on the INSERT would be just as wrong in the other direction: it
 * is `ON CONFLICT DO NOTHING`, so a decline that lands where a MANUAL block
 * already stands inserts nothing and is still truthfully "blocked". The only
 * honest answer is to ask the table, on the connection that holds the pair
 * lock — a pooled read would sit outside it and could race the very
 * transaction it is describing.
 */
export async function declineRequestDetailed(meRaw, conversationId, { block = true } = {}) {
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
      const already = !!row && row.state === "declined" && row.opened_by !== me;
      // Whether a block STANDS, asked of the table on the locked connection.
      const standing = already
        ? await client.query(
            `SELECT 1 FROM dm_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2`,
            [me, row.opened_by])
        : { rows: [] };
      await client.query("ROLLBACK");
      return { ok: already, blocked: standing.rows.length > 0 };
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
    // Asked of the table, not inferred from the flag or from rowCount: a
    // decline that did not block still reports honestly if a manual block was
    // already standing.
    const standing = await client.query(
      `SELECT 1 FROM dm_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2`, [me, them]);
    await client.query("COMMIT");
    return { ok: true, blocked: standing.rows.length > 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * BLOCK SOMEONE YOU ARE ALREADY TALKING TO.
 *
 * The only path that ever created a block was DECLINE + BLOCK on a pending
 * request, and once a request is accepted that branch never renders again —
 * so harassment that begins AFTER acceptance had no user-facing remedy at all.
 * The victim's only lever was MUTE, which by design silences their own badge
 * and does not stop delivery.
 *
 * Addressed by CONVERSATION because the client has never held an account uuid
 * (law 7), and it DELEGATES to blockAccount rather than writing a second
 * INSERT: that function takes the pair advisory lock every law-1 writer must
 * take, and sweeps the presence rows written before the block. A hand-rolled
 * insert here would silently drop both.
 */
export async function blockByConversation(meRaw, conversationId) {
  const them = await peerOf(meRaw, conversationId);
  if (!them) return false;
  await blockAccount(meRaw, them);
  return true;
}

/** Per-account (owner ruling): the block names the person, not the thread. */
export async function blockAccount(meRaw, themRaw) {
  const me = accountId(meRaw), them = accountId(themRaw);
  if (me === them) throw new Error("dm: cannot block yourself");
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // EVERY WRITER IN LAW 1 TAKES THE PAIR LOCK — this one did not, and the
    // module's own comment above says it should. dm_guard_message's block
    // check is a plain EXISTS inside the SENDER's transaction, which holds
    // this lock for its whole life. A block that skipped the lock could commit
    // AFTER that check and BEFORE the send committed: the message was
    // delivered into the thread of someone whose block was already durable,
    // and their badge counted it. The window opened at exactly the moment a
    // person reaches for the block button.
    //
    // Taking it here means the block either lands before the sender's check
    // (refused) or waits until after the sender commits (delivered, then
    // blocked). Both are honest; the third outcome was not.
    const { lo, hi } = orderPair(me, them);
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);
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

/**
 * The other account in a conversation I am in — or null if I am not in it.
 *
 * WHY THIS EXISTS. lib/dm.js says "a refusal caused by the CALLER'S OWN block
 * is NOT vague ... Yours is always explained, and always with the undo." The
 * route could only honour that on ONE path: first contact by handle, where it
 * happened to have resolved the other person already. Every send into an
 * existing conversation — which is every send after the first, and every send
 * from the thread view — and every reaction had nobody to ask about, so the
 * caller's own block collapsed to "this person is not reachable right now."
 *
 * That is the exact withholding the ambiguity rule was written to prevent,
 * aimed at the only person entitled to the answer, with the undo hidden. The
 * decliner is the ONLY person this product lets create a block, so they were
 * also the most likely person to hit it.
 */
export async function peerOf(meRaw, conversationId) {
  const me = accountId(meRaw);
  const id = String(conversationId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const p = await pool();
  const r = await p.query(
    `SELECT CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END AS other_id
       FROM dm_conversations c
      WHERE c.id = $2::uuid AND $1 IN (c.lo_account_id, c.hi_account_id)`, [me, id]);
  return r.rows.length ? r.rows[0].other_id : null;
}

/**
 * Is this caller the opener of a knock that was never accepted?
 *
 * The one question that decides whether a refusal may keep the recipient's
 * decision private. `state <> 'accepted'` covers both 'requested' (ignored)
 * and 'declined' — which is the point: the opener must not be able to tell
 * them apart. Membership is implicit in `opened_by = me`.
 */
export async function pendingKnockBy(meRaw, conversationId) {
  const me = accountId(meRaw);
  const id = String(conversationId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const p = await pool();
  const r = await p.query(
    `SELECT 1 FROM dm_conversations
      WHERE id = $2::uuid AND opened_by = $1 AND state <> 'accepted'`, [me, id]);
  return r.rows.length > 0;
}

/** The same answer, reached from a message id — what the reaction path holds. */
export async function peerOfMessage(meRaw, messageId) {
  const me = accountId(meRaw);
  const id = Math.trunc(Number(messageId)) || 0;
  if (!id) return null;
  const p = await pool();
  const r = await p.query(
    `SELECT CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END AS other_id
       FROM dm_messages m
       JOIN dm_conversations c ON c.id = m.conversation_id
      WHERE m.id = $2::bigint AND $1 IN (c.lo_account_id, c.hi_account_id)`, [me, id]);
  return r.rows.length ? r.rows[0].other_id : null;
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
/**
 * BOTH SETTINGS, ONE TRANSACTION.
 *
 * The route used to apply these as two separate autocommit statements and then
 * read them back. A business closing its door is refused by the v40 trigger
 * (P0004) — and by then the activity-signals write had already committed, so
 * the caller got a 409 while half of what they asked for stood. The refusal
 * body carried no state either, so the client could not learn which half.
 *
 * Two writes the caller made in one gesture are one act. Either both stand or
 * neither does.
 */
export async function setDmSettings(meRaw, { activitySignals = null, dmsOpen = null } = {}) {
  const me = accountId(meRaw);
  if (activitySignals === null && dmsOpen === null) return;
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    if (activitySignals !== null) {
      await client.query(
        `INSERT INTO dm_settings (account_id, activity_signals) VALUES ($1,$2)
         ON CONFLICT (account_id) DO UPDATE SET activity_signals=EXCLUDED.activity_signals,
                                                updated_at=clock_timestamp()`,
        [me, Boolean(activitySignals)]);
    }
    if (dmsOpen !== null) {
      await client.query(
        `INSERT INTO dm_settings (account_id, dms_open) VALUES ($1,$2)
         ON CONFLICT (account_id) DO UPDATE SET dms_open=EXCLUDED.dms_open,
                                                updated_at=clock_timestamp()`,
        [me, Boolean(dmsOpen)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "P0004") throw new MessageRefused("P0004", error.message);
    throw error;
  } finally {
    client.release();
  }
}

/** The single-setting primitive. The route writes both together through
 * `setDmSettings` above; this is what the store tests and any server-side
 * caller with one thing to change address. */
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
 * one; nothing reads them yet because no attachment can be sent.
 *
 * THE STATE IS THE LATER OF THE TWO STAMPS, and neither one erases the other.
 *
 * The re-grant used to do `media_consent_at = COALESCE(media_consent_at,
 * now()), media_consent_revoked_at = NULL` — which kept the ORIGINAL grant
 * time and deleted the revocation outright. So a consent granted in March,
 * revoked in April and granted again in May read as "granted in March, never
 * revoked": the one question the two columns exist to answer — *was this
 * attachment sent under a consent that still stood?* — was answered wrongly,
 * and the schema comment and this docstring both claimed the opposite. Law 4
 * is the whole deliverable here, since OWNER-DECISIONS #3 ships the state and
 * no pipeline, and it was lossy.
 *
 * A grant now stamps a NEW grant, a revocation stamps a revocation, and
 * whichever is later is the answer. WHAT THIS DOES NOT DO, stated so nobody
 * reads more into it: it keeps the latest grant and the latest revocation, not
 * every one of them. A full history needs an append-only table, and building
 * storage for a pipeline that does not exist is what the core cut on purpose —
 * `docs/dm-core-decisions-2026-08-23.md`. When attachments ship, that table
 * ships with them, and these two columns become its first two rows.
 */
export async function setMediaConsent(meRaw, conversationId, allow) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    allow
      ? `UPDATE dm_participants
            SET media_consent_at = clock_timestamp()
          WHERE conversation_id=$1 AND account_id=$2
            AND (media_consent_at IS NULL
                 OR (media_consent_revoked_at IS NOT NULL
                     AND media_consent_revoked_at >= media_consent_at))
          RETURNING 1`
      : `UPDATE dm_participants
            SET media_consent_revoked_at = clock_timestamp()
          WHERE conversation_id=$1 AND account_id=$2
            AND media_consent_at IS NOT NULL
            AND (media_consent_revoked_at IS NULL
                 OR media_consent_revoked_at < media_consent_at)
          RETURNING 1`,
    [conversationId, me]);
  return r.rowCount > 0;
}

/** Given = granted, and not revoked since. The later stamp wins. */
export function mediaConsentGiven(grantedAt, revokedAt) {
  if (!grantedAt) return false;
  if (!revokedAt) return true;
  return new Date(revokedAt) < new Date(grantedAt);
}

/**
 * DOES THE RECIPIENT ALREADY FOLLOW THE SENDER?
 *
 * `openConversation`'s `knownToRecipient` option, the `foldersForNewConversation`
 * rule and the unit test asserting "a thread you asked for should not arrive as
 * a request" all shipped with NO CALLER — the route always took the `false`
 * default. So the suite reported the rule as covered while nothing could
 * produce it, and someone who explicitly follows you had their first message
 * land in your REQUESTS queue, previewless, under an ACCEPT / DECLINE + BLOCK
 * prompt about a person you chose to follow. A green test over an unreachable
 * path is worse than no test.
 *
 * `user_follows` predates the DM subsystem and keys on the IDENTITY STRING
 * (`sb-<uuid>`), not the bare account uuid ADR-002 requires here, and its
 * target for `kind='user'` is a HANDLE. Both conversions happen in this one
 * query so no caller has to know them — and it FAILS CLOSED: no row, no
 * handle, no published room all mean `false`, which is the behaviour that
 * shipped.
 *
 * This only decides WHICH FOLDER the knock lands in. It does not touch the
 * one-knock law: the conversation is still `requested`, still one message
 * until they reply, and still needs accepting. A follow moves the knock; it
 * does not open the door.
 */
export async function recipientFollowsSender(recipientRaw, senderRaw) {
  const recipient = accountId(recipientRaw);
  const sender = accountId(senderRaw);
  const p = await pool();
  const r = await p.query(
    `SELECT 1
       FROM profile_rooms r
       JOIN user_follows f
         ON f.kind = 'user'
        AND lower(f.target) = lower(r.handle)
        AND f.user_id = 'sb-' || $1
      WHERE r.account_id = $2
        AND r.handle IS NOT NULL
      LIMIT 1`,
    [recipient, sender]);
  return r.rows.length > 0;
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

/** The single-setting primitive — see the note on `setDmsOpen`. */
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
  // v46 refuses presence on an unaccepted conversation IN THE TRIGGER, which
  // is where the law belongs — the route is not the only writer. Selecting the
  // state into the INSERT means the routine case (a knock the sender is still
  // typing into) writes nothing and answers false, instead of raising P0003 on
  // every keystroke for a refusal the UI already expects. The trigger is still
  // what makes it a law; this only keeps the store from shouting.
  const r = await p.query(
    `INSERT INTO dm_typing (conversation_id, account_id, typing_until)
     SELECT c.id, $2, now() + ($3 || ' seconds')::interval
       FROM dm_conversations c
      WHERE c.id = $1 AND c.state = 'accepted'
     ON CONFLICT (conversation_id, account_id)
       DO UPDATE SET typing_until = EXCLUDED.typing_until`,
    [conversationId, me, String(TYPING_TTL_SECONDS)]);
  return r.rowCount > 0;
}

/** Leaving the composer. Best-effort: the expiry is the real mechanism. */
export async function clearTyping(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  await p.query(`DELETE FROM dm_typing WHERE conversation_id=$1 AND account_id=$2`,
    [conversationId, me]);
}

/**
 * TWO YES/NO ANSWERS, AND NOTHING ELSE ON THE WIRE.
 *
 * Are they typing, and have they read the newest thing I sent. That is all the
 * panel ever asked — it renders on `typing` and compares a read position
 * against my own newest id — so that is all this returns.
 *
 * IT USED TO RETURN A NUMBER, AND THE NUMBER WAS AN ORACLE. `readUpTo` was
 * `Number(last_read_message_id) || 0`, so a peer with signals ON who had read
 * nothing serialised as `0`, while a peer with signals OFF serialised as
 * `null`. One request, no baseline, and the caller had classified their
 * correspondent's GLOBAL activity_signals setting — one column in dm_settings,
 * the same everywhere — and could date the change to the minute by polling.
 * Every accepted contact was a permanent monitor of that switch.
 *
 * #393 removed the `reciprocal` flag believing it was the carrier. It was not:
 * `reciprocal` is false in exactly one branch — when the CALLER's own signals
 * are off, which the caller already knows. The fix was cosmetic and the test
 * written for it was a hand-written fixture that could not see the real thing.
 *
 * Now every case that must be indistinguishable produces the SAME two answers:
 * their signals off, my signals off, a block either way, an unaccepted knock, a
 * conversation I am not in — and, crucially, the ordinary case of them simply
 * NOT HAVING READ IT YET. That last one is what makes the null ambiguous rather
 * than merely undefined: it happens constantly, to everyone.
 *
 * WHAT IS STILL VISIBLE, said plainly rather than papered over: if they had
 * read my newest message and then switched signals off, the indicator I was
 * already looking at goes away. That transition is not hideable without
 * inventing a claim about a person's attention, which is worse. The setting
 * stops you emitting; it does not promise your correspondents cannot notice
 * that you stopped, and the checkbox in the panel says so.
 */
const NOTHING_TO_REPORT = Object.freeze({ typing: false, readYours: false });

/** The other side's activity in this conversation. */
export async function peerActivity(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();

  // Reciprocity first: if MY signals are off I see nothing, whatever they set.
  if (!(await readActivitySignals(me))) return { ...NOTHING_TO_REPORT, reciprocal: false };

  const r = await p.query(
    `SELECT part.account_id,
            part.last_read_message_id,
            -- The only read position that means anything to the caller is
            -- "have they got to MY newest message". Computed here so the
            -- answer can be a yes/no rather than a number — see below.
            (SELECT max(m.id) FROM dm_messages m
              WHERE m.conversation_id = $1 AND m.sender_account_id = $2) AS my_newest,
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
           WHERE mine.conversation_id = $1 AND mine.account_id = $2)
        -- v46: A KNOCK IS NOT A CONVERSATION YET. This read used to return the
        -- recipient's read position on a REQUEST, so opening a stranger's
        -- message to see who it was told the sender that a real human had
        -- opened it — the tracking-pixel confirmation that separates a live
        -- address from a dead one. v42 refused reactions on an unaccepted
        -- conversation for exactly this reason ("a notification a stranger can
        -- send") and the receipt a stranger can READ was never given the same
        -- rule. The trigger stops new typing rows; no trigger can stop a read,
        -- so the gate has to be here as well.
        AND EXISTS (
          SELECT 1 FROM dm_conversations c
           WHERE c.id = $1 AND c.state = 'accepted')`,
    [conversationId, me]);
  if (!r.rows.length) return { ...NOTHING_TO_REPORT, reciprocal: true };

  const peer = r.rows[0];
  // THEIR setting governs what they emit.
  if (!peer.signals) return { ...NOTHING_TO_REPORT, reciprocal: true };
  return {
    typing: Boolean(peer.typing),
    readYours: Boolean(peer.my_newest)
      && Number(peer.last_read_message_id) >= Number(peer.my_newest),
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
  const client = await p.connect();
  try {
    // AN UNSEND IS ONE ACT. These were two autocommit statements on the pool —
    // possibly on two different connections — so the withdrawal could commit
    // and the reaction sweep never run: a process that dies or a pool that
    // errors between them left a partial write with nothing to roll back.
    //
    // The race was worse than the crash. dm_guard_reaction read the message
    // with a plain, non-locking SELECT, so a reaction inserted at the same
    // instant passed its check (unsent_at still NULL), the DELETE ran before
    // that insert committed and removed nothing, and the reaction landed on a
    // tombstone — permanently, visible to the author of the message they had
    // just withdrawn, removable only by the person who left it.
    //
    // v47 gives that guard `FOR SHARE`, so the UPDATE below waits for any
    // in-flight reaction on this message and the DELETE — now in the same
    // transaction — sweeps it. Both orderings end in the same clean state.
    await client.query("BEGIN");
    // NAME THE ACTOR. v48 requires the withdrawal to be attributable to its
    // author, and a trigger cannot see who is asking — every connection is
    // `asilum_app`. So the writer states it and the trigger checks it.
    // Transaction-local (`true`), so it cannot leak to the next borrower of a
    // pooled connection, which is the failure a session-level setting would
    // have. The WHERE clause below still scopes the update; the difference is
    // that the law no longer lives ONLY there.
    await client.query("SELECT set_config('asilum.dm_actor', $1, true)", [me]);
    const r = await client.query(
      `UPDATE dm_messages
          SET body = NULL, unsent_at = clock_timestamp()
        WHERE id = $1 AND sender_account_id = $2
          AND unsent_at IS NULL AND redacted_at IS NULL
        RETURNING id`, [id, me]);
    if (r.rowCount) {
      // A reaction to something nobody can read is noise on a tombstone.
      await client.query(`DELETE FROM dm_reactions WHERE message_id=$1`, [id]);
    }
    await client.query("COMMIT");
    return r.rowCount > 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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
