// lib/wardrobe/photos.js — private Storage for wardrobe photos (Phase 3b).
// SERVER-ONLY. Objects live in the PRIVATE Supabase Storage bucket
// "wardrobe" under versioned <userId>/<itemId>-<uuid>.jpg paths, written and signed exclusively
// with the service role — the bucket has no public access and the anon key
// never touches it. The client strips metadata before upload (canvas
// re-encode; the original file never leaves the browser), the server
// verifies JPEG bytes and size again. Consent is explicit and versioned
// (DATA-INVENTORY: wardrobe photo upload is a per-feature consent surface);
// no face or biometric analysis exists here — palette color statistics only,
// and that runs client-side through the same palette-v0 code the moodboard
// uses. Erasure: deleteUserPhotos runs inside the /api/privacy flow and
// item deletion removes the object.

import { randomUUID } from "node:crypto";
import { wardrobeUploadsEnabled } from "./index.js";
import {
  PHOTO_CONSENT_VERSION, PHOTO_MAX_BYTES, SIGNED_PHOTO_URL_TTL_SECONDS,
} from "./photo-contract.js";

export { PHOTO_CONSENT_VERSION, PHOTO_MAX_BYTES } from "./photo-contract.js";

export const WARDROBE_BUCKET = "wardrobe";
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const ITEM_ID_PATTERN = /^\d{1,18}$/;
const VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_NAME_PATTERN = /^\d{1,18}(?:-[0-9a-f-]{36})?\.jpg$/i;
const ERASURE_BATCH_SIZE = 1000;
const MAX_ERASURE_BATCHES = 10_000;

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

export function photoObjectPath(userId, itemId, version = randomUUID()) {
  if (!USER_ID_PATTERN.test(String(userId)) || !ITEM_ID_PATTERN.test(String(itemId)) ||
      !VERSION_PATTERN.test(String(version))) {
    throw new TypeError("invalid photo path components");
  }
  return `${userId}/${itemId}-${version}.jpg`;
}

function safeStoredPhotoPath(path) {
  const value = String(path || "");
  const slash = value.indexOf("/");
  if (slash < 1 || value.indexOf("/", slash + 1) !== -1 ||
      !USER_ID_PATTERN.test(value.slice(0, slash)) ||
      !PHOTO_NAME_PATTERN.test(value.slice(slash + 1))) {
    throw new TypeError("invalid stored photo path");
  }
  return value;
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
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${env.key}`,
      ...(options.headers || {}),
    },
  });
}

// Idempotent private-bucket creation (409 = already exists). Run via
// scripts/setup-wardrobe-storage.mjs; the route never creates buckets.
export async function ensureWardrobeBucket() {
  const settings = {
    public: false,
    file_size_limit: PHOTO_MAX_BYTES,
    allowed_mime_types: ["image/jpeg"],
  };
  const res = await storageFetch("/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: WARDROBE_BUCKET, name: WARDROBE_BUCKET, ...settings,
    }),
  });
  let created = res.ok;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status !== 409 && !/already exists/i.test(body.message || body.error || "")) {
      throw new Error(`bucket creation failed (${res.status}): ${(body.message || body.error || "").slice(0, 120)}`);
    }
    created = false;
  }
  // Idempotency must converge configuration too: an existing public or
  // loosely configured bucket is repaired, never accepted as "already set".
  const update = await storageFetch(`/bucket/${WARDROBE_BUCKET}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!update.ok) throw new Error(`bucket hardening failed (${update.status})`);
  const verify = await storageFetch(`/bucket/${WARDROBE_BUCKET}`, { method: "GET" });
  if (!verify.ok) throw new Error(`bucket verification failed (${verify.status})`);
  const bucket = await verify.json().catch(() => ({}));
  const mimeTypes = bucket.allowed_mime_types || bucket.allowedMimeTypes || [];
  const sizeLimit = Number(bucket.file_size_limit ?? bucket.fileSizeLimit);
  if (bucket.public !== false || sizeLimit !== PHOTO_MAX_BYTES ||
      !Array.isArray(mimeTypes) || mimeTypes.length !== 1 || mimeTypes[0] !== "image/jpeg") {
    throw new Error("bucket verification failed: private JPEG-only 2MB policy is not active");
  }
  return { created, existed: !created, verified: true };
}

export async function storeWardrobePhoto(userId, itemId, bytes) {
  if (!looksLikeJpeg(bytes)) throw new TypeError("photo must be a JPEG");
  if (bytes.length > PHOTO_MAX_BYTES) throw new RangeError("photo exceeds 2MB");
  const path = photoObjectPath(userId, itemId);
  const res = await storageFetch(`/object/${WARDROBE_BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`photo store failed (${res.status}): ${(body.message || body.error || "").slice(0, 120)}`);
  }
  return path;
}

export async function signedPhotoUrl(path, expiresIn = SIGNED_PHOTO_URL_TTL_SECONDS) {
  const env = storageEnv();
  if (!env || !path) return null;
  let safePath;
  try { safePath = safeStoredPhotoPath(path); } catch { return null; }
  const ttl = Math.max(30, Math.min(SIGNED_PHOTO_URL_TTL_SECONDS, Math.trunc(Number(expiresIn)) || SIGNED_PHOTO_URL_TTL_SECONDS));
  const res = await storageFetch(`/object/sign/${WARDROBE_BUCKET}/${safePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: ttl }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.signedURL ? `${env.url}/storage/v1${body.signedURL}` : null;
}

export async function deleteWardrobePhoto(path) {
  if (!path) return true;
  const safePath = safeStoredPhotoPath(path);
  const res = await storageFetch(`/object/${WARDROBE_BUCKET}/${safePath}`, { method: "DELETE" });
  return res.ok || res.status === 404;
}

// Personal-data erasure: every object under the user's prefix. Fail loud —
// /api/privacy treats an incomplete erasure as a failed request.
export async function deleteUserPhotos(userId) {
  if (!USER_ID_PATTERN.test(String(userId))) throw new TypeError("invalid photo owner");
  if (!storageConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("photo storage is not configured; erasure cannot be verified");
    return { deleted: 0 };
  }
  let deleted = 0;
  for (let batch = 0; batch < MAX_ERASURE_BATCHES; batch++) {
    const list = await storageFetch(`/object/list/${WARDROBE_BUCKET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: `${userId}/`, limit: ERASURE_BATCH_SIZE, offset: 0 }),
    });
    if (!list.ok) throw new Error(`photo listing failed (${list.status})`);
    const entries = await list.json().catch(() => []);
    if (!Array.isArray(entries)) throw new Error("photo listing returned an invalid payload");
    if (!entries.length) return { deleted };
    const names = entries.map((entry) => {
      const name = String(entry?.name || "");
      if (!PHOTO_NAME_PATTERN.test(name)) {
        throw new Error("unexpected object under the user's wardrobe prefix");
      }
      return `${userId}/${name}`;
    });
    const res = await storageFetch(`/object/${WARDROBE_BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: names }),
    });
    if (!res.ok) throw new Error(`photo erasure failed (${res.status})`);
    deleted += names.length;
  }
  throw new Error("photo erasure exceeded the safety batch limit");
}
