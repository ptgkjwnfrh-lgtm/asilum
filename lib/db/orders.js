// lib/db/orders.js
// Order persistence: `order_events` is the append-only truth, `orders` the
// projection (schema-v31). SERVER-ONLY. Both stores enforce the same laws:
// event + projection move in one transaction, a Stripe event id inserts at
// most once (redelivered webhooks are no-ops), and `paid` never downgrades —
// a late `expired` for a paid order is recorded but changes nothing.

import crypto from "node:crypto";
import { getPool } from "./index.js";

const mem = {
  orders: new Map(),           // id -> order row
  events: [],                  // append-only
  stripeEventIds: new Set(),
};

const PROTECTED = new Set(["paid", "refunded"]);

function statusAfter(current, next) {
  if (!next || next === current) return current;
  if (PROTECTED.has(current) && next !== "refunded") return current;
  return next;
}

export function newOrderId() {
  return `ord_${crypto.randomUUID()}`;
}

export async function createOrderWithEvent({ user, itemId, amountCents, feeCents = 0, currency, kind = "sale", hotlistAttribution = null }) {
  const order = {
    id: newOrderId(),
    user_id: user,
    item_id: itemId,
    status: "created",
    kind,
    amount_cents: amountCents,
    fee_cents: feeCents,
    hotlist_attribution: hotlistAttribution,
    currency,
    stripe_session_id: null,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const p = await getPool();
  if (!p) {
    mem.orders.set(order.id, order);
    mem.events.push({ order_id: order.id, type: "created", source: "api", stripe_event_id: null, payload: null });
    return order;
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO orders (id, user_id, item_id, status, amount_cents, fee_cents, currency, kind, hotlist_attribution)
       VALUES ($1,$2,$3,'created',$4,$5,$6,$7,$8)`,
      [order.id, user, itemId, amountCents, feeCents, currency, kind, hotlistAttribution]
    );
    await client.query(
      `INSERT INTO order_events (order_id, type, source) VALUES ($1,'created','api')`,
      [order.id]
    );
    await client.query("COMMIT");
    return order;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function attachOrderSession(orderId, sessionId) {
  const p = await getPool();
  if (!p) {
    const order = mem.orders.get(orderId);
    if (!order) return null;
    order.stripe_session_id = sessionId;
    order.status = statusAfter(order.status, "awaiting_payment");
    order.updated_at = new Date().toISOString();
    mem.events.push({ order_id: orderId, type: "checkout_opened", source: "api", stripe_event_id: null, payload: { session: sessionId } });
    return order;
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE orders SET stripe_session_id=$2, status='awaiting_payment', updated_at=now()
       WHERE id=$1 AND status='created' RETURNING *`,
      [orderId, sessionId]
    );
    await client.query(
      `INSERT INTO order_events (order_id, type, source, payload) VALUES ($1,'checkout_opened','api',$2)`,
      [orderId, JSON.stringify({ session: sessionId })]
    );
    await client.query("COMMIT");
    return r.rows[0] || null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// The ticket-fee lane's twin of attachOrderSession: bind the PaymentIntent,
// open the awaiting window, one ledger event.
export async function attachOrderPaymentIntent(orderId, paymentIntentId) {
  const p = await getPool();
  if (!p) {
    const order = mem.orders.get(orderId);
    if (!order) return null;
    order.stripe_payment_intent_id = paymentIntentId;
    order.status = statusAfter(order.status, "awaiting_payment");
    order.updated_at = new Date().toISOString();
    mem.events.push({ order_id: orderId, type: "checkout_opened", source: "api", stripe_event_id: null, payload: { payment_intent: paymentIntentId } });
    return order;
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE orders SET stripe_payment_intent_id=$2, status='awaiting_payment', updated_at=now()
       WHERE id=$1 AND status='created' RETURNING *`,
      [orderId, paymentIntentId]
    );
    await client.query(
      `INSERT INTO order_events (order_id, type, source, payload) VALUES ($1,'checkout_opened','api',$2)`,
      [orderId, JSON.stringify({ payment_intent: paymentIntentId })]
    );
    await client.query("COMMIT");
    return r.rows[0] || null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrderByPaymentIntent(paymentIntentId) {
  if (!paymentIntentId) return null;
  const p = await getPool();
  if (!p) {
    for (const order of mem.orders.values()) {
      if (order.stripe_payment_intent_id === paymentIntentId) return order;
    }
    return null;
  }
  const r = await p.query(`SELECT * FROM orders WHERE stripe_payment_intent_id=$1`, [paymentIntentId]);
  return r.rows[0] || null;
}

// The one writer every payment outcome goes through. Returns
// { duplicate: true } when stripeEventId was already applied.
export async function applyOrderEvent({ orderId, type, source, stripeEventId = null, payload = null, newStatus = null }) {
  const p = await getPool();
  if (!p) {
    if (stripeEventId) {
      if (mem.stripeEventIds.has(stripeEventId)) return { duplicate: true };
      mem.stripeEventIds.add(stripeEventId);
    }
    const order = mem.orders.get(orderId);
    if (!order) return null;
    mem.events.push({ order_id: orderId, type, source, stripe_event_id: stripeEventId, payload });
    order.status = statusAfter(order.status, newStatus);
    order.updated_at = new Date().toISOString();
    return { duplicate: false, order };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO order_events (order_id, type, source, stripe_event_id, payload)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING id`,
      [orderId, type, source, stripeEventId, payload ? JSON.stringify(payload) : null]
    );
    if (stripeEventId && !inserted.rows.length) {
      await client.query("ROLLBACK");
      return { duplicate: true };
    }
    let order = null;
    if (newStatus) {
      const r = await client.query(
        `UPDATE orders SET
           status = CASE
             WHEN status IN ('paid','refunded') AND $2 <> 'refunded' THEN status
             ELSE $2
           END,
           updated_at = now()
         WHERE id=$1 RETURNING *`,
        [orderId, newStatus]
      );
      order = r.rows[0] || null;
    }
    await client.query("COMMIT");
    return { duplicate: false, order };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrder(orderId) {
  const p = await getPool();
  if (!p) return mem.orders.get(orderId) || null;
  const r = await p.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
  return r.rows[0] || null;
}

export async function getOrderBySession(sessionId) {
  if (!sessionId) return null;
  const p = await getPool();
  if (!p) {
    for (const order of mem.orders.values()) {
      if (order.stripe_session_id === sessionId) return order;
    }
    return null;
  }
  const r = await p.query(`SELECT * FROM orders WHERE stripe_session_id=$1`, [sessionId]);
  return r.rows[0] || null;
}

export async function listOrdersForUser(userId, limit = 20) {
  if (!userId) return [];
  const cap = Math.max(1, Math.min(50, Math.trunc(Number(limit)) || 20));
  const p = await getPool();
  if (!p) {
    return [...mem.orders.values()]
      .filter((o) => o.user_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, cap)
      .map((o) => ({ ...o }));
  }
  const r = await p.query(
    `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [userId, cap]
  );
  return r.rows;
}

// Operator view: every order, newest first (the admin desk's ledger read).
export async function listRecentOrders(limit = 50) {
  const cap = Math.max(1, Math.min(200, Math.trunc(Number(limit)) || 50));
  const p = await getPool();
  if (!p) {
    return [...mem.orders.values()]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, cap)
      .map((o) => ({ ...o }));
  }
  const r = await p.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`, [cap]);
  return r.rows;
}

export async function listOrderEvents(orderId, limit = 50) {
  const p = await getPool();
  if (!p) return mem.events.filter((e) => e.order_id === orderId).slice(0, limit);
  const r = await p.query(
    `SELECT order_id, type, source, stripe_event_id, payload, created_at
     FROM order_events WHERE order_id=$1 ORDER BY id ASC LIMIT $2`,
    [orderId, limit]
  );
  return r.rows;
}
