// lib/db/production/tickets.js — SOMEBODY WANTS TO BUY SOMETHING.
//
// A purchase ticket is the record of one reader's attempt to acquire one
// piece, from "requested" through to a terminal state. ASILUM does not take
// the money: the checkout happens on the SOURCE, and the ticket is our honest
// account of how far the attempt got and where it stopped.
//
// TICKET_STATUSES is the whole vocabulary, and it is ordered as the flow
// runs — `awaiting_user_consent` sits before payment on purpose, because a
// ticket must never advance past a person's decision on their behalf.
//
// Split out of production.js unchanged.

import { getPool, normalizeEvent, memRecordEvent, EVENT_INSERT_SQL } from "../index.js";
import { mem, push, boundedLimit } from "./store.js";

// ---- purchase tickets -------------------------------------------------------------

export const TICKET_STATUSES = [
  "requested", "checking_availability", "available", "unavailable",
  "awaiting_user_consent", "awaiting_payment_or_checkout", "checkout_started",
  "checkout_completed_on_source", "canceled", "failed", "completed",
];

const TICKET_TRANSITIONS = Object.freeze({
  consent: {
    from: ["awaiting_user_consent"],
    to: "checkout_started",
  },
  cancel: {
    from: [
      "requested", "checking_availability", "available",
      "awaiting_user_consent", "awaiting_payment_or_checkout",
    ],
    to: "canceled",
  },
});

export async function createTicket(t) {
  if (!t.userId || !t.productId) throw new TypeError("ticket userId and productId required");
  const row = {
    userId: String(t.userId).slice(0, 80),
    productId: String(t.productId).slice(0, 80),
    sourceName: t.sourceName || null,
    sourceProductId: t.sourceProductId || null,
    sourceProductUrl: t.sourceProductUrl || null,
    status: "requested",
    itemPriceAtRequest: t.itemPriceAtRequest ?? null,
    availabilityStatus: t.availabilityStatus || "unknown",
    notes: t.notes || null,
    idempotencyKey: typeof t.idempotencyKey === "string" && /^[A-Za-z0-9-]{8,80}$/.test(t.idempotencyKey)
      ? t.idempotencyKey : null,
  };
  const p = await getPool();
  if (!p) {
    const existing = row.idempotencyKey
      ? mem.tickets.find((ticket) => ticket.userId === row.userId && ticket.idempotencyKey === row.idempotencyKey)
      : null;
    if (existing) return { ...memTicket(existing), duplicate: true };
    return memTicket(push(mem.tickets, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false, duplicate: false }));
  }
  const { rows } = await p.query(
    `INSERT INTO purchase_tickets
       (user_id, product_id, source_name, source_product_id, source_product_url,
        status, item_price_at_request, availability_status, notes,idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id,idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING *, (xmax=0) AS inserted`,
    [row.userId, row.productId, row.sourceName, row.sourceProductId, row.sourceProductUrl,
     row.status, row.itemPriceAtRequest, row.availabilityStatus, row.notes,row.idempotencyKey]
  );
  return { ...ticketRow(rows[0]), idempotencyKey: rows[0].idempotency_key, duplicate: !rows[0].inserted };
}

export async function updateTicket(id, { status, consent = false, disclaimerVersion = null,
  currentPriceChecked = null, availabilityStatus = null, notes = null } = {}) {
  if (status && !TICKET_STATUSES.includes(status)) throw new RangeError("unknown ticket status");
  const p = await getPool();
  if (!p) {
    const t = mem.tickets.find((x) => x.id === Number(id));
    if (!t) return null;
    if (status) t.status = status;
    if (consent) { t.userConsentTimestamp = Date.now(); t.disclaimerVersion = disclaimerVersion; }
    if (currentPriceChecked != null) t.currentPriceChecked = currentPriceChecked;
    if (availabilityStatus) t.availabilityStatus = availabilityStatus;
    if (notes) t.notes = notes;
    return memTicket(t);
  }
  const { rows } = await p.query(
    `UPDATE purchase_tickets SET
       status = COALESCE($2, status),
       user_consent_timestamp = CASE WHEN $3 THEN now() ELSE user_consent_timestamp END,
       disclaimer_version = COALESCE($4, disclaimer_version),
       current_price_checked = COALESCE($5, current_price_checked),
       availability_status = COALESCE($6, availability_status),
       notes = COALESCE($7, notes),
       updated_at = now()
     WHERE id=$1 RETURNING *`,
    [id, status, consent, disclaimerVersion, currentPriceChecked, availabilityStatus, notes]
  );
  return rows[0] ? ticketRow(rows[0]) : null;
}

// The founders-fee link: which paid fee order issued this ticket. Ledger
// plumbing (admin/audit reads it via SQL); the public ticket shape is
// unchanged.
export async function linkTicketFeeOrder(id, feeOrderId) {
  const p = await getPool();
  if (!p) {
    const t = mem.tickets.find((x) => x.id === Number(id));
    if (!t) return false;
    t.feeOrderId = feeOrderId;
    return true;
  }
  const r = await p.query(
    `UPDATE purchase_tickets SET fee_order_id=$2, updated_at=now() WHERE id=$1`,
    [id, feeOrderId]
  );
  return r.rowCount > 0;
}

export async function getTicketByFeeOrder(feeOrderId) {
  if (!feeOrderId) return null;
  const p = await getPool();
  if (!p) {
    const t = mem.tickets.find((x) => x.feeOrderId === feeOrderId);
    return t ? memTicket(t) : null;
  }
  const { rows } = await p.query(`SELECT * FROM purchase_tickets WHERE fee_order_id=$1 LIMIT 1`, [feeOrderId]);
  return rows[0] ? ticketRow(rows[0]) : null;
}

