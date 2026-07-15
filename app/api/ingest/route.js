// app/api/ingest/route.js
// POST /api/ingest
// Authorization: Bearer <INGEST_TOKEN>
// Body: { merchantFeedUrl?, officialApiUrl? }
// Pulls items from permitted sources (see lib/ingest/sources.js policy) and
// upserts them into the live item pool. Guarded by the INGEST_TOKEN env var so
// only the operator can trigger it — wire it to a cron on the deploy platform.

import { NextResponse } from "next/server";
import { runIngestion } from "../../../lib/ingest/sources.js";
import { upsertItems } from "../../../lib/db/index.js";
import { bearerToken, secureTokenEqual } from "../../../lib/security/request.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const token = process.env.INGEST_TOKEN;
  if (!token || token.length < 16) {
    return NextResponse.json(
      { error: "ingestion disabled — set INGEST_TOKEN in the environment" },
      { status: 403 }
    );
  }
  if (!secureTokenEqual(bearerToken(req), token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 403 });
  }
  const quota = await consumeRateLimit({ scope: "ingest", subject: "operator", limit: 12, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const parsed = await readJsonRequest(req, { maxBytes: 16 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;

  try {
    const items = await runIngestion({
      merchantFeedUrl: body.merchantFeedUrl,
      officialApiUrl: body.officialApiUrl,
      officialApiKey: process.env.OFFICIAL_API_KEY,
    });
    const count = await upsertItems(items);
    return NextResponse.json({ ingested: count });
  } catch {
    return NextResponse.json({ error: "ingestion failed" }, { status: 502 });
  }
}
