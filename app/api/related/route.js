// app/api/related/route.js
// GET /api/related?item=<id>&limit=<n>
// Pinterest-style "more like this": co-engagement graph neighbors first
// (people who saved this also saved...), tag-similar items to fill out the
// row while the graph is still warming up.

import { NextResponse } from "next/server";
import { relatedItems } from "../../../lib/brain/index.js";
import { getEdges } from "../../../lib/db/index.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { getDiscoverablePool, publicProduct } from "../../../lib/products.js";
import { readEvidence } from "../../../lib/authenticity/evidence.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("item");
  const limit = Math.max(1, Math.min(24, parseInt(searchParams.get("limit"), 10) || 8));
  if (!itemId || itemId.length > 80) return NextResponse.json({ error: "item required" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "related", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  const pool = await getDiscoverablePool();

  const source = pool.find((it) => it.id === itemId);
  if (!source) return NextResponse.json({ error: "item not found" }, { status: 404 });

  const edges = await getEdges([itemId]);
  const items = relatedItems(source, { edges, pool, limit });
  // `item` carries the full source object so deep links (/?item=<id>) can
  // open the detail modal directly.
  // EVIDENCE RIDES THE REQUEST THAT ALREADY FIRES. Opening a piece calls this
  // route for "more like this", so what we can see about the piece arrives on
  // the same round-trip — no control, no second fetch, nothing in the
  // interface that offers a check. docs/INVISIBLE-MACHINERY.md.
  //
  // It returns null below the stake threshold and the key is then omitted
  // entirely, so a cheap piece carries no trace of the feature at all.
  const evidence = await readEvidence(source).catch(() => null);

  return NextResponse.json({
    source: source.id, item: publicProduct(source), count: items.length,
    items: items.map(publicProduct).filter(Boolean),
    ...(evidence ? { evidence } : {}),
  });
}
