// app/api/places/route.js
// GET /api/places?lat=&lng=&km=&kind=&dated=1|0&region=&sample=0
// The local and global fashion map's record (lib/places/registry.js): two
// sourced rows and labelled fixtures. Read-only — submissions are Studio
// drafts on the device until a directory table and a review desk exist.
// No identity, no rate limit beyond the global budget: this is public
// reference data with nothing personal in it.

import { NextResponse } from "next/server";
import { listPlaces, placesCoverage, PLACES_PROVENANCE, PLACE_KINDS } from "../../../lib/places/registry.js";

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
  const places = listPlaces({ kind, dated, sample, region, near, from: today });
  const coverage = placesCoverage();
  return NextResponse.json({
    provenance: PLACES_PROVENANCE,
    coverage,
    center: near ? { lat, lng, km: near.km } : null,
    count: places.length,
    sampleCount: places.filter((p) => p.sample).length,
    places,
  });
}
