// app/api/purchase-info/route.js — SETTINGS' door to the buyer vault (the
// other lawful door is the first purchase, in the ticket-fee route; the
// import graph is enforced by tests/vault-access.test.js). GET reads the
// public shape, PUT edits identity fields, DELETE forgets — ?card=1 drops
// just the saved card. Stripe references never serialize outward; card
// numbers never existed here.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import {
  publicBuyerProfile, upsertBuyerIdentity, removeSavedCard, deleteBuyerProfile,
} from "../../../lib/vault.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  return NextResponse.json({ profile: await publicBuyerProfile(user) });
}

export async function PUT(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "vault", subject: user, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  if (!body.profile || typeof body.profile !== "object") {
    return NextResponse.json({ error: "profile required" }, { status: 400 });
  }
  const p = body.profile;
  const profile = await upsertBuyerIdentity(user, {
    fullName: p.fullName, addressLine1: p.addressLine1, addressLine2: p.addressLine2,
    city: p.city, region: p.region, postalCode: p.postalCode, country: p.country,
  });
  return NextResponse.json({ profile });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "vault", subject: user, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  if (searchParams.get("card") === "1") {
    const profile = await removeSavedCard(user);
    return NextResponse.json({ profile });
  }
  await deleteBuyerProfile(user);
  return NextResponse.json({ profile: null });
}
