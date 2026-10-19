// lib/db/dm/edits.js — STAGE C OF THE MAIL DESK (V.2 brief §3–§4, schema v59).
//
// Four acts the desk did not have, each a law in Postgres first:
//
//   editMessage      the sender's own words, inside ONE HOUR of sending,
//                    carrying the version they last saw. The UPDATE's WHERE
//                    clause scopes it and the v59 trigger (dm_guard_edit)
//                    refuses it again — the route is not the only writer.
//   clearHistory     PER VIEWER. Advances this participant's hidden-history
//                    boundary (cleared_before_id) to the newest message; the
//                    other copy is untouched; a new message reintroduces the
//                    conversation without restoring what was cleared. The
//                    other participant is told once, neutrally (owner's
//                    requested behaviour; lib/dm.js clearNoticesEnabled).
//   searchMessages   the brief's syntax, parsed deterministically in
//                    lib/dm.js and answered by ONE predicate shared with the
//                    thread reader: my conversations, after my clear cutoff,
//                    never an unsent or redacted body, never a stranger's
//                    unaccepted knock. Nothing here reaches a model.
//   sendProfileCard  a passenger shared into the thread as a CARD that stores
//                    an entity id, never a copy of a bio. Refused server-side
//                    with the owner's exact words when the passenger switched
//                    sharing off — and identically when a block stands in
//                    either direction, so the refusal is not a block oracle.
//   (profileCardsFor, what a card RENDERS at view time, lives in people.js
//    beside the other who-is-this readers; readProfileSharing in settings.js.)
//
// STAGE C MAY RUN AHEAD OF ITS MIGRATION. stageCApplied() probes v59's
// columns once per process; every act here refuses honestly (DM_SCHEMA) and
// every reader elsewhere falls back to the v48 shape until the owner applies
// the file. Memory mode refuses like the rest of the desk (MessagingUnavailable).

import { MessageRefused, accountId, pairLockKey, pool, stageCApplied } from "./core.js";
import {
  SHARE_REFUSED_COPY, bodyRefusal, clearNoticesEnabled,
  normalizeBody, normalizeSearchText, parseDmSearch,
} from "../../dm.js";
import { enqueueNotification } from "../production/listingStatus.js";
import { sendMessage } from "./threads.js";

const EDIT_CODES = ["P0006", "P0007", "P0008", "42501"];

/**
 * Edit my own message. `expectedVersion` is the edit_version the client last
 * rendered: a stale client is refused (P0008), never merged.
 *
 * Returns { id, editVersion, editedAt }. Refusals are MessageRefused with the
 * SQLSTATE the law would raise, diagnosed from the caller's OWN row only.
 */
