// app/api/wardrobe/gifts/route.js — GIFTING (V.2 brief §8).
//
// GET  ?user=                         → { incoming, outgoing, given, received, disclaimer }
// POST { user, op: "preview", toHandle }            → { handle } or 404: the
//        CONFIRM-THE-RECIPIENT step the brief asks for, before anything is offered
// POST { user, op: "offer", id, toHandle, note?, idempotencyKey? } → the pending transfer
// POST { user, op: "accept" | "decline" | "cancel", transferId }   → { ok, transfer | reason }
//
// A recipient is named by HANDLE and resolved on the server; the account uuid
// never crosses the wire. Every answer carries the disclaimer both parties
// must see. A signed-in ACCOUNT is required to give or receive — a wardrobe
// row on a device identity cannot be gifted, because the recipient could never
// be resolved back to it.

import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../lib/identity.js";
import { wardrobeEnabled } from "../../../../lib/wardrobe/index.js";
import { TRANSFER_DISCLAIMER } from "../../../../lib/wardrobe/gifts.js";
import {
  GiftRefused, acceptGift, cancelGift, declineGift, listGifts, offerGift, resolveGiftRecipient,
} from "../../../../lib/db/production/wardrobeTransfers.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../../lib/security/json.js";

export const dynamic = "force-dynamic";

const disabled = () => NextResponse.json({ error: "wardrobe is not enabled on this deployment" }, { status: 503 });

export async function GET(req) {
  if (!wardrobeEnabled()) return disabled();
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, String(searchParams.get("user") || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "wardrobe-read", subject: user, limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    return NextResponse.json(await listGifts(user), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "gifts are unavailable right now" }, { status: 503 });
  }
}

export async function POST(req) {
  if (!wardrobeEnabled()) return disabled();
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body || {};
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!accountIdFromIdentity(user)) return NextResponse.json({ error: "gifts ride on a signed-in account" }, { status: 403 });
  const quota = await consumeRateLimit({ scope: "wardrobe-write", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const op = String(body.op || "");
  try {
    if (op === "preview") {
      const to = await resolveGiftRecipient(user, String(body.toHandle || ""));
      if (!to) return NextResponse.json({ error: "that passenger cannot receive gifts right now." }, { status: 404 });
      return NextResponse.json({ handle: to.handle, disclaimer: TRANSFER_DISCLAIMER });
    }
    if (op === "offer") {
      const transfer = await offerGift(user, {
        itemId: String(body.id || ""), toHandle: String(body.toHandle || ""),
        note: body.note == null ? null : String(body.note), idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : null,
      });
      return NextResponse.json({ ok: true, transfer }, { status: transfer.duplicate ? 200 : 201 });
    }
    if (op === "accept" || op === "decline" || op === "cancel") {
      const fn = op === "accept" ? acceptGift : op === "decline" ? declineGift : cancelGift;
      const r = await fn(user, String(body.transferId || ""));
      if (!r.ok) {
        const message = r.reason === "expired" ? "that offer has expired." : r.reason === "piece-gone" ? "that piece is no longer in the sender's wardrobe; nothing changed." : "that offer is no longer open.";
        return NextResponse.json({ ok: false, reason: r.reason, message, disclaimer: TRANSFER_DISCLAIMER }, { status: 409 });
      }
      return NextResponse.json({ ok: true, transfer: r.transfer });
    }
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (error) {
    if (error instanceof GiftRefused) {
      const status = error.code === "unapplied" ? 503 : error.code === "already-offered" ? 409 : error.code === "no-recipient" ? 404 : 400;
      return NextResponse.json({ ok: false, reason: error.code, message: error.message }, { status });
    }
    return NextResponse.json({ error: "could not complete that" }, { status: 500 });
  }
}
