// tests/orders-engine.test.js — the order ledger's laws, in memory mode:
// event + projection move together, webhook redelivery is a no-op, `paid`
// never downgrades, and the honesty gate refuses everything the catalog
// currently contains (all seed-sourced). Unkeyed, no network.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.STRIPE_SECRET_KEY;
delete process.env.DATABASE_URL;

const {
  refusalReason, startCheckout, startTicketFee, applyStripeWebhook, refundOrder,
  foundersFeeCents, FOUNDERS_FEE_RATE, FOUNDERS_FEE_FLOOR_CENTS, getTicketByFeeOrder,
} = await import("../lib/orders.js");
const {
  createOrderWithEvent, attachOrderSession, attachOrderPaymentIntent, applyOrderEvent, getOrder,
  listOrderEvents, listOrdersForUser,
} = await import("../lib/db/orders.js");
const { publicProduct } = await import("../lib/products.js");

const REAL_ITEM = {
  id: "test-real-item",
  title: "test article",
  price: 42,
  currency: "usd",
  source_name: "designer-direct",
  source_product_url: "https://designer.example/piece/1",
  availability_status: "available",
};

test("refusalReason: seed-sourced and url-less items are demo records", () => {
  assert.match(refusalReason({ id: "syn-1", source_name: "seed", url: "https://x.example/p" }), /demo archive/);
  assert.match(refusalReason({ id: "syn-2", source_name: "designer", source_product_url: null }), /demo archive/);
});

test("refusalReason: availability and price gate a real-sourced item", () => {
  assert.match(refusalReason({ ...REAL_ITEM, availability_status: "sold" }), /availability is "sold"/);
  assert.match(refusalReason({ ...REAL_ITEM, availability_status: "unknown" }), /availability/);
  assert.match(refusalReason({ ...REAL_ITEM, price: 0 }), /no real price/);
  assert.match(refusalReason({ ...REAL_ITEM, price: NaN }), /no real price/);
});

test("refusalReason: a live-sourced, available, priced item passes", () => {
  assert.equal(refusalReason(REAL_ITEM), null);
});

test("startCheckout without a key answers 503 before touching anything", async () => {
  const result = await startCheckout({ user: "u-t", itemId: "whatever" });
  assert.equal(result.status, 503);
  assert.match(result.error, /STRIPE_SECRET_KEY/);
});

test("ledger: create → attach session → paid, one event per step", async () => {
  const order = await createOrderWithEvent({ user: "u-a", itemId: "test-real-item", amountCents: 4200, currency: "usd" });
  assert.equal(order.status, "created");
  const attached = await attachOrderSession(order.id, "cs_test_ledger_1");
  assert.equal(attached.status, "awaiting_payment");
  await applyOrderEvent({ orderId: order.id, type: "paid", source: "webhook", stripeEventId: "evt_ledger_1", newStatus: "paid" });
  const settled = await getOrder(order.id);
  assert.equal(settled.status, "paid");
  const events = await listOrderEvents(order.id);
  assert.deepEqual(events.map((e) => e.type), ["created", "checkout_opened", "paid"]);
});

test("a redelivered stripe event id inserts nothing the second time", async () => {
  const order = await createOrderWithEvent({ user: "u-b", itemId: "test-real-item", amountCents: 4200, currency: "usd" });
  await attachOrderSession(order.id, "cs_test_ledger_2");
  const first = await applyOrderEvent({ orderId: order.id, type: "paid", source: "webhook", stripeEventId: "evt_dup", newStatus: "paid" });
  const second = await applyOrderEvent({ orderId: order.id, type: "paid", source: "webhook", stripeEventId: "evt_dup", newStatus: "paid" });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  const events = await listOrderEvents(order.id);
  assert.equal(events.filter((e) => e.type === "paid").length, 1);
});

