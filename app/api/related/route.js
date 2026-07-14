// app/api/related/route.js
// GET /api/related?item=<id>&limit=<n>
// Pinterest-style "more like this": co-engagement graph neighbors first
// (people who saved this also saved...), tag-similar items to fill out the
// row while the graph is still warming up.

import { NextResponse } from "next/server";
import { relatedItems } from "../../../lib/brain/index.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { listItems, getEdges } from "../../../lib/db/index.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { isDiscoverableProduct } from "../../../lib/products.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("item");
  const limit = Math.min(24, parseInt(searchParams.get("limit"), 10) || 8);
  if (!itemId || itemId.length > 80) return NextResponse.json({ error: "item required" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "related", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  let pool = [];
  try { pool = await listItems(5000); } catch { pool = []; }
  pool = pool.filter(isDiscoverableProduct);
  if (!pool || pool.length === 0) pool = CATALOG;

  const source = pool.find((it) => it.id === itemId) || CATALOG.find((it) => it.id === itemId);
  if (!source) return NextResponse.json({ error: "item not found" }, { status: 404 });

  const edges = await getEdges([itemId]);
  const items = relatedItems(source, { edges, pool, limit });
  // `item` carries the full source object so deep links (/?item=<id>) can
  // open the detail modal directly.
  return NextResponse.json({ source: source.id, item: source, count: items.length, items });
}
