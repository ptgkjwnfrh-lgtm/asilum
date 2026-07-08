// app/api/ingest/route.js
// POST /api/ingest
// Body: { token, merchantFeedUrl?, officialApiUrl?, officialApiKey? }
// Pulls items from permitted sources (see lib/ingest/sources.js policy) and
// upserts them into the live item pool. Guarded by the INGEST_TOKEN env var so
// only the operator can trigger it — wire it to a cron on the deploy platform.

import { NextResponse } from "next/server";
import { runIngestion } from "../../../lib/ingest/sources.js";
import { upsertItems } from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "ingestion disabled — set INGEST_TOKEN in the environment" },
      { status: 403 }
    );
  }
  if (body.token !== token) {
    return NextResponse.json({ error: "invalid token" }, { status: 403 });
  }

  const items = await runIngestion({
    merchantFeedUrl: body.merchantFeedUrl,
    officialApiUrl: body.officialApiUrl,
    officialApiKey: body.officialApiKey,
  });
  const count = await upsertItems(items);
  return NextResponse.json({ ingested: count });
}
