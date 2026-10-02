// lib/wire/media.js — the Wire's IMAGES (V.2 brief §6 "Add media"), stored
// server-side in the Supabase Storage bucket "wire". SERVER-ONLY.
//
// Mirrors lib/wardrobe/photos.js on purpose — same REST calls, same
// service-role-only writes, same client-re-encoded JPEG ≤ 2 MB rule (the
// browser re-draws the picture to a canvas so EXIF, including GPS, never
// leaves the device; the server re-checks the magic bytes and the size) —
// with ONE difference the brief draws: a published post is public, so this
// bucket is public-read and a post image is one plain URL, not a signed
// one per read. A wardrobe photo stays private; a Wire image is the author
// publishing it. Objects are <userId>/<uuid>.jpg; `x-upsert: false`.
//
// Gate: WIRE_UPLOADS_ENABLED=1 and configured storage; otherwise the
// composer's "Add media" says so and the route answers 503 — never a
// silent fallback to a data URL or a third-party host.

import { randomUUID } from "node:crypto";
import { looksLikeJpeg, storageConfigured } from "../wardrobe/photos.js";
import { PHOTO_MAX_BYTES } from "../wardrobe/photo-contract.js";

export const WIRE_BUCKET = "wire";
export const WIRE_IMAGE_MAX_BYTES = PHOTO_MAX_BYTES;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PATH_PATTERN = /^[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.jpg$/;

function env() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

export function wireUploadsEnabled() { return process.env.WIRE_UPLOADS_ENABLED === "1"; }

/** The one availability gate the route and the composer share. */
export function wireUploadsAvailable() {
  if (!wireUploadsEnabled()) return { available: false, reason: "wire images are not enabled on this deployment" };
  if (!storageConfigured()) return { available: false, reason: "object storage is not configured" };
  return { available: true };
}

async function storageFetch(path, options = {}) {
  const e = env();
  if (!e) throw new Error("storage not configured");
  return fetch(`${e.url}/storage/v1${path}`, { ...options, cache: "no-store", headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, ...(options.headers || {}) } });
}

export function wireObjectPath(userId, version = randomUUID()) {
  if (!USER_ID_PATTERN.test(String(userId || ""))) throw new TypeError("invalid user id");
  return `${userId}/${version}.jpg`;
}

export function safeWirePath(path) {
  const p = String(path || "");
  if (!PATH_PATTERN.test(p)) throw new TypeError("invalid wire image path");
  return p;
}

/** The public URL of a stored image, or null when storage is unconfigured. */
export function wireImageUrl(path) {
  const e = env();
  if (!e) return null;
  try { return `${e.url}/storage/v1/object/public/${WIRE_BUCKET}/${safeWirePath(path)}`; } catch { return null; }
}

/** Idempotent public-read bucket (scripts/setup-wire-storage.mjs). */
export async function ensureWireBucket() {
  const settings = { public: true, file_size_limit: WIRE_IMAGE_MAX_BYTES, allowed_mime_types: ["image/jpeg"] };
  const res = await storageFetch("/bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: WIRE_BUCKET, name: WIRE_BUCKET, ...settings }) });
  let created = res.ok;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status !== 409 && !/already exists/i.test(body.message || body.error || "")) throw new Error(`bucket creation failed (${res.status})`);
    created = false;
  }
  const update = await storageFetch(`/bucket/${WIRE_BUCKET}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
  if (!update.ok) throw new Error(`bucket hardening failed (${update.status})`);
  return { created, existed: !created };
}

/** Store one image; returns its path. Re-checks bytes and size. */
export async function storeWireImage(userId, bytes) {
  if (!looksLikeJpeg(bytes)) throw new TypeError("image must be a JPEG");
  if (bytes.length > WIRE_IMAGE_MAX_BYTES) throw new RangeError("image exceeds 2MB");
  const path = wireObjectPath(userId);
  const res = await storageFetch(`/object/${WIRE_BUCKET}/${path}`, { method: "POST", headers: { "Content-Type": "image/jpeg", "x-upsert": "false" }, body: bytes });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(`image store failed (${res.status}): ${(body.message || body.error || "").slice(0, 120)}`); }
  return path;
}

export async function deleteWireImage(path) {
  const safe = safeWirePath(path);
  const res = await storageFetch(`/object/${WIRE_BUCKET}/${safe}`, { method: "DELETE" });
  return res.ok || res.status === 404;
}
