// lib/dm/media.js — THE DM MEDIA PIPELINE (V.2 brief §3), BUILT AND GATED OFF.
// SERVER-ONLY.
//
// OWNER-DECISIONS #3 keeps DM media absent until a CSAM hash-matching
// provider, a DMCA designated agent, named moderators and a response target
// exist. This file is the pipeline those decisions gate: nothing imports it
// on a request path unless `dmMediaEnabled()` (lib/dm.js, DM_MEDIA_ENABLED=1)
// AND storage is configured. Until then the /api/dm/media route is a 404.
//
// What one upload goes through, in order, on the server's own copy of the
// bytes — never on what the client says about them:
//
//   1. the byte ceiling (DM_UPLOAD_MAX_BYTES, default 10 MB) before decode;
//   2. sharp reads the real format and dimensions; anything that is not a
//      still JPEG/PNG/WebP/HEIC is refused; a pixel count over the decode
//      limit (DM_DECODE_MAX_PIXELS, default 40 MP) is refused BEFORE decode
//      (a decompression bomb is a small file with a huge header);
//   3. orientation is applied from EXIF, then EVERY metadata block is
//      dropped — EXIF, GPS, ICC, XMP — because re-encoding without
//      `withMetadata()` is sharp's strip;
//   4. a DISPLAY image: long edge ≤ DM_DISPLAY_MAX_EDGE (1600), WebP quality
//      DM_WEBP_QUALITY (78) — garment texture survives at this size;
//   5. a THUMBNAIL: long edge DM_THUMB_EDGE (320), WebP, for the list, the
//      archive placeholder and the notification-free preview;
//   6. sha256 of the ORIGINAL bytes, for de-duplication INSIDE ONE
//      CONVERSATION only (dm_attachments UNIQUE (conversation_id, sha256)) —
//      never across an authorisation boundary.
//
// The defaults are the brief's tuning candidates, not optimums; every one is
// an environment variable and the stage note reports them. Animated media and
// video need a transcoder and duration limits that do not exist: refused.
//
// THE ARCHIVE POLICY. After six calendar months (lib/dm.js archiveBoundary)
// the display image is no longer auto-loaded; the thumbnail and the metadata
// stay. On Supabase Storage both objects sit in the same private bucket at
// the same price: at these sizes (a display WebP is ~100–250 KB, a thumbnail
// ~15 KB) an archive tier with a minimum billable object size and retrieval
// fees would cost MORE, not less. The policy is a bandwidth and attention
// policy, not a storage-cost policy, and the note says so.

import { createHash, randomUUID } from "node:crypto";
import { dmMediaEnabled } from "../dm.js";
import { storageConfigured } from "../wardrobe/photos.js";

export const DM_BUCKET = "dm";   // PRIVATE: every read is a short-lived signed URL
const envInt = (name, fallback) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback; };
export const DM_MEDIA_DEFAULTS = Object.freeze({
  uploadMaxBytes: envInt("DM_UPLOAD_MAX_BYTES", 10 * 1024 * 1024),
  decodeMaxPixels: envInt("DM_DECODE_MAX_PIXELS", 40_000_000),
  displayMaxEdge: envInt("DM_DISPLAY_MAX_EDGE", 1600),
  thumbEdge: envInt("DM_THUMB_EDGE", 320),
  webpQuality: envInt("DM_WEBP_QUALITY", 78),
  signedUrlSeconds: envInt("DM_SIGNED_URL_SECONDS", 300),
});
const STILL_FORMATS = new Set(["jpeg", "png", "webp", "heif", "tiff"]);
const PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(display|thumb)\.webp$/;

/** The one availability gate the route, the desk and the worker share. */
export function dmMediaAvailable() {
  if (!dmMediaEnabled()) return { available: false, reason: "DM media is not enabled on this deployment (OWNER-DECISIONS #3)" };
  if (!storageConfigured()) return { available: false, reason: "object storage is not configured" };
  return { available: true };
}

export class MediaRefused extends Error {
  constructor(code, message) { super(message); this.name = "MediaRefused"; this.code = code; }
}

/**
 * Inspect and re-encode one upload. Pure over its bytes: no storage, no
 * database. Returns { display, thumb, sha256, bytes, width, height, format }
 * where display/thumb are { buffer, width, height, bytes }.
 */
