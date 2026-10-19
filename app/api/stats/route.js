// app/api/stats/route.js
// GET /api/stats — aggregate health metrics for the brain: interaction volume
// by action, user/board/graph sizes, and the most-engaged items. Read by the
// /stats dashboard so algorithm changes can be judged against real behavior.

import { NextResponse } from "next/server";
import { getStatsSnapshot, countEvents, getItems } from "../../../lib/db/index.js";
import { analytics } from "../../../lib/analytics.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { publicProduct } from "../../../lib/products.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { bearerToken, secureTokenEqual } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

const BY_ID = new Map(CATALOG.map((it) => [it.id, it]));

// STAFF ONLY (launch-readiness audit, Aug 16). This route previously required
// only `verifiedRequestSubject` — a signed device cookie, which the site issues
// to every visitor on first load. That is proof of a browser, not of staff, so
// in practice these numbers were public: house-wide user/interaction/board/
// graph counts, retention, search, wire and booth metrics, and top-item records
// carrying the synthetic seed source and null source URLs.
//
// Same gate as /api/admin, deliberately reusing its exact shape and its token
// rather than inventing a second staff credential: an unset ADMIN_TOKEN means
// the surface is OFF (503, honest), a wrong one means refused (401).
function staff(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 16) {
    return { ok: false, status: 503, error: "stats disabled — set ADMIN_TOKEN (16+ chars)" };
  }
  if (!secureTokenEqual(bearerToken(req), token)) {
    return { ok: false, status: 401, error: "stats are staff-only" };
  }
  return { ok: true };
}

export async function GET(req) {
  const quota = await consumeRateLimit({ scope: "stats", subject: requestSubject(req), limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  // Checked before any read, so an unauthorized caller never causes a query.
  const gate = staff(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  // ?analytics=1 is the dashboards read (owner directive, Aug 14): the
  // house's own operating numbers, kept OFF the default payload so the
  // page's first paint costs exactly what it did before.
  if (new URL(req.url).searchParams.get("analytics") === "1") {
    return NextResponse.json(await analytics().catch(() => ({ available: false, persistent: null })));
  }
  // (audit #20) The four aggregates behind this answer the same question for
  // every visitor; the snapshot serves them from one read per 15s.
  const stats = await getStatsSnapshot();
  // Additive: canonical Alpha-Brain event count (the /stats page ignores
  // unknown fields; this makes the event pipeline observable).
  // The top-ten hydration was ten separate primary-key queries; it is the same
  // fan-out audit #10 removed from resolveProducts, so it uses the same batch.
  const [alphaEvents, hydrated] = await Promise.all([
    countEvents().catch(() => null),
    getItems(stats.topItems.map((t) => t.id)).catch(() => new Map()),
  ]);
  stats.alphaEvents = alphaEvents;
  stats.topItems = stats.topItems.map((t) => {
    const it = hydrated.get(t.id) || BY_ID.get(t.id);
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
  });
  return NextResponse.json(stats);
}
