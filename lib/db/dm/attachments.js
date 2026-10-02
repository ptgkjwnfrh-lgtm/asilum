// lib/db/dm/attachments.js — AN IMAGE IN A THREAD (V.2 brief §3, schema v59).
// SERVER-ONLY, and reached only when the media pipeline is enabled
// (OWNER-DECISIONS #3; lib/dm/media.js dmMediaAvailable).
//
//   recordAttachment    ONE transaction: the recipient's media consent is
//                       read INSIDE it (the later of grant/revoke), the message
//                       row (kind 'attachment') and the dm_attachments row land
//                       together, and the conversation's own laws fire on the
//                       insert as for text. A second upload of the same bytes
//                       into the SAME conversation is the first one again
//                       (UNIQUE (conversation_id, sha256)); the same bytes in
//                       another conversation are a separate object — dedupe
//                       never crosses an authorisation boundary.
//   attachmentsFor      what the thread reader shows THIS viewer now: a
//                       signed thumbnail URL always; a signed display URL only
//                       while the image is younger than six calendar months
//                       (archived: the viewer taps to load — loadDisplay).
//                       Authorisation is re-done on every call, so an old URL
//                       is just an expired URL.
//   loadDisplay         the explicit load of an archived image.
//   archiveSweep        the job that stamps archived_at once the boundary
//                       passes. Nothing is deleted; nothing moves tier (the
//                       note explains why that would cost more, not less).

import { MessageRefused, accountId, pairLockKey, pool, stageCApplied } from "./core.js";
import { archiveBoundary, isArchived } from "../../dm.js";
import { mediaConsentGiven } from "./settings.js";
import { dmMediaAvailable, signDmPath, storeDmImages } from "../../dm/media.js";

/**
 * Record one processed upload into a conversation. `processed` is the
 * result of lib/dm/media.js processImage. Returns { id, at, attachmentId,
 * duplicate }.
 */
