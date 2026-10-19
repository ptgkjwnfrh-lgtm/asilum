// lib/db/production/wardrobeTransfers.js — THE GIFT'S TRANSACTIONS (V.2
// brief §8, schema v60). SERVER-ONLY; memory mode mirrors every law.
//
//   resolveGiftRecipient  a HANDLE → the passenger it names, or null. By
//                         published, visible room only; refused when a DM
//                         block stands either way (a gift is a message with a
//                         card in it); the uuid never goes to the client.
//   offerGift             the pending transfer. Idempotent on the sender's
//                         key; refused when the card already has an open
//                         offer (the partial unique index IS the lock), is not
//                         the sender's, or is not active. The recipient is
//                         told (in-app, kind wardrobe-gift).
//   acceptGift            ONE transaction: the transfer FOR UPDATE, the item
//                         FOR UPDATE, both re-checked under the locks, the
//                         card's user_id moved, provenance 'transferred', an
//                         event row. Two concurrent accepts: one wins, one is
//                         "no longer pending". The sender keeps the snapshot
//                         on the transfer (their receipt) and the ticket.
//   declineGift / cancelGift / expireGifts   final states; ownership untouched.
//   listGifts             incoming (pending, to me), outgoing (pending, from
//                         me), given (accepted, from me), received (accepted,
//                         to me) — each with the snapshot and the disclaimer.
//
// v60 MAY BE UNAPPLIED where this runs (the deploy-ahead rule): every reader
// answers empty and every writer refuses by name until the table exists.

// the PRODUCTION memory store holds the wardrobe (not core/store.js — the two
// `mem` objects are different; interpretation.js writes to this one)
import { getPool, hasRelation } from "../core/pool.js";
import { withUserLock } from "../index.js";
import { mem } from "./store.js";
import { getProfileRoomByHandle } from "./interpretation.js";
import { enqueueNotification } from "./listingStatus.js";
import { GIFT_NOTE_MAX, TRANSFER_DISCLAIMER, giftExpired, giftExpiry, giftSnapshot, giftTransition } from "../../wardrobe/gifts.js";

mem.wardrobe ||= [];
mem.transfers ||= [];
mem.transferEvents ||= [];
let memSeq = 1;

export class GiftRefused extends Error {
  constructor(code, message) { super(message); this.name = "GiftRefused"; this.code = code; }
}

async function applied(p) { return p ? hasRelation(p, "wardrobe_transfers") : true; }
const identityOf = (accountId) => "sb-" + String(accountId).toLowerCase();

function transferOut(r) {
  return {
    id: String(r.id), itemId: String(r.item_id), fromUserId: r.from_user_id, toUserId: r.to_user_id,
    fromHandle: r.from_handle || null, toHandle: r.to_handle || null, state: r.state, note: r.note || null,
    item: r.item_snapshot || {}, createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    disclaimer: TRANSFER_DISCLAIMER,
  };
}

/** The passenger a handle names, for gifting — or null, without saying why. */
export async function resolveGiftRecipient(fromUserId, handleRaw) {
  const handle = String(handleRaw || "").trim().toLowerCase().replace(/^\*/, "");
  if (!/^[a-z0-9-]{3,24}$/.test(handle)) return null;
  const room = await getProfileRoomByHandle(handle);
  if (!room || !room.published || (room.moderationStatus && room.moderationStatus !== "visible")) return null;
  const toUserId = identityOf(room.accountId);
  if (toUserId === fromUserId) return null;
  const p = await getPool();
  if (p && /^sb-/.test(fromUserId)) {
    // a block either way, in the mail desk's ledger, closes the gift too
    const me = fromUserId.slice(3);
    const b = await p.query(
      `SELECT 1 FROM dm_blocks WHERE (blocker_account_id = $1 AND blocked_account_id = $2)
                                  OR (blocker_account_id = $2 AND blocked_account_id = $1) LIMIT 1`, [me, room.accountId]).catch(() => ({ rows: [] }));
    if (b.rows.length) return null;
  }
  return { handle, accountId: room.accountId, toUserId };
}

