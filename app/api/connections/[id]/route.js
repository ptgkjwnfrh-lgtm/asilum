import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../lib/identity.js";
import { disconnectMerchantConnection } from "../../../../lib/db/production.js";
import { enqueueCatalogJob, getMerchantConnection, pauseMerchantConnection, setConnectionStatus } from "../../../../lib/db/production.js";
import { randomUUID } from "node:crypto";
import { readJsonRequest } from "../../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json({ error: "a signed-in account is required" }, { status: 401 });
  const { id } = await params;
  const disconnected = await disconnectMerchantConnection(id, accountId);
  return disconnected
    ? NextResponse.json({ status: "revoked" })
    : NextResponse.json({ error: "connection not found" }, { status: 404 });
}

export async function PATCH(req, { params }) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json({ error: "a signed-in account is required" }, { status: 401 });
  const { id } = await params;
  const connection = await getMerchantConnection(id, { accountId });
  if (!connection) return NextResponse.json({ error: "connection not found" }, { status: 404 });
  if (parsed.body.action === "pause") {
    return await pauseMerchantConnection(id, accountId)
      ? NextResponse.json({ status:"paused" })
      : NextResponse.json({ error:"connection could not be paused" }, { status:409 });
  }
  if (parsed.body.action === "resume") {
    if (connection.status !== "paused") return NextResponse.json({ error:"connection is not paused" }, { status:409 });
    const syncRunId = randomUUID();
    await setConnectionStatus(id, { status:"syncing",lastError:null });
    await enqueueCatalogJob({ connectionId:id,kind:"shopify_reconcile",idempotencyKey:`shopify:resume:${id}:${syncRunId}`,payload:{syncRunId,cursor:null} });
    return NextResponse.json({ status:"syncing" });
  }
  return NextResponse.json({ error:"action must be pause or resume" }, { status:400 });
}