export async function recordAttachment({ conversationId, senderId, processed, caption = null }) {
  const gate = dmMediaAvailable();
  if (!gate.available) throw new MessageRefused("DM_MEDIA_OFF", gate.reason);
  const sender = accountId(senderId);
  const p = await pool();
  if (!(await stageCApplied(p))) throw new MessageRefused("DM_SCHEMA", "attachments need schema v59 applied");
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const convo = await client.query(
      `SELECT c.lo_account_id, c.hi_account_id FROM dm_conversations c
        WHERE c.id=$1 AND $2 IN (c.lo_account_id, c.hi_account_id)`, [conversationId, sender]);
    if (!convo.rows.length) throw new MessageRefused("DM_NO_ACCESS", "dm: no such conversation");
    const { lo_account_id: lo, hi_account_id: hi } = convo.rows[0];
    const recipient = lo === sender ? hi : lo;
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [pairLockKey(lo, hi)]);
    // CONSENT, READ IN THE TRANSACTION: the recipient must currently accept
    // images in THIS conversation. The later of the two stamps is the state.
    const consent = await client.query(
      `SELECT media_consent_at, media_consent_revoked_at FROM dm_participants
        WHERE conversation_id=$1 AND account_id=$2 FOR SHARE`, [conversationId, recipient]);
    const row = consent.rows[0];
    if (!row || !mediaConsentGiven(row.media_consent_at, row.media_consent_revoked_at)) {
      throw new MessageRefused("DM_NO_CONSENT", "dm: they have not switched images on for this conversation");
    }
    // the same bytes already in THIS conversation: answer with that message
    const dup = await client.query(
      `SELECT a.id AS attachment_id, m.id, m.created_at FROM dm_attachments a JOIN dm_messages m ON m.id = a.message_id
        WHERE a.conversation_id=$1 AND a.sha256=$2 AND m.unsent_at IS NULL`, [conversationId, processed.sha256]);
    if (dup.rows.length) {
      await client.query("COMMIT");
      return { id: Number(dup.rows[0].id), at: dup.rows[0].created_at, attachmentId: Number(dup.rows[0].attachment_id), duplicate: true };
    }
    // the objects go to the bucket BEFORE the rows exist; a failed commit
    // leaves orphans the sweep can find by path, never a row without bytes
    const paths = await storeDmImages(conversationId, processed);
    const inserted = await client.query(
      `INSERT INTO dm_messages (conversation_id, sender_account_id, body, kind)
       VALUES ($1,$2,$3,'attachment') RETURNING id, created_at`,
      [conversationId, sender, caption && String(caption).trim() ? String(caption).trim() : "[image]"]);
    const a = await client.query(
      `INSERT INTO dm_attachments (message_id, conversation_id, sender_account_id, display_path, thumb_path, sha256, bytes, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [inserted.rows[0].id, conversationId, sender, paths.display, paths.thumb, processed.sha256, processed.display.bytes, processed.display.width, processed.display.height]);
    await client.query(`UPDATE dm_conversations SET last_activity_at = GREATEST(last_activity_at, $2::timestamptz) WHERE id=$1`, [conversationId, inserted.rows[0].created_at]);
    await client.query(`UPDATE dm_conversations SET state='accepted', accepted_at=COALESCE(accepted_at, clock_timestamp()) WHERE id=$1 AND state='requested' AND opened_by <> $2`, [conversationId, sender]);
    await client.query("COMMIT");
    return { id: Number(inserted.rows[0].id), at: inserted.rows[0].created_at, attachmentId: Number(a.rows[0].id), duplicate: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (["P0001", "P0002", "P0003", "P0004", "42501"].includes(error.code)) throw new MessageRefused(error.code, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The attachments on a page of messages, for THIS viewer, decided now.
 * { [messageId]: { thumbUrl, displayUrl|null, archived, width, height, bytes } }.
 * Membership was proven by the thread reader; it is proven again here, with
 * the viewer's clear boundary, because this is also what a signed URL is
 * minted from.
 */
export async function attachmentsFor(meRaw, conversationId, messageIds, { now = Date.now() } = {}) {
  const me = accountId(meRaw);
  const ids = (messageIds || []).map((x) => Math.trunc(Number(x)) || 0).filter(Boolean);
  const out = {};
  if (!ids.length || !dmMediaAvailable().available) return out;
  const p = await pool();
  if (!(await stageCApplied(p))) return out;
  const r = await p.query(
    `SELECT a.message_id, a.display_path, a.thumb_path, a.width, a.height, a.bytes, a.archived_at, m.created_at
       FROM dm_attachments a
       JOIN dm_messages m ON m.id = a.message_id
       JOIN dm_participants part ON part.conversation_id = a.conversation_id AND part.account_id = $2
      WHERE a.conversation_id = $1 AND a.message_id = ANY($3::bigint[])
        AND m.id > part.cleared_before_id AND m.unsent_at IS NULL AND m.redacted_at IS NULL`, [conversationId, me, ids]);
  for (const row of r.rows) {
    const archived = Boolean(row.archived_at) || isArchived(row.created_at, now);
    out[String(row.message_id)] = {
      thumbUrl: await signDmPath(row.thumb_path),
      displayUrl: archived ? null : await signDmPath(row.display_path),
      archived, archivedAt: row.archived_at || (archived ? archiveBoundary(row.created_at) : null),
      width: row.width, height: row.height, bytes: row.bytes,
    };
  }
  return out;
}

/** The explicit "Tap to load" of an archived image: a fresh signed URL, or null. */
export async function loadDisplay(meRaw, conversationId, messageId) {
  const me = accountId(meRaw);
  const r = await attachmentsFor(me, conversationId, [messageId], { now: 0 });   // now=0: nothing is archived by age, so the display URL is minted
  const a = r[String(Math.trunc(Number(messageId)) || 0)];
  return a ? a.displayUrl : null;
}

/** Stamp archived_at on every attachment past its boundary. Returns the count. */
export async function archiveSweep({ now = new Date() } = {}) {
  const p = await pool();
  if (!(await stageCApplied(p))) return 0;
  const r = await p.query(
    `UPDATE dm_attachments SET archived_at = $1::timestamptz
      WHERE archived_at IS NULL AND created_at <= ($1::timestamptz - interval '6 months')`, [new Date(now).toISOString()]);
  return r.rowCount;
}
