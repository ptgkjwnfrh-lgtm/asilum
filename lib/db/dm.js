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
    await client.query(
      `UPDATE dm_conversations SET last_activity_at = now() WHERE id=$1`, [conversationId]);
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
            (SELECT count(*) FROM dm_messages m
              WHERE m.conversation_id = c.id
                AND m.id > part.last_read_message_id
                AND m.sender_account_id <> $1
                AND m.redacted_at IS NULL
                AND NOT m.hidden_for_recipient)::int AS unread,
            (SELECT m2.body FROM dm_messages m2
              WHERE m2.conversation_id = c.id
                AND m2.redacted_at IS NULL
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
        AND EXISTS (SELECT 1 FROM dm_messages m
                     WHERE m.conversation_id = part.conversation_id
                       AND m.id > part.last_read_message_id
                       AND m.sender_account_id <> $1
                       AND m.redacted_at IS NULL
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
    `SELECT folder, last_read_message_id, media_consent_at, media_consent_revoked_at
       FROM dm_participants WHERE conversation_id=$1 AND account_id=$2`, [conversationId, me]);
  if (!member.rows.length) return null;

  const rows = await p.query(
    `SELECT id, sender_account_id, body, created_at, redacted_at, hidden_for_recipient
       FROM dm_messages
      WHERE conversation_id=$1
        AND ($2::bigint IS NULL OR id < $2::bigint)
      ORDER BY id DESC LIMIT $3`, [conversationId, before, n]);

  return {
    folder: member.rows[0].folder,
    lastReadMessageId: Number(member.rows[0].last_read_message_id),
    mediaConsent: {
      given: Boolean(member.rows[0].media_consent_at) && !member.rows[0].media_consent_revoked_at,
      // Kept so "was this sent under a consent that still stands?" remains
      // answerable when the pipeline exists.
      revokedAt: member.rows[0].media_consent_revoked_at,
    },
    messages: rows.rows.map((m) => ({
      id: Number(m.id),
      mine: m.sender_account_id === me,
      // A redacted message keeps its envelope and loses its body. Hidden means
      // hidden from the RECIPIENT only — the sender still sees what they sent.
      body: m.redacted_at ? null
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

/** Accept a request: the thread moves out of the requests folder. */
export async function acceptRequest(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE dm_conversations SET state='accepted', accepted_at=COALESCE(accepted_at, now())
        WHERE id=$1 AND state <> 'accepted'
          AND opened_by <> $2
          AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id=$1 AND account_id=$2)
        RETURNING id`, [conversationId, me]);
    await client.query(
      `UPDATE dm_participants SET folder='inbox' WHERE conversation_id=$1 AND account_id=$2`,
      [conversationId, me]);
    await client.query("COMMIT");
    return r.rowCount > 0;
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
      `SELECT opened_by FROM dm_conversations c
        WHERE c.id=$1 AND EXISTS (
          SELECT 1 FROM dm_participants WHERE conversation_id=$1 AND account_id=$2)`,
      [conversationId, me]);
    if (!convo.rows.length) { await client.query("ROLLBACK"); return false; }
    const them = convo.rows[0].opened_by;
    await client.query(
      `UPDATE dm_conversations SET state='declined', declined_at=COALESCE(declined_at, now())
        WHERE id=$1`, [conversationId]);
    await client.query(
      `UPDATE dm_participants SET folder='archived' WHERE conversation_id=$1 AND account_id=$2`,
      [conversationId, me]);
    if (block && them !== me) {
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
  await p.query(
    `INSERT INTO dm_blocks (blocker_account_id, blocked_account_id, source)
     VALUES ($1,$2,'manual') ON CONFLICT (blocker_account_id, blocked_account_id) DO NOTHING`,
    [me, them]);
}

export async function unblockAccount(meRaw, themRaw) {
  const me = accountId(meRaw), them = accountId(themRaw);
  const p = await pool();
  const r = await p.query(
    `DELETE FROM dm_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2`, [me, them]);
  return r.rowCount > 0;
}

/** Everyone I have blocked, including the decline-blocks I may not remember. */
export async function listBlocks(meRaw) {
  const me = accountId(meRaw);
  const p = await pool();
  const r = await p.query(
    `SELECT blocked_account_id, source, created_at FROM dm_blocks
      WHERE blocker_account_id=$1 ORDER BY created_at DESC`, [me]);
  return r.rows.map((x) => ({ accountId: x.blocked_account_id, source: x.source, at: x.created_at }));
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
