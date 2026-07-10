// app/api/tickets/route.js
// The third-party purchase-assistant ticket flow. ASILUM never fulfills:
// the original marketplace/seller confirms, ships, tracks, and services.
//
// POST  { user, itemId, shippingName? }         → create ticket + availability check
// GET   ?user=<id>                              → the user's tickets
// PATCH { id, action: "consent"|"cancel", consent? } → consent gate / cancel
//
// Consent is REQUIRED before any checkout step: PATCH consent without
// consent:true is a 400. No card data, no external passwords — ever.

import { NextResponse } from "next/server";
import { listItems } from "../../../lib/db/index.js";
import {
  createTicket, updateTicket, listTickets, getTicket,
  recordAvailabilityCheck,
} from "../../../lib/db/production.js";
import { getAdapter } from "../../../lib/ingest/adapters/index.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { DISCLAIMER_TEXT, DISCLAIMER_VERSION, DISCLAIMER_CHECKBOX } from "../../../lib/tickets.js";

export const dynamic = "force-dynamic";

async function findItem(itemId) {
  try {
    const pool = await listItems(1000);
    const hit = pool.find((it) => it.id === itemId);
    if (hit) return hit;
  } catch {}
  return CATALOG.find((it) => it.id === itemId) || null;
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const user = String(body.user || "").slice(0, 80);
  const itemId = String(body.itemId || "").slice(0, 80);
  if (!user || !itemId) {
    return NextResponse.json({ error: "user and itemId required" }, { status: 400 });
  }
  const item = await findItem(itemId);
  if (!item) return NextResponse.json({ error: "product not found" }, { status: 404 });

  try {
    let ticket = await createTicket({
      userId: user,
      productId: item.id,
      sourceName: item.source_name || item.source || "seed",
      sourceProductId: item.source_product_id || null,
      sourceProductUrl: item.source_product_url || item.url || null,
      itemPriceAtRequest: item.price ?? null,
      availabilityStatus: item.availability_status || "unknown",
      shippingName: body.shippingName ? String(body.shippingName).slice(0, 120) : null,
    });

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
    } else if ((item.source_name || item.source || "seed").includes("seed") || item.source === "Asilum synthetic seed") {
      availability = "available";
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
  const user = searchParams.get("user") || "";
  if (!user) return NextResponse.json({ tickets: [] });
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
  const ticket = await getTicket(id).catch(() => null);
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });

  if (action === "cancel") {
    return NextResponse.json({ ticket: await updateTicket(id, { status: "canceled" }) });
  }
  if (action === "consent") {
    if (body.consent !== true) {
      return NextResponse.json({ error: "user consent is required before checkout", code: "consent_required" }, { status: 400 });
    }
    if (ticket.status === "unavailable") {
      return NextResponse.json({ error: "item is no longer available at the source" }, { status: 409 });
    }
    const updated = await updateTicket(id, {
      status: "checkout_started",
      consent: true,
      disclaimerVersion: body.disclaimerVersion || DISCLAIMER_VERSION,
      notes: ticket.sourceProductUrl
        ? "checkout continues on the source site — the source handles confirmation, tracking, returns"
        : "no live source URL for this item — demo inventory has no real checkout",
    });
    return NextResponse.json({ ticket: updated, continueUrl: ticket.sourceProductUrl || null });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
