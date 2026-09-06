// lib/db/dm/reactions.js — MARKS ON A MESSAGE, AND TAKING ONE BACK.
//
// AN OPEN EMOJI FIELD IS A COVERT TEXT CHANNEL. Someone blocked from sending
// words can spell them one reaction at a time, so the palette is a SELECT-only
// law table in the database rather than a list in this file: reactionKinds()
// reads it, and the app role has no privilege to add a row (verified 42501 as
// asilum_app in production — CI runs as superuser and therefore CANNOT test
// this grant).
//
// Unsend keeps the envelope in a different column from the redacted body, so
// "this message was withdrawn" stays true and readable while its text is gone.
// The inbox preview reads the same rule; it used to keep quoting unsent
// messages in the thread list.

import { MessageRefused, accountId, pool } from "./core.js";

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
  // MEMBERSHIP FIRST, AND THE SAME ANSWER EITHER WAY.
  //
  // dm_messages.id is a BIGSERIAL — sequential and guessable, unlike every
  // conversation uuid — and the route passes body.messageId here with no gate.
  // The trigger then raised 23503 for "no such message" and 42501 for "you are
  // not in that conversation", and #399 gave those two DISTINCT wire strings.
  // So "that mark is not available" came to mean exactly: this id names a real
  // message in a conversation you are not party to. A walk of the id space
  // maps the product, at 240 probes an hour.
  //
  // The comment #399 wrote in lib/dm.js said 42501 came from "a reaction from
  // someone who is not in the conversation — which no surface can produce".
  // This is that surface. The justification was the thing that was wrong.
  //
  // Resolved here so both cases answer identically: a message I cannot see is
  // a message that is gone, which is what a caller with no claim to it should
  // hear whatever the reason.
  const visible = await p.query(
    `SELECT 1 FROM dm_messages m
       JOIN dm_participants part ON part.conversation_id = m.conversation_id
      WHERE m.id = $1 AND part.account_id = $2`, [id, me]);
  if (!visible.rows.length) throw new MessageRefused("P0005", "dm: that message is gone");
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
