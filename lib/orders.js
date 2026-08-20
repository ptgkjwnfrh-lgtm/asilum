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
  createPaymentIntent, retrievePaymentIntent, confirmPaymentIntent, createCustomer, retrievePaymentMethod,
} from "./payments/stripe.js";
import {
  createOrderWithEvent, attachOrderSession, attachOrderPaymentIntent, applyOrderEvent, getOrder,
  getOrderBySession, getOrderByPaymentIntent, listOrderEvents,
} from "./db/orders.js";
import { createTicket, updateTicket, linkTicketFeeOrder, getTicketByFeeOrder } from "./db/production.js";
import { getBuyerProfile, attachSavedCard } from "./vault.js";
import { safeExternalUrl } from "./url.js";
import { DISCLAIMER_VERSION } from "./tickets.js";
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

// The founders fee: 1% of the item price, buyer-paid, on every sale — ruled
// 20 Aug 2026 (docs/hotlist-program-spec-2026-08-20.md). The ledger keeps
// amount_cents = the item-price snapshot (the payout basis); the buyer's
// total is amount_cents + fee_cents. Owner follow-up ruling, same day:
// pieces at $31 or under pay exactly 31¢ — the fee never dips below the
// processor's fixed cost. Above $31 the plain 1% already clears the floor.
export const FOUNDERS_FEE_RATE = 0.01;
export const FOUNDERS_FEE_FLOOR_CENTS = 31;
export function foundersFeeCents(amountCents) {
  return Math.max(Math.round(amountCents * FOUNDERS_FEE_RATE), FOUNDERS_FEE_FLOOR_CENTS);
}

// Processor physics, learned against the real API: Stripe refuses a
// standalone charge under 50¢ USD (amount_too_small). The 31¢ floor stands
// wherever the fee rides a larger charge (the direct sale lane); a
// FEE-ONLY charge — the §6 two-transaction lane — must clear Stripe's own
// minimum. Flagged to the owner in hotlist-program-spec §6.
export const STRIPE_MINIMUM_CHARGE_CENTS = 50;
export function ticketFeeCents(amountCents) {
  return Math.max(foundersFeeCents(amountCents), STRIPE_MINIMUM_CHARGE_CENTS);
}

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
  const feeCents = foundersFeeCents(amountCents);
  const currency = String(item.currency || ORDER_CURRENCY_DEFAULT).toLowerCase();
  const order = await createOrderWithEvent({ user, itemId: item.id, amountCents, feeCents, currency });
  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      itemId: item.id,
      title: item.title || item.id,
      amountCents,
      feeCents,
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
  if (!order || order.status !== "awaiting_payment") return order;
  if (!stripeConfigured()) return order;
  if (order.kind === "ticket_fee" && order.stripe_payment_intent_id) return reconcileTicketFee(order);
  if (!order.stripe_session_id) return order;
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
  // Ticket-fee orders hold their intent directly; sale orders reach it
  // through the checkout session.
  let paymentIntent = order.stripe_payment_intent_id || null;
  if (!paymentIntent) {
    let session;
    try {
      session = await retrieveCheckoutSession(order.stripe_session_id);
    } catch (err) {
      return { status: 502, error: `payment provider unreachable (${err.message})` };
    }
    paymentIntent = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent && session.payment_intent.id;
  }
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

// ---- The ticket-fee lane (§6, ruled 20 Aug 2026) ---------------------------
// ASILUM charges the founders fee ALONE; the real purchase — payment, tax,
// shipping — completes on the source (eBay / the designer's own store). The
// fee buys the purchase ticket. Same honesty gate as any sale: demo records
// refuse with 409, and a piece with no live source listing cannot be
// ticketed at all.

