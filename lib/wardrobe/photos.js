// lib/wardrobe/photos.js — private Storage for wardrobe photos (Phase 3b).
// SERVER-ONLY. Objects live in the PRIVATE Supabase Storage bucket
// "wardrobe" under <userId>/<itemId>.jpg, written and signed exclusively
// with the service role — the bucket has no public access and the anon key
// never touches it. The client strips metadata before upload (canvas
// re-encode; the original file never leaves the browser), the server
// verifies JPEG bytes and size again. Consent is explicit and versioned
// (DATA-INVENTORY: wardrobe photo upload is a per-feature consent surface);
// no face or biometric analysis exists here — palette color statistics only,
// and that runs client-side through the same palette-v0 code the moodboard
// uses. Erasure: deleteUserPhotos runs inside the /api/privacy flow and
// item deletion removes the object.

import { wardrobeUploadsEnabled } from "./index.js";

export const WARDROBE_BUCKET = "wardrobe";
export const PHOTO_CONSENT_VERSION = "wardrobe-photo-v1-2026-07";
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;

function storageEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

export function storageConfigured() {
  return !!storageEnv();
}

// The single availability gate the route and the wardrobe GET expose.
export function uploadsAvailable() {
  if (!wardrobeUploadsEnabled()) return { available: false, reason: "uploads are not enabled on this deployment" };
  if (!storageConfigured()) return { available: false, reason: "private storage is not configured" };
  return { available: true };
}

export function photoObjectPath(userId, itemId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(userId)) || !/^\d{1,18}$/.test(String(itemId))) {
    throw new TypeError("invalid photo path components");
  }
  return `${userId}/${itemId}.jpg`;
}

// JPEG magic: FF D8 FF. The client re-encodes to JPEG (which drops EXIF);
// anything else is refused server-side too.
export function looksLikeJpeg(bytes) {
  return bytes instanceof Uint8Array && bytes.length > 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function storageFetch(path, options = {}) {
  const env = storageEnv();
  if (!env) throw new Error("storage not configured");
  return fetch(`${env.url}/storage/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.key}`,
      ...(options.headers || {}),
    },
  });
}

// Idempotent private-bucket creation (409 = already exists). Run via
// scripts/setup-wardrobe-storage.mjs; the route never creates buckets.
export async function ensureWardrobeBucket() {
  const res = await storageFetch("/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: WARDROBE_BUCKET, name: WARDROBE_BUCKET, public: false,
      file_size_limit: PHOTO_MAX_BYTES, allowed_mime_types: ["image/jpeg"],
    }),
  });
  if (res.ok) return { created: true };
  const body = await res.json().catch(() => ({}));
  if (res.status === 409 || /already exists/i.test(body.message || body.error || "")) {
    return { created: false, existed: true };
  }
  throw new Error(`bucket creation failed (${res.status}): ${(body.message || body.error || "").slice(0, 120)}`);
}

export async function storeWardrobePhoto(userId, itemId, bytes) {
  if (!looksLikeJpeg(bytes)) throw new TypeError("photo must be a JPEG");
  if (bytes.length > PHOTO_MAX_BYTES) throw new RangeError("photo exceeds 2MB");
  const path = photoObjectPath(userId, itemId);
  const res = await storageFetch(`/object/${WARDROBE_BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`photo store failed (${res.status}): ${(body.message || body.error || "").slice(0, 120)}`);
  }
  return path;
}

export async function signedPhotoUrl(path, expiresIn = SIGNED_URL_TTL_SECONDS) {
  const env = storageEnv();
  if (!env || !path) return null;
  const res = await storageFetch(`/object/sign/${WARDROBE_BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.signedURL ? `${env.url}/storage/v1${body.signedURL}` : null;
}

export async function deleteWardrobePhoto(path) {
  if (!path) return true;
  const res = await storageFetch(`/object/${WARDROBE_BUCKET}/${path}`, { method: "DELETE" });
  return res.ok || res.status === 404;
}

// Personal-data erasure: every object under the user's prefix. Fail loud —
// /api/privacy treats an incomplete erasure as a failed request.
export async function deleteUserPhotos(userId) {
  if (!storageConfigured()) return { deleted: 0 };
  const list = await storageFetch(`/object/list/${WARDROBE_BUCKET}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${userId}/`, limit: 1000 }),
  });
  if (!list.ok) throw new Error(`photo listing failed (${list.status})`);
  const entries = await list.json().catch(() => []);
  const names = (Array.isArray(entries) ? entries : [])
    .map((entry) => `${userId}/${entry.name}`)
    .filter((name) => name.endsWith(".jpg"));
  if (!names.length) return { deleted: 0 };
  const res = await storageFetch(`/object/${WARDROBE_BUCKET}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: names }),
  });
  if (!res.ok) throw new Error(`photo erasure failed (${res.status})`);
  return { deleted: names.length };
}
