import { NextResponse } from "next/server";
import { getAdapter } from "../../../../../lib/ingest/adapters/index.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/security/rateLimit.js";
import { verifiedRequestSubject } from "../../../../../lib/security/request.js";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { source } = await params;
  const adapter = getAdapter(source);
  if (!adapter || !["ebay", "yahoo-shopping-jp", "rakuten-ichiba"].includes(adapter.getSourceName())) {
    return NextResponse.json({ error: "live source not found" }, { status: 404 });
  }
  const gate = adapter.enabled();
  if (!gate.enabled) return NextResponse.json({ error: `${source} is ${gate.status}`, needs: gate.needs }, { status: 503 });
  const subject = verifiedRequestSubject(req);
  if (!subject) return NextResponse.json({ error: "signed device identity required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: `live-source:${source}`, subject, limit: 30, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const globalBudget = source === "yahoo-shopping-jp"
    ? { limit: process.env.YAHOO_SHOPPING_GLOBAL_SECOND_LIMIT || 1, windowMs: 1_000 }
    : source === "ebay"
      ? { limit: process.env.EBAY_GLOBAL_MINUTE_LIMIT || 300, windowMs: 60_000 }
      : { limit: process.env.RAKUTEN_GLOBAL_MINUTE_LIMIT || 30, windowMs: 60_000 };
  const globalQuota = await consumeRateLimit({ scope: `live-source-global:${source}`, subject: "all-users", ...globalBudget });
  if (!globalQuota.allowed) return NextResponse.json(rateLimitResponse(globalQuota), {
    status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
  });
  const url = new URL(req.url);
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 200);
  if (!query) return NextResponse.json({ error: "q required" }, { status: 400 });
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 24));
  try {
    const items = await adapter.searchProducts(query, {
      limit, page: url.searchParams.get("page"), start: url.searchParams.get("start"),
      maxPages: url.searchParams.get("pages"), marketplaceId: url.searchParams.get("marketplace"),
      categoryId: url.searchParams.get("category"), deliveryCountry: url.searchParams.get("country"),
      deliveryPostalCode: url.searchParams.get("postalCode"),
    });
    return NextResponse.json({ source: adapter.getSourceName(), mode: "live_only", query, count: items.length, items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: `${source} is temporarily unavailable` }, { status: 502 });
  }
}
