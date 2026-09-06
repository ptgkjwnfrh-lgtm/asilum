// lib/db/dm/threads.js — A CONVERSATION.
//
// Opening one, saying something in it, reading it back. The four laws the v40
// triggers enforce all fire on the send path, so sendMessage's job is to take
// the per-pair advisory lock, attempt the insert, and translate a SQLSTATE
// into a MessageRefused a caller can act on — never to pre-check a law in JS,
// which would be a second implementation of it.
//
// visibleBody is the single place the redaction rule lives: an unsent message
// keeps its envelope (who, when, that it existed) in one column and loses its
// text in another, so the thread still reads as a conversation with a gap in
// it rather than silently reflowing around a message that was there.
//
// Pagination is keyset, not offset, and the two readers do it differently on
// purpose. readThread asks for n+1 rows to learn whether an older page exists
// without a second count query. listFolder cannot: its cursor carries a
// SNAPSHOT time as well as the position, so a conversation that becomes active
// mid-scroll cannot jump above the cursor and be read twice — it issues a
// cursor whenever the page came back full. Neither one runs a COUNT.

import { MessageRefused, accountId, orderPair, pairLockKey, pool } from "./core.js";
import { decodeCursor, encodeCursor, normalizeBody } from "../../dm.js";
import { handlesFor } from "./people.js";
import { mediaConsentGiven } from "./settings.js";

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
    // MEMBERSHIP IS PART OF THE LOOKUP, so "no such conversation" and "not
    // yours" are one answer.
    //
    // This read had no membership predicate and threw a plain Error when the
    // row was absent — `error.code` undefined, so the MessageRefused wrapper
    // did not apply and the route answered 500. When the row DID exist and the
    // sender was not a party, dm_guard_message raised 42501, which the wrapper
    // did catch, and the route answered 409. A stranger reading the status
    // code alone learned whether a conversation uuid names something real.
    //
    // The trigger still refuses the write — the route is not the only writer —
    // but it is no longer the thing that answers.
    const convo = await client.query(
      `SELECT lo_account_id, hi_account_id FROM dm_conversations
        WHERE id=$1 AND $2 IN (lo_account_id, hi_account_id)`, [conversationId, sender]);
    if (!convo.rows.length) {
      // Collapsed by describeRefusal's default, exactly like a handle that
      // resolves to nobody: 409, "this person is not reachable right now."
      throw new MessageRefused("DM_NO_ACCESS", "dm: no such conversation");
    }
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

    // ANSWERING A KNOCK ACCEPTS IT.
    //
    // Pressing ACCEPT was the only way a conversation could reach 'accepted',
    // and that button renders only when the reader's folder is 'requests'
    // (MailDesk). Two consequences, both reachable in the shipped product:
    //
    //   A recipient who simply REPLIED left the conversation at 'requested'.
    //   LAW 3 gates on `state <> 'accepted' AND sender = opened_by`, so the
    //   opener stayed frozen at one message — and the refusal they were shown
    //   read "one message until they reply." after they had replied.
    //
    //   Worse, #392 put a followed sender's knock straight into the
    //   recipient's INBOX. The state stays 'requested', the folder is not
    //   'requests', so the accept button never renders at all: the thread can
    //   never advance, presence is dead in it forever (v46 gates on accepted),
    //   and the opener is frozen for the life of the conversation. A thread
    //   the recipient asked for was the one that could not be answered.
    //
    // A reply is consent, plainly, and it is the same act the button performs.
    // Scoped to the NON-opener so a knocker cannot accept their own knock, and
    // predicated on 'requested' so it cannot revive a decline.
    await client.query(
      `UPDATE dm_conversations
          SET state='accepted', accepted_at=COALESCE(accepted_at, clock_timestamp())
        WHERE id=$1 AND state='requested' AND opened_by <> $2`, [conversationId, sender]);
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
  // WHO THIS IS WITH comes back with it. The thread header said "← THE MAIL
  // DESK, MUTE, BLOCK" and nothing else — no name — because the wire never
  // carried one, so a reader had to remember which row they had clicked. The
  // uuid stays here and only the HANDLE goes out (law 7); somebody who never
  // published a room has none, and the panel says so in words rather than
  // rendering a blank.
  const member = await p.query(
    `SELECT part.folder, part.last_read_message_id,
            part.media_consent_at, part.media_consent_revoked_at,
            (part.muted_at IS NOT NULL) AS muted,
            CASE WHEN c.lo_account_id = $2 THEN c.hi_account_id ELSE c.lo_account_id END AS other_id
       FROM dm_participants part
       JOIN dm_conversations c ON c.id = part.conversation_id
      WHERE part.conversation_id=$1 AND part.account_id=$2`, [conversationId, me]);
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
    with: (await handlesFor([member.rows[0].other_id]))[member.rows[0].other_id] || null,
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