export async function startTicketFee({ user, itemId, consent = false }) {
  if (!stripeConfigured()) {
    return { status: 503, error: "checkout idle — set STRIPE_SECRET_KEY in the environment" };
  }
  if (!consent) {
    return { status: 400, error: "the third-party purchase disclaimer must be accepted first" };
  }
  const item = await resolveProduct(itemId);
  if (!item) return { status: 404, error: "product not found" };
  const refusal = refusalReason(item);
  if (refusal) return { status: 409, error: refusal };
  const sourceUrl = safeExternalUrl(item.source_product_url || item.url);
  if (!sourceUrl) return { status: 409, error: "no live source listing to ticket" };

  const amountCents = Math.round(Number(item.price) * 100);
  const feeCents = ticketFeeCents(amountCents);
  const currency = String(item.currency || ORDER_CURRENCY_DEFAULT).toLowerCase();

  // First purchase creates the Stripe customer up front so the card the
  // buyer enters is saved for next time (setup_future_usage needs the
  // customer on the intent). Failure to save must never block the fee.
  const profile = await getBuyerProfile(user);
  let customerId = profile && profile.stripe_customer_id ? profile.stripe_customer_id : null;
  if (!customerId) {
    try {
      const customer = await createCustomer({ userId: user });
      customerId = customer.id;
      await attachSavedCard(user, { customerId });
    } catch { customerId = null; }
  }

  const order = await createOrderWithEvent({
    user, itemId: item.id, amountCents, feeCents, currency, kind: "ticket_fee",
  });
  // The acceptance is evidence: it lives in the append-only ledger.
  await applyOrderEvent({
    orderId: order.id, type: "disclaimer_accepted", source: "api",
    payload: { version: DISCLAIMER_VERSION },
  });
  try {
    const intent = await createPaymentIntent({
      amountCents: feeCents,
      currency,
      customer: customerId,
      savePaymentMethod: true,
      metadata: { order_id: order.id, item_id: item.id, kind: "ticket_fee", asilum_fee_cents: String(feeCents) },
    });
    await attachOrderPaymentIntent(order.id, intent.id);
    const savedCard = profile && profile.default_payment_method
      ? { brand: profile.card_brand || "card", last4: profile.card_last4 || "" }
      : null;
    return {
      status: 200,
      orderId: order.id,
      clientSecret: intent.client_secret,
      feeCents,
      amountCents,
      currency,
      savedCard,
      sourceUrl,
    };
  } catch (err) {
    await applyOrderEvent({
      orderId: order.id, type: "failed", source: "api", newStatus: "failed",
      payload: { reason: err instanceof StripeApiError ? err.message : "fee intent creation failed" },
    });
    return { status: 502, error: "payment provider refused the fee intent" };
  }
}

// The returning buyer's one-click path: confirm the fee with the vault's
// saved card, server-side. Nothing is retyped; no card form renders.
export async function confirmTicketFeeWithSavedCard({ user, orderId }) {
  if (!stripeConfigured()) {
    return { status: 503, error: "checkout idle — set STRIPE_SECRET_KEY in the environment" };
  }
  const order = await getOrder(orderId);
  if (!order || order.user_id !== user) return { status: 404, error: "order not found" };
  if (order.kind !== "ticket_fee") return { status: 409, error: "not a ticket-fee order" };
  if (order.status === "paid") return { status: 200, order };
  if (order.status !== "awaiting_payment" || !order.stripe_payment_intent_id) {
    return { status: 409, error: `order is "${order.status}" — open a fresh one` };
  }
  const profile = await getBuyerProfile(user);
  if (!profile || !profile.default_payment_method) {
    return { status: 409, error: "no saved card on file — enter card details once" };
  }
  let intent;
  try {
    intent = await confirmPaymentIntent(order.stripe_payment_intent_id, {
      paymentMethod: profile.default_payment_method,
    });
  } catch (err) {
    return { status: 502, error: err instanceof StripeApiError ? err.message : "the saved card was refused" };
  }
  if (intent.status !== "succeeded") {
    return { status: 402, error: `payment is "${intent.status}" — the saved card did not complete` };
  }
  const settled = await settleTicketFee(order, intent, "api");
  if (!settled.settled) {
    return { status: 409, error: "the processor's numbers do not match the ledger — nothing settled; the desk holds the record" };
  }
  return { status: 200, order: await getOrder(order.id) };
}

// The tamper gate for money that is ASILUM's (owner: "heavy protection").
// The processor's word must match the ledger EXACTLY — amount, currency,
// and the order the intent claims to pay. Any mismatch is recorded loudly
// in the append-only ledger, nothing settles, and no ticket exists.
function ticketFeeMismatch(order, intent) {
  const paid = Number(intent.amount_received ?? intent.amount);
  if (paid !== Number(order.fee_cents)) return `amount ${paid} != fee ${order.fee_cents}`;
  if (String(intent.currency || "").toLowerCase() !== String(order.currency || "").toLowerCase()) {
    return `currency ${intent.currency} != ${order.currency}`;
  }
  const claimed = intent.metadata && intent.metadata.order_id;
  if (claimed && claimed !== order.id) return `intent claims order ${claimed}`;
  return null;
}

