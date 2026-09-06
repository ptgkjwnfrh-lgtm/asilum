// lib/db/dm/activity.js — READ RECEIPTS AND TYPING.
//
// RECIPROCITY IS THE WHOLE CONTROL. Switching your signals off also switches
// off your ability to see anyone else's — without that it is a one-way mirror,
// which is exactly what a privacy setting is meant to prevent. It is enforced
// in the READ, not in the UI, so a caller hitting the API directly gets the
// same answer the panel does.
//
// EVERY DENIED CASE RETURNS THE SAME FROZEN CONSTANT. That is not tidiness:
// the payload was once `Number(last_read_message_id) || 0`, which made "signals
// on, read nothing" return 0 while "signals off" returned null — a difference
// you could read the peer's setting off. Booleans only, one shared shape for
// every refusal, and NOTHING_TO_REPORT contains no null.
//
// Typing carries an EXPIRY rather than a flag, so a client that disappears
// mid-keystroke stops typing on its own instead of typing forever.

import { accountId, pool } from "./core.js";

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
  // MEMBERSHIP IS IN THE SELECT, not left to the trigger. The trigger raises
  // 42501 for a non-member, and pingTyping has no catch — so the raw error
  // reached the route as a generic 500 while a nonexistent or unaccepted
  // conversation answered 200 {ok:false}. That split is an existence-and-state
  // oracle, and #387 created it: before, the INSERT was unconditional and both
  // cases surfaced as a 500, indistinguishable.
  //
  // With the predicate here, every case a caller is not entitled to an answer
  // about produces the SAME answer: false, quietly. The trigger keeps its
  // check as the law — the route is not the only writer — but it is no longer
  // the thing a stranger can hear.
  const r = await p.query(
    `INSERT INTO dm_typing (conversation_id, account_id, typing_until)
     SELECT c.id, $2, now() + ($3 || ' seconds')::interval
       FROM dm_conversations c
      WHERE c.id = $1 AND c.state = 'accepted'
        AND EXISTS (SELECT 1 FROM dm_participants
                     WHERE conversation_id = c.id AND account_id = $2)
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

  // THE NEWEST MESSAGE IN MY OWN THREAD, which is what makes an open thread
  // receive. Nothing refetched a thread before: `loadThread` ran on open and
  // after the reader's OWN actions, the badge poll moved only counts, and this
  // poll moved only typing and read — so the other person's message never
  // arrived. You watched "typing…" and then nothing.
  //
  // It is not a fact about them: it is the id of the newest message in a
  // conversation this caller is a participant of, and they can already see
  // every id in it. Membership-scoped, so a non-member gets 0 — the same
  // answer as a conversation that does not exist.
  const own = await p.query(
    `SELECT (SELECT max(m.id) FROM dm_messages m WHERE m.conversation_id = $1) AS newest
       FROM dm_participants WHERE conversation_id=$1 AND account_id=$2`, [conversationId, me]);
  const newest = own.rows.length ? Number(own.rows[0].newest) || 0 : 0;

  // Reciprocity first: if MY signals are off I see nothing, whatever they set.
  if (!(await readActivitySignals(me))) return { ...NOTHING_TO_REPORT, newest, reciprocal: false };

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
  if (!r.rows.length) return { ...NOTHING_TO_REPORT, newest, reciprocal: true };

  const peer = r.rows[0];
  // THEIR setting governs what they emit.
  if (!peer.signals) return { ...NOTHING_TO_REPORT, newest, reciprocal: true };
  return {
    typing: Boolean(peer.typing),
    readYours: Boolean(peer.my_newest)
      && Number(peer.last_read_message_id) >= Number(peer.my_newest),
    newest,
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
