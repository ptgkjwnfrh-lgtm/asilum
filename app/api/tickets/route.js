// app/api/tickets/route.js
// The third-party purchase-assistant ticket flow. ASILUM never fulfills:
// the original marketplace/seller confirms, ships, tracks, and services.
//
// POST  { user, itemId }                        → create ticket + availability check
// GET   ?user=<id>                              → the user's tickets
// PATCH { id, action: "consent"|"cancel", consent? } → consent gate / cancel
//
// Consent is REQUIRED before any checkout step; the server stamps the current
// disclaimer version. No card data, shipping PII, or external passwords—ever.

import { NextResponse } from "next/server";
import {
  createTicket, updateTicket, transitionTicket, listTickets, getTicket,
  recordAvailabilityCheck,
} from "../../../lib/db/production.js";
import { getAdapter } from "../../../lib/ingest/adapters/index.js";
import { DISCLAIMER_TEXT, DISCLAIMER_VERSION, DISCLAIMER_CHECKBOX } from "../../../lib/tickets.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { resolveProduct } from "../../../lib/products.js";
import { safeExternalUrl } from "../../../lib/url.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const itemId = String(body.itemId || "").slice(0, 80);
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  const item = await resolveProduct(itemId);
  if (!item) return NextResponse.json({ error: "product not found" }, { status: 404 });
  const sourceUrl = safeExternalUrl(item.source_product_url || item.url);
  const sourceName = item.source_name || item.source || "seed";
  if (!sourceUrl || sourceName.includes("seed") || sourceName === "Asilum synthetic seed") {
    return NextResponse.json(
      { error: "demo inventory cannot create a purchase ticket; use a live source listing" },
      { status: 409 }
    );
  }
  const quota = await consumeRateLimit({ scope: "tickets", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }

  try {
    let ticket = await createTicket({
      userId: user,
      productId: item.id,
      sourceName,
      sourceProductId: item.source_product_id || null,
      sourceProductUrl: sourceUrl,
      itemPriceAtRequest: item.price ?? null,
      availabilityStatus: item.availability_status || "unknown",
      idempotencyKey: body.operationId,
    });

    if (ticket.duplicate && ticket.status !== "requested") {
      return NextResponse.json({
        ticket,
        item: { id: item.id, title: item.title, brand: item.brand, price: ticket.currentPriceChecked ?? item.price, currency: item.currency },
        disclaimer: { text: DISCLAIMER_TEXT, checkbox: DISCLAIMER_CHECKBOX, version: DISCLAIMER_VERSION },
        duplicate: true,
      });
    }

    // Availability check through the source adapter when one is live;
    // demo/seed inventory is honestly labeled available demo stock.
    const adapter = getAdapter(item.source_name);
    let availability = item.availability_status || "unknown";
    let currentPrice = item.price ?? null;
    if (adapter && adapter.enabled().enabled && item.source_product_id) {
      const check = await adapter.checkAvailability(item.source_product_id);
      availability = check.availability_status;
      if (check.price != null) currentPrice = check.price;
      await recordAvailabilityCheck({
        productId: item.id, availabilityStatus: availability,
        previousPrice: item.price ?? null, currentPrice,
        sourceResponseStatus: check.source_response_status ?? null,
      }).catch(() => {});
    }

    ticket = await updateTicket(ticket.id, {
      status: ["sold", "removed"].includes(availability) ? "unavailable" : "awaiting_user_consent",
      availabilityStatus: availability,
      currentPriceChecked: currentPrice,
    }) || ticket;

    return NextResponse.json({
      ticket,
      item: { id: item.id, title: item.title, brand: item.brand, price: currentPrice, currency: item.currency },
      disclaimer: { text: DISCLAIMER_TEXT, checkbox: DISCLAIMER_CHECKBOX, version: DISCLAIMER_VERSION },
    });
  } catch (e) {
    return NextResponse.json({ error: "ticket creation failed", detail: String(e.message).slice(0, 200) }, { status: 500 });
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  try {
    return NextResponse.json({ tickets: await listTickets(user) });
  } catch {
    return NextResponse.json({ tickets: [] });
  }
}

export async function PATCH(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const id = body.id;
  const action = body.action;
  if (!id || !action) return NextResponse.json({ error: "id and action required" }, { status: 400 });
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const ticket = await getTicket(id).catch(() => null);
  // Ownership: only the requesting user may consent to or cancel their ticket.
  if (!ticket || ticket.userId !== user) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  if (action === "cancel") {
    const updated = await transitionTicket(id, user, "cancel");
    if (!updated) {
      return NextResponse.json(
        { error: "ticket can no longer be canceled here; use the source marketplace for an active checkout" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ticket: updated });
  }
  if (action === "consent") {
    if (body.consent !== true) {
      return NextResponse.json({ error: "user consent is required before checkout", code: "consent_required" }, { status: 400 });
    }
    if (ticket.status !== "awaiting_user_consent") {
      return NextResponse.json({ error: "ticket is not awaiting consent" }, { status: 409 });
    }
    const continueUrl = safeExternalUrl(ticket.sourceProductUrl);
    if (!continueUrl) {
      return NextResponse.json({ error: "this ticket has no verified source checkout URL" }, { status: 409 });
    }
    const updated = await transitionTicket(id, user, "consent", {
      disclaimerVersion: DISCLAIMER_VERSION,
      notes: "checkout continues on the source site — the source handles confirmation, tracking, returns",
    });
    if (!updated) {
      return NextResponse.json({ error: "ticket state changed; refresh before continuing" }, { status: 409 });
    }
    return NextResponse.json({ ticket: updated, continueUrl });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
