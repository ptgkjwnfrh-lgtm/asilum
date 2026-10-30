// app/api/places/route.js
// GET /api/places?lat=&lng=&km=&kind=&dated=1|0&region=&sample=0
// The local and global fashion map's record (lib/places/registry.js): two
// sourced rows and labelled fixtures. Read-only — submissions are Studio
// drafts on the device until a directory table and a review desk exist.
// No identity, no rate limit beyond the global budget: this is public
// reference data with nothing personal in it.

import { NextResponse } from "next/server";
import { listPlaces, placesCoverage, PLACES, PLACES_PROVENANCE, PLACE_KINDS } from "../../../lib/places/registry.js";
import { liveEvents, ticketmasterEnabled, TICKETMASTER_SOURCE } from "../../../lib/places/ticketmaster.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const num = (k) => { const v = parseFloat(url.searchParams.get(k)); return Number.isFinite(v) ? v : null; };
  const lat = num("lat"), lng = num("lng"), km = num("km");
  const kind = url.searchParams.get("kind") || null;
  if (kind && !PLACE_KINDS.includes(kind)) {
    return NextResponse.json({ error: "unknown kind", kinds: PLACE_KINDS }, { status: 400 });
  }
  const datedParam = url.searchParams.get("dated");
  const dated = datedParam === "1" ? true : datedParam === "0" ? false : null;
  const sample = url.searchParams.get("sample") === "0" ? false : null;
  const region = url.searchParams.get("region") || null;
  const today = new Date().toISOString().slice(0, 10);
  const near = lat !== null && lng !== null ? { lat, lng, km: km === null ? 50 : Math.min(Math.max(km, 1), 20000) } : null;
  // LIVE EVENTS (30 Oct 2026): Ticketmaster's listed concerts near the centre
  // (or the country's, with none) fold in under the same filters as the
  // register's rows; `live=0` reads the register alone. Unkeyed, nothing
  // folds in and `live` says why.
  const wantLive = url.searchParams.get("live") !== "0" && (!kind || kind === "concert") && dated !== false;
  const live = wantLive ? await liveEvents({ near: near ? { ...near, km: Math.min(near.km, 500) } : null, size: 20 }) : { enabled: ticketmasterEnabled(), rows: [], reason: "not asked for" };
  // with no centre the order is the record's: the register's sourced rows, then the live listings, then the labelled fixtures —
  // a reader's first twelve PLACE cards are real before they are fictional
  const places = listPlaces({ kind, dated, sample, region, near, from: today }, [...PLACES.filter((p) => !p.sample), ...live.rows, ...PLACES.filter((p) => p.sample)]);
  const coverage = placesCoverage();
  return NextResponse.json({
    provenance: PLACES_PROVENANCE,
    coverage,
    center: near ? { lat, lng, km: near.km } : null,
    count: places.length,
    sampleCount: places.filter((p) => p.sample).length,
    live: { enabled: !!live.enabled, source: live.enabled ? TICKETMASTER_SOURCE : null, count: live.rows.length, reason: live.reason || null },
    places,
  });
}
