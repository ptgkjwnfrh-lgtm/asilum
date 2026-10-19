// app/api/geo/route.js
// GET /api/geo → where this connection appears to be, from the edge's own
// geolocation headers (Vercel stamps x-vercel-ip-* on every request; nothing
// here calls a third party and nothing is stored). Absent headers — local
// dev, a proxy that strips them — answer `{ located: false }` and the
// Passport falls back to the browser's own location or a city picker.
// Coordinates are rounded to two decimals (~1 km): a city area, never a
// street.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const h = req.headers;
  const lat = parseFloat(h.get("x-vercel-ip-latitude") || ""), lng = parseFloat(h.get("x-vercel-ip-longitude") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ located: false, reason: "no geolocation headers on this connection" }, { headers: { "cache-control": "private, no-store" } });
  }
  const city = decodeURIComponent(h.get("x-vercel-ip-city") || "");
  const region = decodeURIComponent(h.get("x-vercel-ip-country-region") || "");
  const country = h.get("x-vercel-ip-country") || "";
  return NextResponse.json({
    located: true, lat: +lat.toFixed(2), lng: +lng.toFixed(2), city, region, country,
    basis: "connection address — a city area, may be wrong on VPNs and cellular routing; confirm or change it",
  }, { headers: { "cache-control": "private, no-store" } });
}
