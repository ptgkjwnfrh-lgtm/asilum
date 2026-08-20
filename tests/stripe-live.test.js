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
    feeCents: 50,
    currency: "usd",
    origin: "https://www.asilummagazine.com",
    user: "u-live-test",
  });
  assert.ok(session.id.startsWith("cs_test_"), "session id shape");
  assert.match(session.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(session.amount_total, 150, "item + the floored founders-fee line item");
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

live("ticket-fee intent: the 50¢ standalone floor charges, confirms, and refunds", async () => {
  const { createPaymentIntent, confirmPaymentIntent, createRefund, StripeApiError } = await import("../lib/payments/stripe.js");
  // The reason the standalone floor is 50 and not the ruled 31: Stripe's own
  // minimum. Keep the proof that 31¢ alone is refused.
  await assert.rejects(
    () => createPaymentIntent({ amountCents: 31, currency: "usd", metadata: { kind: "ticket_fee_check" } }),
    (err) => err instanceof StripeApiError && err.code === "amount_too_small"
  );
  const intent = await createPaymentIntent({ amountCents: 50, currency: "usd", metadata: { kind: "ticket_fee_check" } });
  assert.equal(intent.amount, 50);
  const confirmed = await confirmPaymentIntent(intent.id, { paymentMethod: "pm_card_visa", offSession: false });
  assert.equal(confirmed.status, "succeeded");
  assert.equal(confirmed.amount_received, 50);
  const refund = await createRefund(confirmed.id);
  assert.equal(refund.status, "succeeded");
  assert.equal(refund.amount, 50);
});

live("a bad request surfaces Stripe's own error, typed", async () => {
  const { stripeRequest, StripeApiError } = await import("../lib/payments/stripe.js");
  await assert.rejects(
    () => stripeRequest("POST", "/checkout/sessions", { mode: "nonsense" }),
    (err) => err instanceof StripeApiError && err.status === 400
  );
});
