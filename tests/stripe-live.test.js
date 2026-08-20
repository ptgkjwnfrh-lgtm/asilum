// tests/stripe-live.test.js — the fetch client against the REAL Stripe API,
// test mode. SKIPPED unless STRIPE_SECRET_KEY is set (CI is unkeyed; the
// carried live-pg suite is the precedent). Never run with a live key: the
// first assertion refuses anything that is not sk_test_.

import test from "node:test";
import assert from "node:assert/strict";

const KEY = process.env.STRIPE_SECRET_KEY || "";
const live = KEY ? test : test.skip;

live("checkout session round-trip against Stripe test mode", async () => {
  assert.ok(KEY.startsWith("sk_test_"), "REFUSING a non-test key");
  const { createCheckoutSession, retrieveCheckoutSession } = await import("../lib/payments/stripe.js");
  const session = await createCheckoutSession({
    orderId: "ord_live_test",
    itemId: "live-test-item",
    title: "ASILUM client round-trip check",
    amountCents: 100,
    feeCents: 1,
    currency: "usd",
    origin: "https://www.asilummagazine.com",
    user: "u-live-test",
  });
  assert.ok(session.id.startsWith("cs_test_"), "session id shape");
  assert.match(session.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(session.amount_total, 101, "item + the 1% founders-fee line item");
  assert.equal(session.payment_status, "unpaid");
  const again = await retrieveCheckoutSession(session.id);
  assert.equal(again.id, session.id);
  assert.equal(again.metadata.order_id, "ord_live_test");
});

live("refund round-trip: a directly-confirmed test payment refunds in full", async () => {
  const { stripeRequest, createRefund } = await import("../lib/payments/stripe.js");
  // pm_card_visa confirms instantly in test mode — no browser needed.
  const intent = await stripeRequest("POST", "/payment_intents", {
    amount: 500, currency: "usd", payment_method: "pm_card_visa",
    confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  });
  assert.equal(intent.status, "succeeded");
  const refund = await createRefund(intent.id);
  assert.ok(refund.id.startsWith("re_"));
  assert.equal(refund.status, "succeeded");
  assert.equal(refund.amount, 500);
});

live("a bad request surfaces Stripe's own error, typed", async () => {
  const { stripeRequest, StripeApiError } = await import("../lib/payments/stripe.js");
  await assert.rejects(
    () => stripeRequest("POST", "/checkout/sessions", { mode: "nonsense" }),
    (err) => err instanceof StripeApiError && err.status === 400
  );
});