export async function processImage(input, opts = {}) {
  const o = { ...DM_MEDIA_DEFAULTS, ...opts };
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!bytes.length) throw new MediaRefused("empty", "nothing was uploaded");
  if (bytes.length > o.uploadMaxBytes) throw new MediaRefused("too-large", `an image is at most ${Math.round(o.uploadMaxBytes / 1024 / 1024)} MB`);
  const sharp = (await import("sharp")).default;
  // the header first, with the pixel limit set BEFORE any decode
  let meta;
  try { meta = await sharp(bytes, { limitInputPixels: o.decodeMaxPixels, animated: false }).metadata(); }
  catch (e) { throw new MediaRefused("unreadable", "that file is not an image this desk can read"); }
  if (!meta.format || !STILL_FORMATS.has(meta.format)) throw new MediaRefused("format", "only a still JPEG, PNG, WebP or HEIC can be sent");
  if (meta.pages && meta.pages > 1) throw new MediaRefused("animated", "animated images need a transcoder that does not exist yet");
  if (!meta.width || !meta.height) throw new MediaRefused("unreadable", "that file is not an image this desk can read");
  if (meta.width * meta.height > o.decodeMaxPixels) throw new MediaRefused("too-many-pixels", `an image is at most ${Math.round(o.decodeMaxPixels / 1e6)} megapixels`);

  const encode = async (edge) => {
    const out = await sharp(bytes, { limitInputPixels: o.decodeMaxPixels, animated: false })
      .rotate()                                            // orientation from EXIF, applied
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: o.webpQuality, effort: 4 })        // no withMetadata(): EXIF/GPS/ICC/XMP are gone
      .toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height, bytes: out.info.size };
  };
  const display = await encode(o.displayMaxEdge);
  const thumb = await encode(o.thumbEdge);
  return {
    display, thumb,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length, width: meta.width, height: meta.height, format: meta.format,
  };
}

// --- storage: the private bucket, service-role writes, signed reads --------

function env() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}
async function storageFetch(path, options = {}) {
  const e = env();
  if (!e) throw new Error("storage not configured");
  return fetch(`${e.url}/storage/v1${path}`, { ...options, cache: "no-store", headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, ...(options.headers || {}) } });
}

export function dmObjectPaths(conversationId, id = randomUUID()) {
  if (!/^[0-9a-f-]{36}$/.test(String(conversationId || ""))) throw new TypeError("invalid conversation id");
  return { display: `${conversationId}/${id}.display.webp`, thumb: `${conversationId}/${id}.thumb.webp` };
}
export function safeDmPath(path) {
  const p = String(path || "");
  if (!PATH_PATTERN.test(p)) throw new TypeError("invalid dm media path");
  return p;
}

/** Idempotent PRIVATE bucket (scripts/setup-dm-storage.mjs). */
export async function ensureDmBucket() {
  const settings = { public: false, file_size_limit: DM_MEDIA_DEFAULTS.uploadMaxBytes, allowed_mime_types: ["image/webp"] };
  const res = await storageFetch("/bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: DM_BUCKET, name: DM_BUCKET, ...settings }) });
  let created = res.ok;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status !== 409 && !/already exists/i.test(body.message || body.error || "")) throw new Error(`bucket creation failed (${res.status})`);
    created = false;
  }
  const update = await storageFetch(`/bucket/${DM_BUCKET}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
  if (!update.ok) throw new Error(`bucket hardening failed (${update.status})`);
  return { created, existed: !created };
}

/** Store the two encodings; returns their paths. */
export async function storeDmImages(conversationId, processed) {
  const paths = dmObjectPaths(conversationId);
  for (const [key, buf] of [["display", processed.display.buffer], ["thumb", processed.thumb.buffer]]) {
    const res = await storageFetch(`/object/${DM_BUCKET}/${paths[key]}`, { method: "POST", headers: { "Content-Type": "image/webp", "x-upsert": "false" }, body: buf });
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(`image store failed (${res.status}): ${(body.message || body.error || "").slice(0, 120)}`); }
  }
  return paths;
}

/**
 * A short-lived signed URL. AUTHORISATION IS THE CALLER'S JOB and is re-done
 * on every load (lib/db/dm/attachments.js signedAttachmentUrls): an old URL
 * expires in minutes and a new one is never minted past a block or a clear.
 */
export async function signDmPath(path, seconds = DM_MEDIA_DEFAULTS.signedUrlSeconds) {
  const safe = safeDmPath(path);
  const res = await storageFetch(`/object/sign/${DM_BUCKET}/${safe}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: seconds }) });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const e = env();
  return body.signedURL ? `${e.url}/storage/v1${body.signedURL}` : null;
}

export async function deleteDmPaths(paths) {
  for (const p of paths) {
    const res = await storageFetch(`/object/${DM_BUCKET}/${safeDmPath(p)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`delete failed (${res.status})`);
  }
  return true;
}
