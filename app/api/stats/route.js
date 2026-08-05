// app/api/stats/route.js
// GET /api/stats — aggregate health metrics for the brain: interaction volume
// by action, user/board/graph sizes, and the most-engaged items. Read by the
// /stats dashboard so algorithm changes can be judged against real behavior.

import { NextResponse } from "next/server";
import { getStats, countEvents, getItem } from "../../../lib/db/index.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { publicProduct } from "../../../lib/products.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject, verifiedRequestSubject } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

const BY_ID = new Map(CATALOG.map((it) => [it.id, it]));

export async function GET(req) {
  const quota = await consumeRateLimit({ scope: "stats", subject: requestSubject(req), limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  // Internal telemetry: readable by any real visitor (the signed device
  // cookie rides along on same-origin fetches) but not by bare scrapers.
  if (!verifiedRequestSubject(req)) {
    return NextResponse.json({ error: "identity required" }, { status: 401 });
  }
  const stats = await getStats();
  // Additive: canonical Alpha-Brain event count (the /stats page ignores
  // unknown fields; this makes the event pipeline observable).
  stats.alphaEvents = await countEvents().catch(() => null);
  stats.topItems = await Promise.all(stats.topItems.map(async (t) => {
    const it = await getItem(t.id).catch(() => null) || BY_ID.get(t.id);
    return {
      ...t,
      title: it ? it.title : t.id,
      brand: it ? it.brand : "",
      item: it ? publicProduct(it) : null,
      // Rate is people-per-viewer now; the raw event ratio rides alongside as
      // an abuse fingerprint (120 events from 1 person is a signature).
      rate: t.viewers > 0 ? +(t.engagers / t.viewers).toFixed(3) : null,
      eventRatio: t.engagers > 0 ? +(t.eng / t.engagers).toFixed(1) : null,
    };
  }));
  return NextResponse.json(stats);
}
