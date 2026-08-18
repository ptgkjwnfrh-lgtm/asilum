// app/api/checkout/route.js
// POST { user?, itemId }  → open a Stripe-hosted checkout for a REAL item
//                           (demo archive records refuse with 409 — the same
//                           honesty gate as the ticket flow).
// GET  ?order=<id>        → the caller's own order, reconciled against Stripe
//                           on read when it is still awaiting payment.
//
// Card data never touches this server: the session URL points at
// checkout.stripe.com. Unkeyed deploys answer 503, honestly idle.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { startCheckout, reconcileOrder, getOrder } from "../../../lib/orders.js";

export const dynamic = "force-dynamic";

function publicOrder(order) {
  return {
    id: order.id,
    item_id: order.item_id,
    status: order.status,
    amount_cents: order.amount_cents,
    currency: order.currency,
    created_at: order.created_at,
  };
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const itemId = String(body.itemId || "").slice(0, 80);
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "checkout", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  const result = await startCheckout({ user, itemId });
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ order: result.orderId, url: result.url });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const orderId = String(searchParams.get("order") || "").slice(0, 80);
  if (!orderId) return NextResponse.json({ error: "order required" }, { status: 400 });
  const order = await getOrder(orderId);
  // Wrong-owner reads 404, not 403: order ids should not be probeable.
  if (!order || order.user_id !== user) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  const fresh = await reconcileOrder(order);
  return NextResponse.json({ order: publicOrder(fresh || order) });
}