async function senderHandle(fromUserId) {
  if (!/^sb-/.test(fromUserId)) return null;
  const p = await getPool();
  if (!p) { for (const room of mem.profileRooms?.values?.() || []) if (room.accountId === fromUserId.slice(3)) return room.handle || null; return null; }
  const r = await p.query(`SELECT handle FROM profile_rooms WHERE account_id = $1`, [fromUserId.slice(3)]).catch(() => ({ rows: [] }));
  return r.rows[0]?.handle || null;
}

/** Offer one of my active cards to a resolved passenger. */
export async function offerGift(fromUserId, { itemId, toHandle, note = null, idempotencyKey = null }) {
  const from = String(fromUserId || "");
  if (!from) throw new TypeError("sender required");
  const to = await resolveGiftRecipient(from, toHandle);
  if (!to) throw new GiftRefused("no-recipient", "that passenger cannot receive gifts right now.");
  const text = note == null ? null : String(note).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, GIFT_NOTE_MAX) || null;
  const key = idempotencyKey && /^[A-Za-z0-9_-]{8,64}$/.test(String(idempotencyKey)) ? String(idempotencyKey) : null;
  const fromHandle = await senderHandle(from);
  const p = await getPool();
  if (!(await applied(p))) throw new GiftRefused("unapplied", "gifting needs schema v60 applied");

  let out;
  if (!p) {
    out = await withUserLock(from, async () => {
      if (key) { const same = mem.transfers.find((t) => t.from_user_id === from && t.idempotency_key === key); if (same) return { ...transferOut(same), duplicate: true }; }
      const item = mem.wardrobe.find((w) => w.user_id === from && String(w.id) === String(itemId) && w.status === "active");
      if (!item) throw new GiftRefused("no-such-piece", "that piece is not in your active wardrobe.");
      if (mem.transfers.some((t) => String(t.item_id) === String(item.id) && t.state === "pending")) throw new GiftRefused("already-offered", "that piece already has an open offer.");
      const row = { id: memSeq++, item_id: item.id, from_user_id: from, to_user_id: to.toUserId, to_account_id: to.accountId, from_handle: fromHandle, to_handle: to.handle, state: "pending", note: text, item_snapshot: giftSnapshot({ title: item.title, brand: item.brand, category: item.category, sizeLabel: item.size_label, source: item.source }), idempotency_key: key, created_at: new Date(), expires_at: new Date(giftExpiry()), decided_at: null };
      mem.transfers.push(row);
      mem.transferEvents.push({ transfer_id: row.id, item_id: item.id, event: "offered", actor_user_id: from, at: new Date() });
      return { ...transferOut(row), duplicate: false };
    });
  } else {
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${from}`]);
      if (key) {
        const same = await client.query(`SELECT * FROM wardrobe_transfers WHERE from_user_id = $1 AND idempotency_key = $2`, [from, key]);
        if (same.rows.length) { await client.query("COMMIT"); return { ...transferOut(same.rows[0]), duplicate: true }; }
      }
      const it = await client.query(`SELECT * FROM wardrobe_items WHERE user_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`, [from, /^\d{1,18}$/.test(String(itemId)) ? itemId : 0]);
      if (!it.rows.length) throw new GiftRefused("no-such-piece", "that piece is not in your active wardrobe.");
      const item = it.rows[0];
      const snapshot = giftSnapshot({ title: item.title, brand: item.brand, category: item.category, sizeLabel: item.size_label, source: item.source });
      let ins;
      try {
        ins = await client.query(
          `INSERT INTO wardrobe_transfers (item_id, from_user_id, to_user_id, to_account_id, from_handle, to_handle, note, item_snapshot, idempotency_key, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
          [item.id, from, to.toUserId, to.accountId, fromHandle, to.handle, text, JSON.stringify(snapshot), key, giftExpiry()]);
      } catch (error) {
        if (error.code === "23505") throw new GiftRefused("already-offered", "that piece already has an open offer.");
        throw error;
      }
      await client.query(`INSERT INTO wardrobe_transfer_events (transfer_id, item_id, event, actor_user_id) VALUES ($1,$2,'offered',$3)`, [ins.rows[0].id, item.id, from]);
      await client.query("COMMIT");
      out = { ...transferOut(ins.rows[0]), duplicate: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  if (!out.duplicate) {
    await enqueueNotification({ userId: to.toUserId, kind: "wardrobe-gift", subjectId: "offer:" + out.id,
      payload: { transferId: out.id, from: fromHandle, title: out.item.title, text: `${fromHandle || "a passenger"} offers you ${out.item.title}. ${TRANSFER_DISCLAIMER}` } }).catch(() => {});
  }
  return out;
}

