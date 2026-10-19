// app/api/dm/media/route.js — AN IMAGE INTO A THREAD (V.2 brief §3).
//
// ABSENT UNLESS DM_MEDIA_ENABLED=1 (OWNER-DECISIONS #3) — a 404, the same
// answer the mail desk gives when MESSAGING_ENABLED is off. Not a 503 and not
// a "coming soon": a flag that answers politely is a feature that shipped.
//
// POST multipart/form-data: user, conversationId, photo (the ORIGINAL bytes
// — the server inspects, orients, strips and re-encodes them itself;
// lib/dm/media.js), caption? → { delivered, id, at, duplicate }.
// GET ?op=gate → the availability sentence; ?op=load&c=&m= → a fresh signed
// display URL for an archived image ("Archived image · Tap to load").
//
// Every path resolves a signed-in ACCOUNT (ADR-002) and draws the dm-send
// bucket: an image is a send.

import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../lib/identity.js";
import { consumeGlobalBudget, consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { readMultipartRequest } from "../../../../lib/security/multipart.js";
import { describeRefusal, dmMediaEnabled, messagingEnabled, rateBucketFor } from "../../../../lib/dm.js";
import { DM_MEDIA_DEFAULTS, MediaRefused, dmMediaAvailable, processImage } from "../../../../lib/dm/media.js";
import { MessageRefused, MessagingUnavailable, loadDisplay, recordAttachment } from "../../../../lib/db/dm.js";

export const dynamic = "force-dynamic";

const absent = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function GET(req) {
  if (!messagingEnabled() || !dmMediaEnabled()) return absent();
  const url = new URL(req.url);
  const op = url.searchParams.get("op") || "gate";
  if (op === "gate") return NextResponse.json(dmMediaAvailable());
  if (op === "load") {
    const user = await resolveRequestUser(req, url.searchParams.get("user") || "");
    const me = user ? accountIdFromIdentity(user) : null;
    if (!me) return NextResponse.json({ error: "sign in to use messages" }, { status: 401 });
    const quota = await consumeRateLimit({ scope: "dm-inbox", subject: me, limit: 1200, windowMs: 60 * 60 * 1000 });
    if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
    try {
      const displayUrl = await loadDisplay(me, url.searchParams.get("c") || "", url.searchParams.get("m") || "");
      if (!displayUrl) return absent();
      return NextResponse.json({ displayUrl, expiresInSeconds: DM_MEDIA_DEFAULTS.signedUrlSeconds });
    } catch (error) {
      if (error instanceof MessagingUnavailable) return NextResponse.json({ error: "the mail desk is unavailable" }, { status: 503 });
      return NextResponse.json({ error: "could not complete that" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

export async function POST(req) {
  if (!messagingEnabled() || !dmMediaEnabled()) return absent();
  const preAuth = await consumeGlobalBudget("dm-write");
  if (!preAuth.allowed) return NextResponse.json(rateLimitResponse(preAuth), { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(preAuth.retryAfterMs / 1000))) } });
  const parsed = await readMultipartRequest(req, { maxBytes: DM_MEDIA_DEFAULTS.uploadMaxBytes + 64 * 1024 });
  if (parsed.response) return parsed.response;
  const form = parsed.form;
  const user = await resolveRequestUser(req, String(form.get("user") || ""));
  const me = user ? accountIdFromIdentity(user) : null;
  if (!me) return NextResponse.json({ error: "sign in to use messages" }, { status: 401 });
  const gate = dmMediaAvailable();
  if (!gate.available) return NextResponse.json({ error: gate.reason }, { status: 503 });
  const bucket = rateBucketFor("send");
  const quota = await consumeRateLimit({ scope: bucket.scope, subject: me, limit: bucket.limit, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const photo = form.get("photo");
  if (!photo || typeof photo.arrayBuffer !== "function") return NextResponse.json({ error: "image file required" }, { status: 400 });
  let bytes;
  try { bytes = Buffer.from(await photo.arrayBuffer()); } catch { return NextResponse.json({ error: "image could not be read" }, { status: 400 }); }
  let processed;
  try { processed = await processImage(bytes); }
  catch (error) {
    if (error instanceof MediaRefused) return NextResponse.json({ delivered: false, reason: error.code, message: error.message }, { status: 400 });
    return NextResponse.json({ error: "could not complete that" }, { status: 500 });
  }
  try {
    const sent = await recordAttachment({ conversationId: String(form.get("conversationId") || ""), senderId: me, processed, caption: form.get("caption") ? String(form.get("caption")).slice(0, 200) : null });
    return NextResponse.json({ delivered: true, ...sent });
  } catch (error) {
    if (error instanceof MessagingUnavailable) return NextResponse.json({ error: "the mail desk is unavailable" }, { status: 503 });
    if (error instanceof MessageRefused) return NextResponse.json({ delivered: false, ...describeRefusal(error.code) }, { status: 409 });
    return NextResponse.json({ error: "could not complete that" }, { status: 500 });
  }
}
