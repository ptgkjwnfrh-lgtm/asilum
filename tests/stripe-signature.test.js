// tests/stripe-signature.test.js — the webhook's only lock is this HMAC.
// Pure crypto, no network. Each case is a way an attacker (or a stale retry)
// could knock: a forged body, a replayed timestamp, a wrong secret, garbage.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature, stripeFormEncode } from "../lib/payments/stripe.js";

const SECRET = "whsec_test_0123456789abcdef";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

function sign(body, secret, t) {
  const mac = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

test("valid signature within tolerance passes", () => {
  const t = Math.floor(Date.now() / 1000);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, SECRET, t), SECRET).ok, true);
});

test("tampered body fails", () => {
  const t = Math.floor(Date.now() / 1000);
  const header = sign(BODY, SECRET, t);
  const verdict = verifyStripeSignature(BODY.replace("completed", "expired"), header, SECRET);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "signature mismatch");
});

test("wrong secret fails", () => {
  const t = Math.floor(Date.now() / 1000);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, "whsec_other", t), SECRET).ok, false);
});

test("stale timestamp fails even with a valid mac", () => {
  const t = Math.floor(Date.now() / 1000) - 3600;
  const verdict = verifyStripeSignature(BODY, sign(BODY, SECRET, t), SECRET);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "timestamp outside tolerance");
});

test("one valid v1 among several passes (secret-roll shape)", () => {
  const t = Math.floor(Date.now() / 1000);
  const good = sign(BODY, SECRET, t).split("v1=")[1];
  const header = `t=${t},v1=${"0".repeat(64)},v1=${good}`;
  assert.equal(verifyStripeSignature(BODY, header, SECRET).ok, true);
});

test("garbage headers refuse without throwing", () => {
  for (const header of [null, "", "t=,v1=", "v1=zz", "t=123", `t=abc,v1=${"0".repeat(64)}`]) {
    const verdict = verifyStripeSignature(BODY, header, SECRET);
    assert.equal(verdict.ok, false);
  }
});

test("no configured secret refuses", () => {
  const t = Math.floor(Date.now() / 1000);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, SECRET, t), "").ok, false);
});

test("form encoding flattens the shapes Stripe expects", () => {
  const encoded = stripeFormEncode({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 1900 } }],
    metadata: { order_id: "ord_x" },
  }).toString();
  assert.match(encoded, /mode=payment/);
  assert.match(encoded, /line_items%5B0%5D%5Bquantity%5D=1/);
  assert.match(encoded, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1900/);
  assert.match(encoded, /metadata%5Border_id%5D=ord_x/);
});
