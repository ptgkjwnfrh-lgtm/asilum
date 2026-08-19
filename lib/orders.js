// lib/orders.js
// The checkout engine (risk campaign §2, phase L2). SERVER-ONLY.
//
// Honesty gates run before any money surface: demo archive records refuse with
// the same 409 the ticket flow uses — the engine can only sell what is real
// (live source URL, not seed-sourced, availability 'available', real price).
// Today ZERO catalog items pass, so production refuses every checkout by
// construction until the designer program (phase L1) lands real inventory.
// That is the design, not a gap.

import { resolveProduct } from "./products.js";
import { SITE_ORIGIN } from "./site.js";
import {
  stripeConfigured, createCheckoutSession, retrieveCheckoutSession, createRefund, StripeApiError,
} from "./payments/stripe.js";
import {
  createOrderWithEvent, attachOrderSession, applyOrderEvent, getOrder,
  getOrderBySession, listOrderEvents,
} from "./db/orders.js";
import { notifyOrderPaid } from "./notify.js";

// Notification never gates settlement: awaited (serverless kills orphan
// promises) but a failure is logged and swallowed — the ledger is authority.
async function tapOperator(orderId) {
  try {
    const fresh = await getOrder(orderId);
    const result = await notifyOrderPaid(fresh);
    if (!result.sent && result.reason !== "unkeyed") {
      console.error(`order notify failed for ${orderId}: ${result.reason}`);
    }
  } catch (err) {
    console.error(`order notify failed for ${orderId}: ${err && err.message}`);
  }
}

export const ORDER_CURRENCY_DEFAULT = "usd"; // single-currency v1; D2/D1 own the future

// The gate lives in lib/purchasable.js (pure, client-safe) so the public
// product payload can stamp `purchasable` without an import cycle; the
// re-export keeps every existing server import working unchanged.
import { refusalReason } from "./purchasable.js";
export { refusalReason };

export async function startCheckout({ user, itemId, origin = SITE_ORIGIN }) {
  if (!stripeConfigured()) {
    return { status: 503, error: "checkout idle — set STRIPE_SECRET_KEY in the environment" };
  }
  const item = await resolveProduct(itemId);
  if (!item) return { status: 404, error: "product not found" };
  const refusal = refusalReason(item);
  if (refusal) return { status: 409, error: refusal };

  const amountCents = Math.round(Number(item.price) * 100);
  const currency = String(item.currency || ORDER_CURRENCY_DEFAULT).toLowerCase();
  const order = await createOrderWithEvent({ user, itemId: item.id, amountCents, currency });
  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      itemId: item.id,
      title: item.title || item.id,
      amountCents,
      currency,
      origin,
      user,
    });
    await attachOrderSession(order.id, session.id);
    return { status: 200, orderId: order.id, url: session.url };
  } catch (err) {
    await applyOrderEvent({
      orderId: order.id, type: "failed", source: "api", newStatus: "failed",
      payload: { reason: err instanceof StripeApiError ? err.message : "session creation failed" },
    });
    return { status: 502, error: "payment provider refused the session" };
  }
}

// Reconcile-on-read: the session state at Stripe is the truth for an order
// stuck in awaiting_payment (webhooks can lag or be unconfigured; the order
// database must never disagree with the processor for longer than one read).
// While a session is still OPEN, its url rides back on the order as
// `_resumeUrl` (underscore = never persisted) so the reader can finish
// paying instead of littering a second order.
export async function reconcileOrder(order) {
  if (!order || order.status !== "awaiting_payment" || !order.stripe_session_id) return order;
  if (!stripeConfigured()) return order;
  let session;
  try {
    session = await retrieveCheckoutSession(order.stripe_session_id);
  } catch {
    return order; // provider unreachable — report what we know, change nothing
  }
  if (session.status === "open" && session.payment_status !== "paid" && session.url) {
    return { ...order, _resumeUrl: session.url };
  }
  if (session.payment_status === "paid") {
    await applyOrderEvent({
      orderId: order.id, type: "paid", source: "reconcile", newStatus: "paid",
      payload: { session: session.id },
    });
    await tapOperator(order.id); // order was awaiting_payment — this IS the transition
  } else if (session.status === "expired") {
    await applyOrderEvent({
      orderId: order.id, type: "expired", source: "reconcile", newStatus: "expired",
      payload: { session: session.id },
    });
  }
  return getOrder(order.id);
}

// Full refund of a PAID order — the mechanism only; when to refund is the
// published policy's and the operator's call (docs/legal-drafts). The ledger
// event carries the actor and Stripe's refund id; `paid` may only ever move
// to `refunded` (the status guard's one exception).
export async function refundOrder(orderId, { actor = "operator" } = {}) {
  if (!stripeConfigured()) {
    return { status: 503, error: "refunds idle — set STRIPE_SECRET_KEY in the environment" };
  }
  const order = await getOrder(orderId);
  if (!order) return { status: 404, error: "order not found" };
  if (order.status !== "paid") {
    return { status: 409, error: `only a paid order refunds — this one is "${order.status}"` };
  }
  let session;
  try {
    session = await retrieveCheckoutSession(order.stripe_session_id);
  } catch (err) {
    return { status: 502, error: `payment provider unreachable (${err.message})` };
  }
  const paymentIntent = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent && session.payment_intent.id;
  if (!paymentIntent) return { status: 502, error: "session carries no payment intent" };
  let refund;
  try {
    refund = await createRefund(paymentIntent);
  } catch (err) {
    return { status: 502, error: err instanceof StripeApiError ? err.message : "refund refused" };
  }
  await applyOrderEvent({
    orderId, type: "refunded", source: "api", newStatus: "refunded",
    payload: { refund: refund.id, actor },
  });
  return { status: 200, order: await getOrder(orderId), refund: refund.id };
}

// Webhook events land here after signature verification. Unknown types are
// acknowledged untouched; duplicates (by Stripe event id) change nothing.
export async function applyStripeWebhook(event) {
  const type = event && event.type;
  const session = event && event.data && event.data.object;
  if (type !== "checkout.session.completed" && type !== "checkout.session.expired") {
    return { handled: false };
  }
  const order =
    (await getOrderBySession(session && session.id)) ||
    (session && session.metadata && session.metadata.order_id
      ? await getOrder(session.metadata.order_id)
      : null);
  if (!order) return { handled: false, orphan: true };
  const paid = type === "checkout.session.completed";
  const result = await applyOrderEvent({
    orderId: order.id,
    type: paid ? "paid" : "expired",
    source: "webhook",
    stripeEventId: event.id,
    newStatus: paid ? "paid" : "expired",
    payload: { session: session.id },
  });
  const duplicate = Boolean(result && result.duplicate);
  // Notify only on the actual transition: pre-state not yet paid, event not a
  // redelivery. (A webhook landing after reconcile already settled the order
  // records its event but changes nothing and says nothing.)
  if (paid && !duplicate && order.status !== "paid") await tapOperator(order.id);
  return { handled: true, duplicate };
}

export { getOrder, listOrderEvents };
