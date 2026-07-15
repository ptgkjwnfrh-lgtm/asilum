// app/api/wardrobe/photo/route.js — garment photo upload (Feature C, Phase 3b).
// POST multipart/form-data: user, id (your wardrobe item), consent (the exact
//      current consent version string), photo (JPEG ≤ 2MB, client-re-encoded
//      so metadata never leaves the browser), palette? (JSON [{hex,weight}] —
//      client-side palette-v0, server re-derives, colors land only if the
//      piece has none).
// DELETE { user, id } — remove the photo (object + row fields).
// Gated by WARDROBE_UPLOADS_ENABLED + configured private Storage; refuses
// honestly (503 with the reason) otherwise. No face or biometric analysis —
// color statistics only, and only with the versioned consent.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../../lib/identity.js";
import { getWardrobeItem, setWardrobePhoto, setWardrobeColorsIfEmpty } from "../../../../lib/db/production.js";
import { recordEvent } from "../../../../lib/db/index.js";
import { buildEvent, EVENTS } from "../../../../lib/events/index.js";
import { paletteFromSwatches } from "../../../../lib/vision/palette.js";
import {
  uploadsAvailable, storeWardrobePhoto, deleteWardrobePhoto,
  looksLikeJpeg, PHOTO_CONSENT_VERSION, PHOTO_MAX_BYTES,
} from "../../../../lib/wardrobe/photos.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const gate = uploadsAvailable();
  if (!gate.available) return NextResponse.json({ error: gate.reason }, { status: 503 });

  let form;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }
  const user = await resolveRequestUser(req, String(form.get("user") || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "wardrobe-photo", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  if (String(form.get("consent") || "") !== PHOTO_CONSENT_VERSION) {
    return NextResponse.json(
      { error: `photo upload requires explicit consent (version ${PHOTO_CONSENT_VERSION})` },
      { status: 400 });
  }

  const itemId = String(form.get("id") || "");
  const item = await getWardrobeItem(user, itemId);
  if (!item) return NextResponse.json({ error: "wardrobe item not found" }, { status: 404 });

  const photo = form.get("photo");
  if (!photo || typeof photo.arrayBuffer !== "function") {
    return NextResponse.json({ error: "photo file required" }, { status: 400 });
  }
  if (photo.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "photo exceeds 2MB — the client should downscale first" }, { status: 400 });
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (!looksLikeJpeg(bytes)) {
    return NextResponse.json({ error: "photo must be a client-re-encoded JPEG" }, { status: 400 });
  }

  // Optional palette: client swatches, server derivation (Day 8 pattern) —
  // atomic reject on any bad entry; colors only fill an empty column.
  let derived = null;
  const rawPalette = form.get("palette");
  if (rawPalette) {
    let swatches;
    try { swatches = JSON.parse(String(rawPalette)); } catch {
      return NextResponse.json({ error: "palette must be JSON" }, { status: 400 });
    }
    derived = paletteFromSwatches(swatches);
    if (!derived) return NextResponse.json({ error: "invalid palette payload" }, { status: 400 });
  }

  // Events persist before derived mutations (retry-safe, PR #8 doctrine).
  await recordEvent(buildEvent(user, EVENTS.USER_UPLOADED_IMAGE, {
    surface: "wardrobe-photo", itemId: item.id, consent: PHOTO_CONSENT_VERSION,
  }));

  const path = await storeWardrobePhoto(user, item.id, bytes);
  const updated = await setWardrobePhoto(user, item.id, path, PHOTO_CONSENT_VERSION);
  if (!updated) {
    await deleteWardrobePhoto(path).catch(() => {});
    return NextResponse.json({ error: "wardrobe item disappeared during upload" }, { status: 409 });
  }
  let colorsSet = false;
  if (derived?.palette?.length) {
    colorsSet = !!(await setWardrobeColorsIfEmpty(user, item.id, derived.palette.map((s) => s.hex)));
  }
  return NextResponse.json({ item: { ...updated, colorsSet } }, { status: 201 });
}

export async function DELETE(req) {
  const gate = uploadsAvailable();
  if (!gate.available) return NextResponse.json({ error: gate.reason }, { status: 503 });
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "wardrobe-photo", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const item = await getWardrobeItem(user, String(parsed.body.id || ""));
  if (!item) return NextResponse.json({ error: "wardrobe item not found" }, { status: 404 });
  if (item.photoPath) {
    const removed = await deleteWardrobePhoto(item.photoPath);
    if (!removed) return NextResponse.json({ error: "photo could not be erased" }, { status: 502 });
  }
  const updated = await setWardrobePhoto(user, item.id, null, null);
  return NextResponse.json({ item: updated });
}
