// lib/db/dm/consent.js — WHO MAY REACH YOU.
//
// Accept, decline, block, unblock, and the reads that answer "did I block
// them". Every one of these is a decision a person made about another person,
// which is why none of them destroys the record that the decision happened:
// leaving 'accepted' does not erase that consent was once given, and erasure
// deliberately RETAINS blocks — silently reopening a door someone closed is
// the worst thing this module could do.
//
// A block is symmetric by law (the trigger stops delivery in BOTH directions),
// and the ⚖ ruling of 23 August stands: a person who blocked you stays LISTED
// in search and stays UNADDRESSABLE. Search must not become an oracle that
// tells you whether you were blocked.

import { accountId, orderPair, pairLockKey, pool } from "./core.js";
import { peerOf } from "./people.js";

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
      // MEMBERSHIP-SCOPED, and it was not. This re-read is the idempotence
      // branch #381 added, and it answered for ANY conversation id: a stranger
      // POSTing op="accept" with a well-formed uuid got {ok:true} for an
      // accepted conversation and {ok:false} for a nonexistent, requested or
      // declined one. One probe, no write, no trace — an existence AND state
      // oracle, made by the round that fixed the state machine.
      //
      // readThread's rule is the standard: a non-member gets the same answer
      // as a nonexistent conversation.
      const now = await client.query(
        `SELECT state, opened_by FROM dm_conversations c
          WHERE c.id=$1 AND EXISTS (
            SELECT 1 FROM dm_participants WHERE conversation_id=$1 AND account_id=$2)`,
        [conversationId, me]);
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
