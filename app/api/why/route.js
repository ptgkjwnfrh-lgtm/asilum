// app/api/why/route.js
// Asterisk AI explanation + correction endpoint.
// GET  ?item=<id>&user=<uid> → honest "why am I seeing this" (identity-gated;
//      reasons from real signals only, uncertainty stated).
// POST { productId, code, note? } → structured correction (identity-gated).
//      Taste codes reshape the profile; wrong-* codes open moderation tasks.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { explainProduct, recordCorrection, CORRECTION_CODES } from "../../../lib/asterisk/explain.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const item = searchParams.get("item") || "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(item)) {
    return NextResponse.json({ error: "item required" }, { status: 400 });
  }
  const r = await explainProduct(user, item);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json({ explanation: r.explanation });
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const code = String(body.code || "");
  if (!CORRECTION_CODES.has(code)) {
    return NextResponse.json({ error: "unknown correction code" }, { status: 400 });
  }
  const productId = body.productId ? String(body.productId) : null;
  if (productId && !/^[A-Za-z0-9_-]{1,80}$/.test(productId)) {
    return NextResponse.json({ error: "bad productId" }, { status: 400 });
  }
  const r = await recordCorrection(user, { productId, code, note: body.note });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.error === "product not found" ? 404 : 400 });
  }
  return NextResponse.json({ correction: { id: r.correction.id, code: r.correction.code } });
}
