// app/api/discover/rails/route.js — cultural Discover rails (Feature D).
// GET  ?user=  → every enabled rail from the registry, content resolved live
//      (culture catalog / trend authority / far-reach products). Identity is
//      OPTIONAL by design, same doctrine as /api/interpret: the registry and
//      culture data are curated and public-shaped; proof only ORDERS
//      screen/soundtrack entities by taste and merges collapse/hide prefs.
// POST { railId, collapsed?, hidden? } → per-user rail preference
//      (identity-gated; the only write this surface owns).

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../../lib/identity.js";
import { discoverRails, railsEnabled } from "../../../../lib/discover/rails.js";
import { setRailPref } from "../../../../lib/db/production.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../../lib/security/request.js";
import { readJsonRequest } from "../../../../lib/security/json.js";

export const dynamic = "force-dynamic";

function disabled() {
  return NextResponse.json({ error: "discover rails are not enabled on this deployment" }, { status: 503 });
}

export async function GET(req) {
  if (!railsEnabled()) return disabled();
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "").catch(() => null);
  const quota = await consumeRateLimit({
    scope: "discover-rails", subject: user || requestSubject(req), limit: 60, windowMs: 60_000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const result = await discoverRails(user);
  return NextResponse.json(result);
}

export async function POST(req) {
  if (!railsEnabled()) return disabled();
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "discover-rails-write", subject: user, limit: 30, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const { railId } = parsed.body;
  const patch = {};
  if (typeof parsed.body.collapsed === "boolean") patch.collapsed = parsed.body.collapsed;
  if (typeof parsed.body.hidden === "boolean") patch.hidden = parsed.body.hidden;
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "collapsed or hidden (boolean) required" }, { status: 400 });
  }
  let pref;
  try {
    pref = await setRailPref(user, String(railId || ""), patch);
  } catch {
    return NextResponse.json({ error: "valid railId required" }, { status: 400 });
  }
  if (!pref) return NextResponse.json({ error: "unknown rail" }, { status: 404 });
  return NextResponse.json({ pref });
}
