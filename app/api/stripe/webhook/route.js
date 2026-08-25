// app/api/stripe/webhook/route.js
// Stripe → ASILUM. The signature IS the authentication: HMAC over the RAW
// body with STRIPE_WEBHOOK_SECRET (constant-time, ±5 min). Unkeyed deploys
// answer 503 honestly. Handled events settle the order ledger idempotently —
// Stripe retries any non-2xx, and `order_events.stripe_event_id UNIQUE`
// makes every retry a no-op, so a mid-write 500 is safe to re-deliver.

import { NextResponse } from "next/server";
import { verifyStripeSignature } from "../../../../lib/payments/stripe.js";
import { applyStripeWebhook } from "../../../../lib/orders.js";

export const dynamic = "force-dynamic";

/**
 * POST — Stripe's callback. THE SIGNATURE IS THE AUTHENTICATION; there is no
 * session and no token here, so the HMAC check is not optional and must run
 * over the RAW body text. Parsing before verifying would authenticate a
 * re-serialised copy of the payload rather than the payload Stripe signed.
 *
 * The 500 on a processing failure is intentional, not a leak: Stripe retries
 * any non-2xx, and `order_events.stripe_event_id UNIQUE` makes a retry a
 * no-op, so failing loudly is how a half-written order gets completed. An
 * unkeyed deployment answers 503 rather than pretending to accept events.
 */
export async function POST(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook idle — set STRIPE_WEBHOOK_SECRET in the environment" },
      { status: 503 }
    );
  }
  const rawBody = await req.text();
  if (rawBody.length > 128 * 1024) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const verdict = verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret);
  if (!verdict.ok) {
    return NextResponse.json({ error: `invalid signature: ${verdict.reason}` }, { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    const result = await applyStripeWebhook(event);
    return NextResponse.json({ received: true, ...result });
  } catch {
    // 500 on purpose: Stripe redelivers, and redelivery is idempotent here.
    return NextResponse.json({ error: "event processing failed" }, { status: 500 });
  }
}
