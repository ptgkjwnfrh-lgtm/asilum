// DELETE /api/privacy — erase user-linked personalization data. Purchase
// tickets/consent records, the auth account, and deidentified aggregate item
// statistics are intentionally retained and named in the response.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { purgePersonalizationData } from "../../../lib/db/production.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function DELETE(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (body.confirm !== "DELETE PERSONALIZATION") {
    return NextResponse.json({ error: "confirmation phrase required" }, { status: 400 });
  }
  const quota = await consumeRateLimit({ scope: "privacy-delete", subject: user, limit: 2, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const result = await purgePersonalizationData(user);
  return NextResponse.json({ deleted: true, ...result });
}
