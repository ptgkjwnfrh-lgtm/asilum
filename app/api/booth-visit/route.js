// app/api/booth-visit/route.js
// POST { user?, sourceName } — the attribution channel's ONLY writer (P2).
// A reader clicked a booth on THE WIRE's hotlist; the visit is recorded so
// an order inside the window can carry the booth's name on its ledger row.
// Append-only, rate-limited, and honest: unknown booths refuse — a visit
// to nothing attributes nothing.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { recordBoothVisit } from "../../../lib/db/booths.js";
import { getBusinessBySourceName } from "../../../lib/db/production.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 2 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const sourceName = String(body.sourceName || "").toLowerCase().slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(sourceName)) {
    return NextResponse.json({ error: "sourceName required" }, { status: 400 });
  }
  const quota = await consumeRateLimit({ scope: "booth-visit", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const business = await getBusinessBySourceName(sourceName).catch(() => null);
  if (!business) return NextResponse.json({ error: "no such booth" }, { status: 404 });
  await recordBoothVisit(user, sourceName);
  return NextResponse.json({ visited: true });
}