test("paid never downgrades: a late expiry is recorded, status unmoved", async () => {
  const order = await createOrderWithEvent({ user: "u-c", itemId: "test-real-item", amountCents: 4200, currency: "usd" });
  await attachOrderSession(order.id, "cs_test_ledger_3");
  await applyOrderEvent({ orderId: order.id, type: "paid", source: "webhook", stripeEventId: "evt_paid_3", newStatus: "paid" });
  await applyOrderEvent({ orderId: order.id, type: "expired", source: "reconcile", newStatus: "expired" });
  assert.equal((await getOrder(order.id)).status, "paid");
});

test("refundOrder guards: unkeyed 503; unknown 404; only PAID refunds", async () => {
  assert.equal((await refundOrder("ord_whatever")).status, 503, "unkeyed engine refuses first");
  process.env.STRIPE_SECRET_KEY = "sk_test_guardcheck";
  try {
    assert.equal((await refundOrder("ord_nope")).status, 404);
    const order = await createOrderWithEvent({ user: "u-r", itemId: "test-real-item", amountCents: 100, currency: "usd" });
    const refusal = await refundOrder(order.id);
    assert.equal(refusal.status, 409);
    assert.match(refusal.error, /only a paid order refunds/);
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
  }
});

test("publicProduct stamps the gate's verdict — demo false, real true — and no client re-derives it", () => {
  const demo = publicProduct({ id: "syn-1", title: "demo", price: 10, source_name: "seed", url: "https://x.example/p" });
  assert.equal(demo.purchasable, false);
  const real = publicProduct({ ...REAL_ITEM });
  assert.equal(real.purchasable, true);
  const sold = publicProduct({ ...REAL_ITEM, availability_status: "sold" });
  assert.equal(sold.purchasable, false);
});

test("listOrdersForUser: newest first, own orders only, capped", async () => {
  const a = await createOrderWithEvent({ user: "u-list", itemId: "test-real-item", amountCents: 100, currency: "usd" });
  const b = await createOrderWithEvent({ user: "u-list", itemId: "test-real-item", amountCents: 200, currency: "usd" });
  await createOrderWithEvent({ user: "u-other", itemId: "test-real-item", amountCents: 300, currency: "usd" });
  const mine = await listOrdersForUser("u-list");
  assert.equal(mine.length, 2);
  assert.ok(mine.every((o) => o.user_id === "u-list"));
  assert.deepEqual(mine.map((o) => o.id), [b.id, a.id], "newest first");
  assert.deepEqual(await listOrdersForUser(""), []);
});

test("founders fee: 1% with the 31¢ floor (rulings, 20 Aug 2026)", () => {
  assert.equal(FOUNDERS_FEE_RATE, 0.01);
  assert.equal(FOUNDERS_FEE_FLOOR_CENTS, 31);
  assert.equal(foundersFeeCents(10000), 100); // the ruling's own example: $100 → $1
  assert.equal(foundersFeeCents(8050), 81);   // half-cent rounds up
  assert.equal(foundersFeeCents(3100), 31);   // $31 exactly — both rules agree
  assert.equal(foundersFeeCents(3000), 31);   // $30 → the floor, never 30¢
  assert.equal(foundersFeeCents(49), 31);     // a sub-dollar piece still pays 31¢
  assert.equal(foundersFeeCents(5000), 50);   // above $31 the plain 1% rules
});

test("ticket fee (standalone charge): Stripe's 50¢ minimum overlays the floor", async () => {
  const { ticketFeeCents, STRIPE_MINIMUM_CHARGE_CENTS } = await import("../lib/orders.js");
  assert.equal(STRIPE_MINIMUM_CHARGE_CENTS, 50); // amount_too_small below this, learned live
  assert.equal(ticketFeeCents(3000), 50);   // $30 piece: 31¢ ruled, 50¢ chargeable
  assert.equal(ticketFeeCents(4999), 50);   // 1% still under the processor minimum
  assert.equal(ticketFeeCents(5000), 50);   // $50 — the seam, both agree
  assert.equal(ticketFeeCents(5100), 51);   // above it the plain 1% rules
  assert.equal(ticketFeeCents(10000), 100); // the ruling's example unchanged
});

