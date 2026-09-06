// lib/db/dm/mute.js — SILENCE THE BADGE, AND NOTHING ELSE.
//
// Mute does not stop delivery, does not mark anything read, and does not
// change what the thread shows once you open it. It suppresses the unread
// COUNT and nothing more.
//
// It is also undetectable by the sender — no receipt changes, no delivery
// changes, nothing observable from the other side. A mute the other person can
// notice is a message, and this control exists precisely so you do not have to
// send one.

import { accountId, pool } from "./core.js";

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