/** Decide a transfer. `act` = accept | decline (recipient) | cancel (sender). */
async function decide(userId, transferId, act) {
  const me = String(userId || "");
  const id = /^\d{1,18}$/.test(String(transferId)) ? Number(transferId) : 0;
  if (!me || !id) return { ok: false, reason: "not-pending" };
  const p = await getPool();
  if (!(await applied(p))) throw new GiftRefused("unapplied", "gifting needs schema v60 applied");
  const role = act === "cancel" ? "sender" : "recipient";

  if (!p) {
    // the user lock serialises the recipient's acts; the sender's cancel takes the same lock on the item's owner
    return withUserLock(me, async () => {
      const t = mem.transfers.find((x) => x.id === id && (role === "sender" ? x.from_user_id === me : x.to_user_id === me));
      if (!t || t.state !== "pending") return { ok: false, reason: "not-pending" };
      if (giftExpired(t.expires_at)) { t.state = "expired"; t.decided_at = new Date(); mem.transferEvents.push({ transfer_id: t.id, item_id: t.item_id, event: "expired", actor_user_id: null, at: new Date() }); return { ok: false, reason: "expired" }; }
      const next = giftTransition(t.state, act, role);
      if (!next) return { ok: false, reason: "not-pending" };
      if (act === "accept") {
        const item = mem.wardrobe.find((w) => String(w.id) === String(t.item_id) && w.user_id === t.from_user_id && w.status === "active");
        if (!item) { t.state = "cancelled"; t.decided_at = new Date(); mem.transferEvents.push({ transfer_id: t.id, item_id: t.item_id, event: "cancelled", actor_user_id: null, at: new Date() }); return { ok: false, reason: "piece-gone" }; }
        item.user_id = me; item.provenance = "transferred"; item.transferred_from = t.from_user_id; item.transfer_id = t.id; item.updated_at = new Date();
      }
      t.state = next; t.decided_at = new Date();
      mem.transferEvents.push({ transfer_id: t.id, item_id: t.item_id, event: next, actor_user_id: me, at: new Date() });
      return { ok: true, transfer: transferOut(t) };
    });
  }

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // THE TRANSFER, LOCKED. A second accept waits here and then finds it decided.
    const tr = await client.query(
      `SELECT * FROM wardrobe_transfers WHERE id = $1 AND ${role === "sender" ? "from_user_id" : "to_user_id"} = $2 FOR UPDATE`, [id, me]);
    const t = tr.rows[0];
    if (!t || t.state !== "pending") { await client.query("ROLLBACK"); return { ok: false, reason: "not-pending" }; }
    if (giftExpired(t.expires_at)) {
      await client.query(`UPDATE wardrobe_transfers SET state='expired', decided_at=now() WHERE id=$1`, [id]);
      await client.query(`INSERT INTO wardrobe_transfer_events (transfer_id, item_id, event) VALUES ($1,$2,'expired')`, [id, t.item_id]);
      await client.query("COMMIT"); return { ok: false, reason: "expired" };
    }
    const next = giftTransition(t.state, act, role);
    if (!next) { await client.query("ROLLBACK"); return { ok: false, reason: "not-pending" }; }
    if (act === "accept") {
      // THE CARD, LOCKED, AND STILL THE SENDER'S AND ACTIVE. If not, the offer
      // dies and ownership is untouched.
      const it = await client.query(`SELECT * FROM wardrobe_items WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE`, [t.item_id, t.from_user_id]);
      if (!it.rows.length) {
        await client.query(`UPDATE wardrobe_transfers SET state='cancelled', decided_at=now() WHERE id=$1`, [id]);
        await client.query(`INSERT INTO wardrobe_transfer_events (transfer_id, item_id, event) VALUES ($1,$2,'cancelled')`, [id, t.item_id]);
        await client.query("COMMIT"); return { ok: false, reason: "piece-gone" };
      }
      await client.query(
        `UPDATE wardrobe_items SET user_id = $2, provenance = 'transferred', transferred_from = $3, transfer_id = $4, updated_at = now() WHERE id = $1`,
        [t.item_id, me, t.from_user_id, id]);
    }
    const upd = await client.query(`UPDATE wardrobe_transfers SET state = $2, decided_at = now() WHERE id = $1 RETURNING *`, [id, next]);
    await client.query(`INSERT INTO wardrobe_transfer_events (transfer_id, item_id, event, actor_user_id) VALUES ($1,$2,$3,$4)`, [id, t.item_id, next, me]);
    await client.query("COMMIT");
    const out = transferOut(upd.rows[0]);
    if (next === "accepted" || next === "declined") {
      await enqueueNotification({ userId: out.fromUserId, kind: "wardrobe-gift", subjectId: `${next}:${out.id}`,
        payload: { transferId: out.id, state: next, title: out.item.title, text: `${out.toHandle || "the passenger"} ${next} ${out.item.title}. ${TRANSFER_DISCLAIMER}` } }).catch(() => {});
    }
    return { ok: true, transfer: out };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export const acceptGift = (me, id) => decide(me, id, "accept");
export const declineGift = (me, id) => decide(me, id, "decline");
export const cancelGift = (me, id) => decide(me, id, "cancel");

/** Stamp every pending offer past its expiry. Returns the count. */
export async function expireGifts({ now = Date.now() } = {}) {
  const p = await getPool();
  if (!(await applied(p))) return 0;
  if (!p) {
    let n = 0;
    for (const t of mem.transfers) if (t.state === "pending" && giftExpired(t.expires_at, now)) { t.state = "expired"; t.decided_at = new Date(now); mem.transferEvents.push({ transfer_id: t.id, item_id: t.item_id, event: "expired", actor_user_id: null, at: new Date(now) }); n++; }
    return n;
  }
  const r = await p.query(
    `WITH gone AS (UPDATE wardrobe_transfers SET state='expired', decided_at=$1::timestamptz
                    WHERE state='pending' AND expires_at <= $1::timestamptz RETURNING id, item_id)
     INSERT INTO wardrobe_transfer_events (transfer_id, item_id, event) SELECT id, item_id, 'expired' FROM gone RETURNING 1`, [new Date(now).toISOString()]);
  return r.rowCount;
}

/** My transfers, by role and state. */
export async function listGifts(userId, { limit = 100 } = {}) {
  const me = String(userId || "");
  const n = Math.max(1, Math.min(500, limit));
  const empty = { incoming: [], outgoing: [], given: [], received: [], disclaimer: TRANSFER_DISCLAIMER };
  if (!me) return empty;
  const p = await getPool();
  if (!(await applied(p))) return { ...empty, unapplied: true };
  await expireGifts().catch(() => 0);
  let rows;
  if (!p) rows = mem.transfers.filter((t) => t.from_user_id === me || t.to_user_id === me).slice(-n).reverse();
  else rows = (await p.query(`SELECT * FROM wardrobe_transfers WHERE from_user_id = $1 OR to_user_id = $1 ORDER BY created_at DESC LIMIT $2`, [me, n])).rows;
  const out = { ...empty };
  for (const r of rows) {
    const t = transferOut(r);
    if (t.state === "pending") (t.toUserId === me ? out.incoming : out.outgoing).push(t);
    else if (t.state === "accepted") (t.toUserId === me ? out.received : out.given).push(t);
  }
  return out;
}

/** Test seam. */
export function resetMemoryTransfers() { mem.transfers.length = 0; mem.transferEvents.length = 0; memSeq = 1; }
