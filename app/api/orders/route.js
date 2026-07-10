// app/api/orders/route.js
// GET /api/orders?user=<id> — the tickets/orders surface: every add-to-bag
// event, newest first, joined to items.

import { NextResponse } from "next/server";
import { getInteractions, listItems } from "../../../lib/db/index.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user") || "guest";
  const events = await getInteractions(userId, { action: "bag", limit: 60 });

  const byId = new Map(CATALOG.map((it) => [it.id, it]));
  try {
    for (const it of await listItems(1000)) byId.set(it.id, it);
  } catch {}

  const orders = events.map((e) => {
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
  return NextResponse.json({ userId, count: orders.length, orders });
}