test("startTicketFee: unkeyed 503; keyed but unconsented 400", async () => {
  assert.equal((await startTicketFee({ user: "u-t", itemId: "x", consent: true })).status, 503);
  process.env.STRIPE_SECRET_KEY = "sk_test_ticketguard";
  try {
    const result = await startTicketFee({ user: "u-t", itemId: "x", consent: false });
    assert.equal(result.status, 400);
    assert.match(result.error, /disclaimer/);
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
  }
});

test("ticket-fee: the tamper gate holds, the exact amount settles, ONE ticket issues", async () => {
  const order = await createOrderWithEvent({
    user: "u-fee2", itemId: "test-real-item", amountCents: 4200, feeCents: 42, currency: "usd", kind: "ticket_fee",
  });
  assert.equal(order.kind, "ticket_fee");
  await attachOrderPaymentIntent(order.id, "pi_tamper_1");

  // Wrong amount: recorded loudly, nothing settles, no ticket exists.
  const bad = await applyStripeWebhook({
    id: "evt_fee_bad", type: "payment_intent.succeeded",
    data: { object: { id: "pi_tamper_1", amount: 1, amount_received: 1, currency: "usd", metadata: { order_id: order.id } } },
  });
  assert.equal(bad.handled, true);
  assert.match(String(bad.mismatch), /amount 1 != fee 42/);
  assert.equal((await getOrder(order.id)).status, "awaiting_payment");
  assert.ok((await listOrderEvents(order.id)).some((e) => e.type === "amount_mismatch"));
  assert.equal(await getTicketByFeeOrder(order.id), null);

  // The exact amount: settles paid, issues the ticket with consent stamped.
  const good = await applyStripeWebhook({
    id: "evt_fee_good", type: "payment_intent.succeeded",
    data: { object: { id: "pi_tamper_1", amount: 42, amount_received: 42, currency: "usd", metadata: { order_id: order.id } } },
  });
  assert.equal(good.handled, true);
  assert.equal(good.duplicate, false);
  assert.equal((await getOrder(order.id)).status, "paid");
  const ticket = await getTicketByFeeOrder(order.id);
  assert.ok(ticket, "the paid fee issued its ticket");
  assert.equal(ticket.status, "checkout_started");

  // Redelivery: acknowledged, nothing new — still exactly one ticket.
  const again = await applyStripeWebhook({
    id: "evt_fee_good", type: "payment_intent.succeeded",
    data: { object: { id: "pi_tamper_1", amount: 42, amount_received: 42, currency: "usd", metadata: { order_id: order.id } } },
  });
  assert.equal(again.duplicate, true);
});

test("ledger carries the fee: fee_cents snapshots at creation, defaults 0", async () => {
  const withFee = await createOrderWithEvent({
    user: "u-fee", itemId: "test-real-item", amountCents: 10000, feeCents: 100, currency: "usd",
  });
  assert.equal(withFee.fee_cents, 100);
  assert.equal(withFee.amount_cents, 10000, "amount_cents stays the item-price snapshot");
  const without = await createOrderWithEvent({
    user: "u-fee", itemId: "test-real-item", amountCents: 100, currency: "usd",
  });
  assert.equal(without.fee_cents, 0, "fee-less callers stay truthful at 0");
});

test("webhook: completed settles by session id, unknown types are untouched, orphans are named", async () => {
  const order = await createOrderWithEvent({ user: "u-d", itemId: "test-real-item", amountCents: 4200, currency: "usd" });
  await attachOrderSession(order.id, "cs_test_hook_1");
  const settled = await applyStripeWebhook({
    id: "evt_hook_1", type: "checkout.session.completed",
    data: { object: { id: "cs_test_hook_1" } },
  });
  assert.deepEqual(settled, { handled: true, duplicate: false });
  assert.equal((await getOrder(order.id)).status, "paid");

  assert.deepEqual(await applyStripeWebhook({ id: "evt_x", type: "charge.updated", data: { object: {} } }), { handled: false });

  const orphan = await applyStripeWebhook({
    id: "evt_hook_2", type: "checkout.session.completed",
    data: { object: { id: "cs_never_seen" } },
  });
  assert.equal(orphan.handled, false);
  assert.equal(orphan.orphan, true);
});
