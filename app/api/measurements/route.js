// app/api/measurements/route.js
// GET / PUT / DELETE — the reader's own body measurements.
//
// FIRST-PARTY ONLY, AND THIS IS THE WHOLE POINT OF THE ROUTE. Measurements
// never travel to a merchant, a model, or any external service, and they are
// never placed in a URL or a query string — every method here takes and
// returns them in the body.
//
// Storage is always INCHES (see lib/brain/measurements.js for the four shapes
// these numbers travel in); `preferredUnit` records only what to display.
// Responses are private-cached, because a shared cache holding one person's
// measurements and serving them to another is the exact failure this data
// cannot survive.
//
// DELETE is real deletion, not a flag — it is part of the §6 privacy promise.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { deleteUserMeasurements, getUserMeasurements, saveUserMeasurements } from "../../../lib/db/production.js";
import { normalizeMeasurementProfile } from "../../../lib/brain/measurements.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { withPrivateCache } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

async function identity(req, claimed) {
  const user = await resolveRequestUser(req, String(claimed || ""));
  return user || null;
}

async function handleGET(req) {
  const { searchParams } = new URL(req.url);
  const user = await identity(req, searchParams.get("user"));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "measurements-read", subject: user, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  return NextResponse.json({ profile: await getUserMeasurements(user) });
}

async function handlePUT(req) {
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

async function handleDELETE(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await identity(req, parsed.body.user);
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "measurements-write", subject: user, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  await deleteUserMeasurements(user);
  return NextResponse.json({ deleted: true });
}

// Personal data: never shared-cacheable (see withPrivateCache).
export const GET = withPrivateCache(handleGET);
export const PUT = withPrivateCache(handlePUT);
export const DELETE = withPrivateCache(handleDELETE);
