import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../lib/identity.js";
import { listMerchantConnections } from "../../../lib/db/production.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, String(searchParams.get("user") || ""));
  const accountId = accountIdFromIdentity(user);
  if (!accountId) return NextResponse.json({ error: "a signed-in account is required" }, { status: 401 });
  return NextResponse.json({ connections: await listMerchantConnections(accountId) }, { headers: { "Cache-Control": "no-store" } });
}
