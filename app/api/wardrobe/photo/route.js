// app/api/wardrobe/photo/route.js — garment photo upload (Feature C, Phase 3b).
// POST multipart/form-data: user, id (your wardrobe item), consent (the exact
//      current consent version string), photo (JPEG ≤ 2MB, client-re-encoded
//      so metadata never leaves the browser), palette? (JSON [{hex,weight}] —
//      client-side palette-v0, server re-derives, colors land only if the
//      piece has none).
// DELETE { user, id } — remove the photo (object + row fields).
// New uploads are gated by WARDROBE_UPLOADS_ENABLED + configured private
// Storage. Erasure remains available when the upload kill switch is off. No
// face or biometric analysis — color statistics only, and only with consent.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../../lib/identity.js";
import { getWardrobeItem, setWardrobePhoto, withUserOperationLock } from "../../../../lib/db/production.js";
import { recordEvent } from "../../../../lib/db/index.js";
import { buildEvent, EVENTS } from "../../../../lib/events/index.js";
import { paletteFromSwatches } from "../../../../lib/vision/palette.js";
import {
  uploadsAvailable, storeWardrobePhoto, deleteWardrobePhoto,
  looksLikeJpeg, storageConfigured, PHOTO_CONSENT_VERSION, PHOTO_MAX_BYTES,
} from "../../../../lib/wardrobe/photos.js";
import { PHOTO_REQUEST_MAX_BYTES } from "../../../../lib/wardrobe/photo-contract.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../../lib/security/json.js";
import { readMultipartRequest } from "../../../../lib/security/multipart.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsedMultipart = await readMultipartRequest(req, { maxBytes: PHOTO_REQUEST_MAX_BYTES });
  if (parsedMultipart.response) return parsedMultipart.response;
  const form = parsedMultipart.form;
  const user = await resolveRequestUser(req, String(form.get("user") || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const gate = uploadsAvailable();
  if (!gate.available) return NextResponse.json({ error: gate.reason }, { status: 503 });
  const quota = await consumeRateLimit({ scope: "wardrobe-photo", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  if (String(form.get("consent") || "") !== PHOTO_CONSENT_VERSION) {
    return NextResponse.json(
      { error: `photo upload requires explicit consent (version ${PHOTO_CONSENT_VERSION})` },
      { status: 400 });
  }

  const itemId = String(form.get("id") || "");

  const photo = form.get("photo");
  if (!photo || typeof photo.arrayBuffer !== "function") {
    return NextResponse.json({ error: "photo file required" }, { status: 400 });
  }
  if (!photo.size || photo.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "photo exceeds 2MB — the client should downscale first" }, { status: 400 });
  }
  if (photo.type && photo.type !== "image/jpeg") {
    return NextResponse.json({ error: "photo must be a client-re-encoded JPEG" }, { status: 400 });
  }
  let bytes;
  try { bytes = new Uint8Array(await photo.arrayBuffer()); } catch {
    return NextResponse.json({ error: "photo could not be read" }, { status: 400 });
  }
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

  const colors = derived?.palette?.length ? derived.palette.map((swatch) => swatch.hex) : [];
  return withUserOperationLock(user, async (queryTarget) => {
    const item = await getWardrobeItem(user, itemId, queryTarget);
    if (!item) return NextResponse.json({ error: "wardrobe item not found" }, { status: 404 });

    // Events persist before derived mutations (retry-safe, PR #8 doctrine).
    await recordEvent(buildEvent(user, EVENTS.USER_UPLOADED_IMAGE, {
      surface: "wardrobe-photo", itemId: item.id, consent: PHOTO_CONSENT_VERSION,
    }), queryTarget);

    let path;
    try {
      path = await storeWardrobePhoto(user, item.id, bytes);
    } catch {
      return NextResponse.json({ error: "private photo storage failed" }, { status: 502 });
    }
    let updated;
    try {
      updated = await setWardrobePhoto(user, item.id, path, PHOTO_CONSENT_VERSION, {
        expectedPhotoPath: item.photoPath,
        colors,
        queryTarget,
      });
    } catch {
      // If the database outcome is unknown, never delete an object that may
      // already be the committed row target. The privacy sweep catches any
      // truly orphaned version.
      const current = await getWardrobeItem(user, item.id, queryTarget).catch(() => null);
      if (current?.photoPath !== path) await deleteWardrobePhoto(path).catch(() => {});
      return NextResponse.json({ error: "photo metadata could not be saved" }, { status: 502 });
    }
    if (!updated) {
      await deleteWardrobePhoto(path).catch(() => {});
      return NextResponse.json({ error: "wardrobe item changed during upload; retry" }, { status: 409 });
    }
    if (item.photoPath && item.photoPath !== path) {
      const removed = await deleteWardrobePhoto(item.photoPath).catch(() => false);
      if (!removed) {
        return NextResponse.json({
          error: "new photo stored, but previous photo erasure could not be verified",
        }, { status: 502 });
      }
    }
    const colorsSet = colors.length > 0 && (!Array.isArray(item.colors) || item.colors.length === 0);
    return NextResponse.json({ item: { ...updated, colorsSet } }, { status: 201 });
  });
}

export async function DELETE(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "wardrobe-photo", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  return withUserOperationLock(user, async (queryTarget) => {
    const item = await getWardrobeItem(user, String(parsed.body.id || ""), queryTarget);
    if (!item) return NextResponse.json({ error: "wardrobe item not found" }, { status: 404 });
    if (!item.photoPath) return NextResponse.json({ item });
    if (!storageConfigured()) {
      return NextResponse.json({ error: "private storage is not configured; erasure cannot be verified" }, { status: 503 });
    }
    const removed = await deleteWardrobePhoto(item.photoPath).catch(() => false);
    if (!removed) return NextResponse.json({ error: "photo could not be erased" }, { status: 502 });
    const updated = await setWardrobePhoto(user, item.id, null, null, {
      expectedPhotoPath: item.photoPath,
      queryTarget,
    });
    if (!updated) return NextResponse.json({ error: "photo changed during erasure; retry" }, { status: 409 });
    return NextResponse.json({ item: updated });
  });
}
