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
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { getDiscoverablePool } from "../../../lib/products.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { withPrivateCache } from "../../../lib/security/json.js";
import { listOrdersForUser } from "../../../lib/db/orders.js";
import { listTickets } from "../../../lib/db/production.js";
import { getItems } from "../../../lib/db/index.js";
import { aggregatePlaces } from "../../../lib/asterisk/places.js";

const BOUGHT_OUTCOMES = new Set(["bought", "kept", "returned"]);

// The catalog by id: the seed plus whatever the discoverable pool holds.
async function itemIndex() {
  const byId = new Map(CATALOG.map((it) => [it.id, it]));
  try {
    for (const it of await getDiscoverablePool({ fallback: false })) byId.set(it.id, it);
  } catch {}
  return byId;
}
const epoch = (v) => { const n = new Date(v).getTime(); return Number.isFinite(n) ? n : null; };

export const dynamic = "force-dynamic";

async function handleGET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const quota = await consumeRateLimit({ scope: "orders-read", subject: userId, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  if (searchParams.get("places") === "1") {
    const [orders, tickets] = await Promise.all([listOrdersForUser(userId, 50), listTickets(userId, 200)]);
    const paid = orders.filter((o) => o.status === "paid" && (o.kind || "sale") === "sale");
    const bought = tickets.filter((t) => BOUGHT_OUTCOMES.has(t.userReportedOutcome));
    const wanted = [
      ...paid.map((o) => ({ id: o.item_id, at: epoch(o.created_at) })),
      ...bought.map((t) => ({ id: t.productId, at: t.outcomeReportedAt || t.createdAt || null })),
    ];
    const byId = await itemIndex();
    // a real listing bought after it left the pool still has its row
    const missing = [...new Set(wanted.map((w) => w.id).filter((id) => id && !byId.has(id)))];
    if (missing.length) for (const [id, it] of await getItems(missing)) byId.set(id, it);
    const purchases = wanted.map((w) => {
      const it = w.id ? byId.get(w.id) : null;
      return { brand: it && it.brand ? it.brand : "", at: w.at };
    });
    return NextResponse.json({
      userId, ...aggregatePlaces(purchases),
      sources: { orders: paid.length, tickets: bought.length },
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
