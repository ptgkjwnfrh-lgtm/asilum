import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../../lib/identity.js";
import { enqueueCatalogJob, getMerchantConnection, setConnectionStatus } from "../../../../../lib/db/production.js";
import { readJsonRequest } from "../../../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json({ error: "a signed-in account is required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope:"catalog-resync",subject:user,limit:6,windowMs:60*60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status:429 });
  const { id } = await params;
  const connection = await getMerchantConnection(id, { accountId });
  if (!connection) return NextResponse.json({ error:"connection not found" }, { status:404 });
  if (["revoked","paused","permission_changed","awaiting_authorization","awaiting_provider_approval"].includes(connection.status)) return NextResponse.json({ error:`connection is ${connection.status}` }, { status:409 });
  const syncRunId = randomUUID();
  const job = await enqueueCatalogJob({ connectionId:id,kind:"shopify_reconcile",idempotencyKey:`shopify:resync:${id}:${parsed.body.operationId || syncRunId}`,payload:{syncRunId,cursor:null} });
  await setConnectionStatus(id, { status:"syncing",lastError:null });
  return NextResponse.json({ status:"syncing",jobId:job.id });
}