export async function editMessage(meRaw, messageId, body, expectedVersion) {
  const me = accountId(meRaw);
  const id = Math.trunc(Number(messageId)) || 0;
  if (!id) throw new MessageRefused("P0005", "dm: that message is gone");
  const text = normalizeBody(body);
  if (!text) throw new Error("dm: an empty message is not a message");
  const refusal = bodyRefusal(text);
  if (refusal) throw new MessageRefused("DM_TOO_LONG", refusal.message);
  const version = Math.trunc(Number(expectedVersion));
  if (!Number.isFinite(version) || version < 0) throw new MessageRefused("P0008", "dm: an edit must carry the version it saw");

  const p = await pool();
  if (!(await stageCApplied(p))) throw new MessageRefused("DM_SCHEMA", "editing needs schema v59 applied");
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asilum.dm_actor', $1, true)", [me]);
    const r = await client.query(
      `UPDATE dm_messages
          SET body = $3, edit_version = edit_version + 1, edited_at = clock_timestamp()
        WHERE id = $1 AND sender_account_id = $2
          AND unsent_at IS NULL AND redacted_at IS NULL AND kind = 'text'
          AND edit_version = $4
          AND created_at > clock_timestamp() - interval '1 hour'
        RETURNING id, edit_version, edited_at`, [id, me, text, version]);
    if (!r.rowCount) {
      // Diagnose from MY OWN row only: nothing below says anything about a
      // message the caller did not write.
      const own = await client.query(
        `SELECT edit_version, created_at, unsent_at, redacted_at, kind FROM dm_messages
          WHERE id = $1 AND sender_account_id = $2`, [id, me]);
      await client.query("ROLLBACK");
      const row = own.rows[0];
      if (!row || row.unsent_at || row.redacted_at || row.kind !== "text") throw new MessageRefused("P0006", "dm: that message cannot be edited");
      if (Date.now() - new Date(row.created_at).getTime() >= 3_600_000) throw new MessageRefused("P0007", "dm: the edit window is one hour");
      throw new MessageRefused("P0008", "dm: an edit must carry the next version");
    }
    await client.query("COMMIT");
    const row = r.rows[0];
    return { id: Number(row.id), editVersion: Number(row.edit_version), editedAt: row.edited_at };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (EDIT_CODES.includes(error.code)) throw new MessageRefused(error.code, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clear MY copy of a conversation. Returns null for a non-member (the same
 * answer as a conversation that does not exist), otherwise
 * { clearedBeforeId, clearedAt, noticed } — `noticed` says whether the other
 * participant's one notice was written (false when the switch is off, when
 * v58's outbox is unapplied, or when this exact clear was already noticed).
 */
export async function clearHistory(meRaw, conversationId) {
  const me = accountId(meRaw);
  const p = await pool();
  if (!(await stageCApplied(p))) throw new MessageRefused("DM_SCHEMA", "clearing needs schema v59 applied");
  const client = await p.connect();
  let result = null;
  let peer = null;
  try {
    await client.query("BEGIN");
    const member = await client.query(
      `SELECT c.lo_account_id, c.hi_account_id
         FROM dm_participants part JOIN dm_conversations c ON c.id = part.conversation_id
        WHERE part.conversation_id = $1 AND part.account_id = $2`, [conversationId, me]);
    if (!member.rows.length) { await client.query("ROLLBACK"); return null; }
    const { lo_account_id: lo, hi_account_id: hi } = member.rows[0];
    peer = lo === me ? hi : lo;
    // the pair lock orders this against a send that is landing right now, so
    // the boundary is the newest message that COMMITTED, never one in flight
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);
    const r = await client.query(
      `UPDATE dm_participants part
          SET cleared_before_id = GREATEST(part.cleared_before_id,
                (SELECT COALESCE(max(id), 0) FROM dm_messages m WHERE m.conversation_id = $1)),
              cleared_at = clock_timestamp(),
              last_read_message_id = GREATEST(part.last_read_message_id,
                (SELECT COALESCE(max(id), 0) FROM dm_messages m WHERE m.conversation_id = $1))
        WHERE part.conversation_id = $1 AND part.account_id = $2
        RETURNING cleared_before_id, cleared_at`, [conversationId, me]);
    await client.query("COMMIT");
    result = { clearedBeforeId: Number(r.rows[0].cleared_before_id), clearedAt: r.rows[0].cleared_at, noticed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  // THE NOTICE, after the commit: neutral, once per clear, and never the
  // reason a clear fails. "cleared their own copy" — never "deleted yours".
  if (clearNoticesEnabled() && peer) {
    const at = new Date(result.clearedAt).toISOString();
    const n = await enqueueNotification({
      userId: "sb-" + peer, kind: "dm-cleared", subjectId: `${conversationId}:${at}`,
      payload: { conversationId, at, text: "the other passenger cleared their own copy of this conversation." },
    }).catch(() => ({ queued: false }));
    result.noticed = Boolean(n.queued);
  }
  return result;
}

/** '%' and '_' are LIKE's own; a searcher's words are literal. */
function likePattern(s) {
  return "%" + String(s).toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c) + "%";
}

/** A short window of the body around the first hit, for the result list. */
export function excerptAround(body, needle, width = 90) {
  const text = normalizeSearchText(body);
  const at = needle ? text.toLowerCase().indexOf(String(needle).toLowerCase()) : -1;
  if (text.length <= width) return text;
  const start = Math.max(0, (at < 0 ? 0 : at) - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

/**
 * The brief's four forms. Returns { mode: "conversations" | "messages",
 * hits, hasMore }. Conversations: `*handle` alone — the viewer's threads with
 * that passenger. Messages: words, or `*handle: words`, or a "quoted phrase".
 *
 * ONE ACCESS PREDICATE, shared in spirit with readThread: my participation,
 * my clear boundary, no unsent, no redacted, no hidden-from-me, and no
 * REQUESTS folder — an unaccepted stranger's words are not mine to search,
 * for the reason the inbox shows them no preview.
 */
export async function searchMessages(meRaw, input, { limit = 30 } = {}) {
  const me = accountId(meRaw);
  const parsed = typeof input === "string" ? parseDmSearch(input) : input;
  const n = Math.max(1, Math.min(100, Math.trunc(Number(limit)) || 30));
  if (!parsed || parsed.empty) return { mode: "messages", hits: [], hasMore: false, parsed };
  const p = await pool();
  const applied = await stageCApplied(p);
  const cleared = applied ? "part.cleared_before_id" : "0::bigint";
  const kindFilter = applied ? "AND m.kind = 'text'" : "";

  // the passenger, if named: by PUBLISHED handle, never by uuid, and NOT
  // through resolveAddressee — a block does not erase my own history
  let other = null;
  if (parsed.handle) {
    const r = await p.query(`SELECT account_id FROM profile_rooms WHERE handle = $1 LIMIT 1`, [parsed.handle]);
    if (!r.rows.length) return { mode: parsed.text ? "messages" : "conversations", hits: [], hasMore: false, parsed };
    other = r.rows[0].account_id;
  }

  if (parsed.handle && !parsed.text) {
    const r = await p.query(
      `SELECT c.id, c.last_activity_at, part.folder,
              (SELECT m2.body FROM dm_messages m2
                WHERE m2.conversation_id = c.id AND m2.id > ${cleared}
                  AND m2.redacted_at IS NULL AND m2.unsent_at IS NULL AND m2.body IS NOT NULL
                  AND NOT (m2.hidden_for_recipient AND m2.sender_account_id <> $1)
                ORDER BY m2.id DESC LIMIT 1) AS last_body
         FROM dm_participants part JOIN dm_conversations c ON c.id = part.conversation_id
        WHERE part.account_id = $1 AND part.folder <> 'requests'
          AND (CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END) = $2
        ORDER BY c.last_activity_at DESC LIMIT $3`, [me, other, n + 1]);
    const hasMore = r.rows.length > n;
    if (hasMore) r.rows.length = n;
    return {
      mode: "conversations", parsed, hasMore,
      hits: r.rows.map((row) => ({ conversationId: row.id, handle: parsed.handle, folder: row.folder, at: row.last_activity_at, excerpt: row.last_body ? excerptAround(row.last_body, "") : null })),
    };
  }

  // messages: every word must be present (exact substring, case-folded,
  // curly quotes folded on BOTH sides); a quoted phrase is one word
  const words = parsed.exact ? [parsed.text] : parsed.text.split(" ").filter(Boolean);
  const params = [me, other, n + 1];
  const clauses = words.map((w) => { params.push(likePattern(w)); return `regexp_replace(lower(m.body), '[‘’‚‛′]', '''', 'g') LIKE $${params.length} ESCAPE '\\'`; });
  const r = await p.query(
    `SELECT m.id, m.conversation_id, m.body, m.created_at, (m.sender_account_id = $1) AS mine,
            CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END AS other_id
       FROM dm_participants part
       JOIN dm_conversations c ON c.id = part.conversation_id
       JOIN dm_messages m ON m.conversation_id = c.id
      WHERE part.account_id = $1 AND part.folder <> 'requests'
        AND m.id > ${cleared}
        AND m.unsent_at IS NULL AND m.redacted_at IS NULL AND m.body IS NOT NULL
        AND NOT (m.hidden_for_recipient AND m.sender_account_id <> $1)
        ${kindFilter}
        AND ($2::uuid IS NULL OR (CASE WHEN c.lo_account_id = $1 THEN c.hi_account_id ELSE c.lo_account_id END) = $2::uuid)
        AND ${clauses.join(" AND ")}
      ORDER BY m.id DESC LIMIT $3`, params);
  const hasMore = r.rows.length > n;
  if (hasMore) r.rows.length = n;
  const ids = [...new Set(r.rows.map((x) => x.other_id))];
  const handles = ids.length ? (await p.query(`SELECT account_id, handle FROM profile_rooms WHERE account_id = ANY($1::uuid[]) AND handle IS NOT NULL`, [ids])).rows.reduce((o, x) => (o[x.account_id] = x.handle, o), {}) : {};
  return {
    mode: "messages", parsed, hasMore,
    hits: r.rows.map((row) => ({
      conversationId: row.conversation_id, messageId: Number(row.id), mine: row.mine,
      handle: handles[row.other_id] || null, at: row.created_at,
      excerpt: excerptAround(row.body, words[0]),
    })),
  };
}

/**
 * Share a passenger into a conversation as a card. The checks are all the
 * passenger's (sharing on, published, visible) and the pair's (no block
 * either way between sharer and passenger); the conversation's own laws —
 * block, closed door, one knock — then fire on the insert exactly as for text.
 */
export async function sendProfileCard(meRaw, conversationId, handleRaw, { clientOperationId = null } = {}) {
  const me = accountId(meRaw);
  const handle = String(handleRaw || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{3,24}$/.test(handle)) throw new MessageRefused("DM_NO_SUCH_PASSENGER", "dm: no passenger by that handle");
  const p = await pool();
  if (!(await stageCApplied(p))) throw new MessageRefused("DM_SCHEMA", "profile cards need schema v59 applied");
  const r = await p.query(
    `SELECT r.account_id, r.published, r.moderation_status, COALESCE(s.profile_sharing, true) AS sharing,
            EXISTS (SELECT 1 FROM dm_blocks b
                     WHERE (b.blocker_account_id = $2 AND b.blocked_account_id = r.account_id)
                        OR (b.blocker_account_id = r.account_id AND b.blocked_account_id = $2)) AS blocked
       FROM profile_rooms r LEFT JOIN dm_settings s ON s.account_id = r.account_id
      WHERE r.handle = $1`, [handle, me]);
  const row = r.rows[0];
  if (!row || !row.published || row.moderation_status !== "visible") throw new MessageRefused("DM_NO_SUCH_PASSENGER", "dm: no passenger by that handle");
  // sharing off and a block collapse to the owner's words: a block is private
  if (!row.sharing || row.blocked) throw new MessageRefused("DM_SHARE_REFUSED", SHARE_REFUSED_COPY);
  const sent = await sendMessage({
    conversationId, senderId: me, body: "*" + handle, clientOperationId,
    kind: "profile-card", sharedProfileAccountId: row.account_id,
  });
  // the passenger is told — without sender or recipient, once per day
  if (!sent.duplicate) {
    const day = new Date().toISOString().slice(0, 10);
    await enqueueNotification({
      userId: "sb-" + row.account_id, kind: "profile-shared", subjectId: "day:" + day,
      payload: { day, text: "your profile was shared in a message today." },
    }).catch(() => {});
  }
  return { ...sent, handle };
}
