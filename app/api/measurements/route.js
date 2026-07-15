import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { deleteUserMeasurements, getUserMeasurements, saveUserMeasurements } from "../../../lib/db/production.js";
import { normalizeMeasurementProfile } from "../../../lib/brain/measurements.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

async function identity(req, claimed) {
  const user = await resolveRequestUser(req, String(claimed || ""));
  return user || null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await identity(req, searchParams.get("user"));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "measurements-read", subject: user, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  return NextResponse.json({ profile: await getUserMeasurements(user) });
}

export async function PUT(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await identity(req, parsed.body.user);
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "measurements-write", subject: user, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const normalized = normalizeMeasurementProfile(parsed.body.profile);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });
  return NextResponse.json({ profile: await saveUserMeasurements(user, normalized.storage) });
}

export async function DELETE(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await identity(req, parsed.body.user);
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "measurements-write", subject: user, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  await deleteUserMeasurements(user);
  return NextResponse.json({ deleted: true });
}
