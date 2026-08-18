// tests/orders-engine.test.js — the order ledger's laws, in memory mode:
// event + projection move together, webhook redelivery is a no-op, `paid`
// never downgrades, and the honesty gate refuses everything the catalog
// currently contains (all seed-sourced). Unkeyed, no network.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.STRIPE_SECRET_KEY;
delete process.env.DATABASE_URL;

const { refusalReason, startCheckout, applyStripeWebhook } = await import("../lib/orders.js");
const {
  createOrderWithEvent, attachOrderSession, applyOrderEvent, getOrder, listOrderEvents,
} = await import("../lib/db/orders.js");

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
