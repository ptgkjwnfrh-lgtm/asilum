// app/api/mapkit/token/route.js — GET → a 30-minute MapKit JS token
// (lib/places/mapkit.js) for Apple's map script on the map popup, the
// places panel and the full map. Unkeyed: `enabled: false` with the reason,
// status 200 (as /api/motion answers — the page asks on every map, and an
// expected "no key" is not an error for the console to log), and the
// surfaces draw the schematic — nothing pretends to be Apple Maps. A key
// that is set but malformed is a real failure: 503. The private key never
// leaves the server; the token is all the page gets. Public, read-only; the
// per-caller quota and the global budget bound it.

import { NextResponse } from "next/server";
import { mapkitToken } from "../../../../lib/places/mapkit.js";
import { consumeRateLimit, rateLimitResponse, consumeGlobalBudget } from "../../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../../lib/security/request.js";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

export async function GET(req) {
  const quota = await consumeRateLimit({ scope: "mapkit", subject: requestSubject(req), limit: 30, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) } });
  const global = await consumeGlobalBudget("mapkit");
  if (!global.allowed) return NextResponse.json(rateLimitResponse(global), { status: 429 });
  let r;
  try { r = mapkitToken(); }
  catch (e) {
    // a key that is set but malformed: say so, draw the schematic
    return NextResponse.json({ enabled: false, source: null, reason: "Apple Maps key refused: " + String(e.message).slice(0, 160) }, { status: 503, headers: NO_STORE });
  }
  if (!r.enabled) return NextResponse.json({ enabled: false, source: null, reason: r.reason }, { headers: NO_STORE });
  return NextResponse.json({ enabled: true, source: r.source, script: r.script, token: r.token, expiresAt: r.expiresAt }, { headers: NO_STORE });
}
