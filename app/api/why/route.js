// app/api/why/route.js
// Asterisk AI explanation + correction endpoint.
// GET  ?item=<id>&user=<uid> → honest "why am I seeing this" (identity-gated;
//      reasons from real signals only, uncertainty stated).
// POST { productId, code, note? } → structured correction (identity-gated).
//      Preference codes retrain, standing exclusions filter recommendations,
//      and wrong-* codes open moderation tasks.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { explainProduct, recordCorrection, CORRECTION_CODES } from "../../../lib/asterisk/explain.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

function validProductId(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 80 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "why-read", subject: user, limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const item = searchParams.get("item") || "";
  if (!validProductId(item)) {
    return NextResponse.json({ error: "item required" }, { status: 400 });
  }
  const r = await explainProduct(user, item);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 500 });
  return NextResponse.json({ explanation: r.explanation });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 16 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "why-correct", subject: user, limit: 30, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const code = String(body.code || "");
  if (!CORRECTION_CODES.has(code)) {
    return NextResponse.json({ error: "unknown correction code" }, { status: 400 });
  }
  const productId = body.productId == null ? "" : String(body.productId);
  if (!validProductId(productId)) {
    return NextResponse.json({ error: "valid productId required" }, { status: 400 });
  }
  const r = await recordCorrection(user, { productId, code, note: body.note });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status || 400 });
  }
  return NextResponse.json({
    correction: { id: r.correction.id, code: r.correction.code },
    moderationQueued: !!r.moderationTask,
    duplicate: !!r.duplicate,
    profileUpdated: r.profileUpdated,
  });
}
