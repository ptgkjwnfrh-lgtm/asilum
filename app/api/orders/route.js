// app/api/orders/route.js
// GET /api/orders?user=<id> — real purchase tickets live elsewhere; this
// endpoint returns bag intent history, newest first, joined to items.

import { NextResponse } from "next/server";
import { getInteractions } from "../../../lib/db/index.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { getDiscoverablePool } from "../../../lib/products.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = await resolveRequestUser(req, searchParams.get("user") || "guest");
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const quota = await consumeRateLimit({ scope: "orders-read", subject: userId, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const events = await getInteractions(userId, { action: "bag", limit: 60 });

  const byId = new Map(CATALOG.map((it) => [it.id, it]));
  try {
    for (const it of await getDiscoverablePool({ fallback: false })) byId.set(it.id, it);
  } catch {}

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