// User-driven state changes use a compare-and-set update so two requests can
// never revive a terminal ticket or overwrite a transition made in parallel.
export async function transitionTicket(id, userId, action, { disclaimerVersion = null, notes = null } = {}) {
  const transition = TICKET_TRANSITIONS[action];
  if (!transition || !userId) throw new RangeError("unknown ticket transition");
  const p = await getPool();
  if (!p) {
    const ticket = mem.tickets.find((candidate) =>
      candidate.id === Number(id) && candidate.userId === userId);
    if (!ticket || !transition.from.includes(ticket.status)) return null;
    ticket.status = transition.to;
    if (action === "consent") {
      ticket.userConsentTimestamp = Date.now();
      ticket.disclaimerVersion = disclaimerVersion;
    }
    if (notes) ticket.notes = notes;
    return memTicket(ticket);
  }
  const consent = action === "consent";
  const { rows } = await p.query(
    `UPDATE purchase_tickets SET
       status=$4,
       user_consent_timestamp=CASE WHEN $5 THEN now() ELSE user_consent_timestamp END,
       disclaimer_version=CASE WHEN $5 THEN $6 ELSE disclaimer_version END,
       notes=COALESCE($7,notes),
       updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status=ANY($3::text[])
     RETURNING *`,
    [id, userId, transition.from, transition.to, consent, disclaimerVersion, notes]
  );
  return rows[0] ? ticketRow(rows[0]) : null;
}

// The mem twin of ticketRow's DERIVED fields (audit resume, Aug 14 —
// law 4: mem and Postgres are one system with two implementations).
// Postgres derives `consented` from user_consent_timestamp inside
// ticketRow; the mem branches returned their raw stored objects, which
// never carry that key. /orders reads `t.consented` — so a ticket the
// user really had consented to said "consent on file" on Postgres and
// silently said nothing on mem, forever. Every mem ticket return goes
// through here now, for the same reason every Postgres one goes through
// ticketRow.
function memTicket(t) {
  return t == null ? t : { ...t, consented: !!t.userConsentTimestamp };
}

function ticketRow(r) {
  return {
    id: r.id, userId: r.user_id, productId: r.product_id, sourceName: r.source_name,
    sourceProductUrl: r.source_product_url, status: r.status,
    itemPriceAtRequest: r.item_price_at_request == null ? null : Number(r.item_price_at_request),
    currentPriceChecked: r.current_price_checked == null ? null : Number(r.current_price_checked),
    availabilityStatus: r.availability_status,
    consented: !!r.user_consent_timestamp,
    userReportedOutcome: r.user_reported_outcome || null,
    outcomeReportedAt: r.outcome_reported_at ? new Date(r.outcome_reported_at).getTime() : null,
    createdAt: new Date(r.created_at).getTime(),
    idempotencyKey: r.idempotency_key || null,
    persistent: true,
  };
}

export async function reportTicketOutcome(id, userId, outcome, event) {
  const allowed = new Set(["bought", "kept", "returned", "not-bought"]);
  if (!allowed.has(outcome) || !userId) throw new RangeError("invalid ticket outcome");
  const n = normalizeEvent(event);
  const p = await getPool();
  if (!p) {
    const ticket = mem.tickets.find((candidate) => candidate.id === Number(id) && candidate.userId === userId);
    if (!ticket || !["checkout_started", "checkout_completed_on_source", "completed"].includes(ticket.status)) return null;
    const duplicate = ticket.userReportedOutcome === outcome;
    ticket.userReportedOutcome = outcome;
    ticket.outcomeReportedAt = Date.now();
    if (!duplicate) memRecordEvent(n);
    return { ticket: memTicket(ticket), duplicate };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const changed = await client.query(
      `UPDATE purchase_tickets
       SET user_reported_outcome=$3, outcome_reported_at=now(), updated_at=now()
       WHERE id=$1 AND user_id=$2
         AND status=ANY($4::text[])
         AND user_reported_outcome IS DISTINCT FROM $3
       RETURNING *`,
      [id, userId, outcome, ["checkout_started", "checkout_completed_on_source", "completed"]]
    );
    if (changed.rows.length) {
      await client.query(EVENT_INSERT_SQL, [n.userId, n.type, n.payloadJson, n.at]);
      await client.query("COMMIT");
      return { ticket: ticketRow(changed.rows[0]), duplicate: false };
    }
    const existing = await client.query(
      `SELECT * FROM purchase_tickets
       WHERE id=$1 AND user_id=$2 AND status=ANY($3::text[])`,
      [id, userId, ["checkout_started", "checkout_completed_on_source", "completed"]]
    );
    await client.query("ROLLBACK");
    return existing.rows[0] ? { ticket: ticketRow(existing.rows[0]), duplicate: true } : null;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function listTickets(userId, limit = 50) {
  limit = boundedLimit(limit, 50, 200);
  const p = await getPool();
  if (!p) return mem.tickets.filter((t) => t.userId === userId).slice(-limit).reverse().map(memTicket);
  const { rows } = await p.query(
    "SELECT * FROM purchase_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map(ticketRow);
}

export async function getTicket(id) {
  const p = await getPool();
  if (!p) return memTicket(mem.tickets.find((t) => t.id === Number(id))) || null;
  const { rows } = await p.query("SELECT * FROM purchase_tickets WHERE id=$1", [id]);
  return rows[0] ? ticketRow(rows[0]) : null;
}
