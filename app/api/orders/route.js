// app/api/orders/route.js
// GET /api/orders?user=<id> — real purchase tickets live elsewhere; this
// endpoint returns bag intent history, newest first, joined to items.
// GET /api/orders?places=1 — THE PURCHASE GLOBE (/upload, 9 Sep): the cities
// the caller's bought pieces came from. A purchase is a PAID sale order, or a
// purchase ticket the caller reported as bought / kept / returned (each of
// those means the piece was bought; "not-bought" does not). A ticket-fee
// order pays ASILUM's fee alone — the piece behind it IS the ticket, counted
// once there. Bag intent is never a purchase. Each piece's house → its city
// (lib/asterisk/places.js); a house the record cannot place is reported in
// `unplaced`, never guessed onto the globe.

import { NextResponse } from "next/server";
import { getInteractions } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { withPrivateCache } from "../../../lib/security/json.js";
import { listOrdersForUser } from "../../../lib/db/orders.js";
import { listTickets } from "../../../lib/db/production.js";
import { getItems } from "../../../lib/db/index.js";
import { aggregatePlaces } from "../../../lib/asterisk/places.js";
import { buildPurchaseHub } from "../../../lib/orders/hub.js";
import { boughtPieces, itemIndex } from "../../../lib/orders/bought.js";
import { envelope } from "../../../lib/api/outcome.js";

export const dynamic = "force-dynamic";

async function handleGET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const quota = await consumeRateLimit({ scope: "orders-read", subject: userId, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  // THE PURCHASE HUB (V.2): one read facade over payment orders and source
  // tickets with separate payment / fee / merchant / outcome lanes. A read,
  // never a transition; the state machines in lib/orders.js and the ticket
  // store stay authoritative (lib/orders/hub.js).
  if (searchParams.get("hub") === "1") {
    const [orders, tickets] = await Promise.all([listOrdersForUser(userId, 50), listTickets(userId, 200)]);
    const byId = await itemIndex();
    const wanted = [...new Set([...orders.map((o) => o.item_id), ...tickets.map((t) => t.productId)].filter((id) => id && !byId.has(id)))];
    if (wanted.length) for (const [id, it] of await getItems(wanted)) byId.set(id, it);
    const titles = new Map();
    for (const id of [...orders.map((o) => o.item_id), ...tickets.map((t) => t.productId)]) {
      const it = id ? byId.get(id) : null;
      if (it) titles.set(id, { title: it.title || null, brand: it.brand || null });
    }
    const hub = buildPurchaseHub({ orders, tickets, titles });
    return NextResponse.json({ ...envelope({ count: hub.records.length }), userId, ...hub });
  }

  if (searchParams.get("places") === "1") {
    const { purchases, sources } = await boughtPieces(userId);
    return NextResponse.json({
      userId, ...aggregatePlaces(purchases.map((p) => ({ brand: p.item && p.item.brand ? p.item.brand : "", at: p.at }))),
      sources,
    });
  }

  const events = await getInteractions(userId, { action: "bag", limit: 60 });
  const byId = await itemIndex();

  const bagHistory = events.map((e) => {
    const it = byId.get(e.itemId);
    return {
      id: e.itemId,
      at: e.at,
      title: it ? it.title : e.itemId,
      brand: it ? it.brand : "",
      price: it ? it.price : null,
      currency: it ? it.currency : "USD",
      tags: it ? it.tags : {},
      img: it ? it.img : null,
    };
  });
  return NextResponse.json({ userId, count: bagHistory.length, bagHistory });
}

// Personal data: never shared-cacheable (see withPrivateCache).
export const GET = withPrivateCache(handleGET);
