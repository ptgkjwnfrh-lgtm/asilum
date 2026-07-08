// app/api/ebay/route.js
// GET /api/ebay?q=<query>&limit=<n>
// Live listings from the OFFICIAL eBay Browse API, normalized to the catalog
// schema (brain-tagged via inferTags, size-recorded via the size brain).
// Inert until EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (+ EBAY_ENV) are set in the
// environment — set them in the deploy platform, never in code.

import { NextResponse } from "next/server";
import { searchEbay } from "../../../lib/ingest/ebay.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(50, parseInt(searchParams.get("limit"), 10) || 24);
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "eBay adapter idle — set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (and EBAY_ENV) in the environment" },
      { status: 503 }
    );
  }
  try {
    const items = await searchEbay(q, { limit });
    return NextResponse.json({ q, count: items.length, items });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
