// app/api/ebay/route.js
// GET /api/ebay?q=<query>&limit=<n>
// Live listings from the OFFICIAL eBay Browse API, normalized to the catalog
// schema (brain-tagged via inferTags, size-recorded via the size brain).
// Inert until EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (+ EBAY_ENV) are set in the
// environment — set them in the deploy platform, never in code.

import { NextResponse } from "next/server";
import { searchEbay } from "../../../lib/ingest/ebay.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { verifiedRequestSubject } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 200);
  const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit"), 10) || 24));
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  if (process.env.EBAY_PARTNERSHIP_APPROVED !== "1") {
    return NextResponse.json(
      { error: "eBay adapter idle — partnership approval is required before live access" },
      { status: 503 }
    );
  }
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "eBay adapter idle — set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (and EBAY_ENV) in the environment" },
      { status: 503 }
    );
  }
  const subject = verifiedRequestSubject(req);
  if (!subject) {
    return NextResponse.json({ error: "signed device identity required" }, { status: 401 });
  }
  const userQuota = await consumeRateLimit({
    scope: "ebay-search", subject,
    limit: process.env.EBAY_USER_MINUTE_LIMIT || 30, windowMs: 60_000,
  });
  if (!userQuota.allowed) {
    return NextResponse.json(rateLimitResponse(userQuota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(userQuota.retryAfterMs / 1000)) },
    });
  }
  const globalQuota = await consumeRateLimit({
    scope: "ebay-search-global", subject: "all-users",
    limit: process.env.EBAY_GLOBAL_MINUTE_LIMIT || 300, windowMs: 60_000,
  });
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(globalQuota.retryAfterMs / 1000)) },
    });
  }
  try {
    const items = await searchEbay(q, { limit });
    return NextResponse.json({ q, count: items.length, items });
  } catch (e) {
    return NextResponse.json({ error: "eBay search is temporarily unavailable" }, { status: 502 });
  }
}
