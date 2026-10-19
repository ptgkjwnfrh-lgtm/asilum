// app/api/roads/route.js
// GET /api/roads?lat=&lng=  →  the passport map shape for the streets around
// a point (lib/roads/overpass.js). Rounded to two decimals so readers a
// kilometre apart share one document and one Overpass call; cached a day
// on the server and in the browser. No identity: coordinates arrive in the
// URL by the reader's own choice and nothing is stored against them.

import { NextResponse } from "next/server";
import { roadMapFor, roundCentre } from "../../../lib/roads/overpass.js";
import { consumeGlobalBudget } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat")), lng = parseFloat(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  const budget = await consumeGlobalBudget("roads").catch(() => ({ allowed: true }));
  if (budget && budget.allowed === false) return NextResponse.json({ error: "the map service is resting — try again later" }, { status: 429 });
  try {
    const map = await roadMapFor(lat, lng);
    return NextResponse.json(map, { headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } });
  } catch (e) {
    return NextResponse.json({ error: "no street map could be read for this area", centre: roundCentre(lat, lng), detail: String(e && e.message || e).slice(0, 120) }, { status: 502 });
  }
}