async function settleTicketFee(order, intent, source, stripeEventId = null) {
  const mismatch = ticketFeeMismatch(order, intent);
  if (mismatch) {
    await applyOrderEvent({
      orderId: order.id, type: "amount_mismatch", source, stripeEventId,
      payload: { detail: mismatch, payment_intent: intent.id || null },
    });
    console.error(`ticket-fee tamper gate held: order ${order.id}: ${mismatch}`);
    return { settled: false, mismatch };
  }
  // Pre-state BEFORE the write: in memory mode the store hands back live
  // references, so reading order.status after applyOrderEvent would see the
  // mutation and mistake a first settle for a redelivery.
  const wasPaid = order.status === "paid";
  const result = await applyOrderEvent({
    orderId: order.id, type: "paid", source, stripeEventId, newStatus: "paid",
    payload: { payment_intent: intent.id || null },
  });
  if (result && result.duplicate) return { settled: true, duplicate: true };
  await issueTicketForPaidFee(order);
  if (!wasPaid) {
    await saveCardFromIntent(order.user_id, intent);
    await tapOperator(order.id);
  }
  return { settled: true, duplicate: wasPaid };
}

// The paid fee's deliverable. Idempotent by order id — reconcile and webhook
// can both arrive; one ticket exists.
async function issueTicketForPaidFee(order) {
  const item = await resolveProduct(order.item_id);
  const sourceUrl = item ? safeExternalUrl(item.source_product_url || item.url) : null;
  const ticket = await createTicket({
    userId: order.user_id,
    productId: order.item_id,
    sourceName: (item && item.source_name) || null,
    sourceProductId: (item && item.source_product_id) || null,
    sourceProductUrl: sourceUrl,
    itemPriceAtRequest: order.amount_cents / 100,
    availabilityStatus: (item && item.availability_status) || "unknown",
    notes: "founders-fee purchase ticket",
    idempotencyKey: `fee-${String(order.id).replace(/_/g, "-")}`,
  });
  if (!ticket.duplicate) {
    await updateTicket(ticket.id, { status: "checkout_started", consent: true, disclaimerVersion: DISCLAIMER_VERSION });
    await linkTicketFeeOrder(ticket.id, order.id);
  }
  return ticket;
}

// First-purchase card save — the one vault write outside SETTINGS, and the
// "first time purchasing" path the owner named. References + display
// metadata only; a failure here never blocks the settled fee.
async function saveCardFromIntent(userId, intent) {
  try {
    const pm = typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method && intent.payment_method.id;
    if (!pm) return;
    const customer = typeof intent.customer === "string"
      ? intent.customer
      : intent.customer && intent.customer.id;
    let brand = null, last4 = null;
    try {
      const method = await retrievePaymentMethod(pm);
      brand = (method && method.card && method.card.brand) || null;
      last4 = (method && method.card && method.card.last4) || null;
    } catch { /* display metadata is decoration */ }
    await attachSavedCard(userId, { customerId: customer || null, paymentMethod: pm, brand, last4 });
  } catch (err) {
    console.error(`vault card save skipped for ${userId}: ${err && err.message}`);
  }
}

async function reconcileTicketFee(order) {
  let intent;
  try {
    intent = await retrievePaymentIntent(order.stripe_payment_intent_id);
  } catch {
    return order; // provider unreachable — report what we know, change nothing
  }
  if (intent.status === "succeeded") {
    await settleTicketFee(order, intent, "reconcile");
  } else if (intent.status === "canceled") {
    await applyOrderEvent({
      orderId: order.id, type: "expired", source: "reconcile", newStatus: "expired",
      payload: { payment_intent: intent.id },
    });
  }
  return getOrder(order.id);
}

export { getTicketByFeeOrder };

// Webhook events land here after signature verification. Unknown types are
// acknowledged untouched; duplicates (by Stripe event id) change nothing.
export async function applyStripeWebhook(event) {
  const type = event && event.type;
  const session = event && event.data && event.data.object;
  // The ticket-fee lane settles by PaymentIntent (with the tamper gate);
  // sale orders settle by checkout session below, unchanged.
  if (type === "payment_intent.succeeded" || type === "payment_intent.payment_failed") {
    const intent = session;
    const order =
      (intent && (await getOrderByPaymentIntent(intent.id))) ||
      (intent && intent.metadata && intent.metadata.order_id
        ? await getOrder(intent.metadata.order_id)
        : null);
    if (!order) return { handled: false, orphan: true };
    if (order.kind !== "ticket_fee") return { handled: false };
    if (type === "payment_intent.payment_failed") {
      const r = await applyOrderEvent({
        orderId: order.id, type: "failed", source: "webhook", stripeEventId: event.id,
        newStatus: "failed", payload: { payment_intent: intent.id },
      });
      return { handled: true, duplicate: Boolean(r && r.duplicate) };
    }
    const settled = await settleTicketFee(order, intent, "webhook", event.id);
    if (!settled.settled) return { handled: true, mismatch: settled.mismatch };
    return { handled: true, duplicate: Boolean(settled.duplicate) };
  }
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
