// lib/images/fingerprint.js
// Deterministic perceptual image fingerprints (dHash) for stolen-image
// screening — gap 3 of the anti-impersonation directive (18 Aug).
// SERVER-ONLY.
//
// NOT a model, NOT AI: resize to 9×8 grayscale (sharp — already the house
// image codec, lib/ingest/colorEvidence.js), compare each pixel to its
// right neighbour → 64 bits → 16 hex chars. Two files of the same photo
// land within a few bits of each other even across recompression/resizing;
// unrelated photos land far apart. The screen FLAGS collisions for a human
// — it never adjudicates (Feature G's law, same as everywhere else).

import { safeExternalUrl } from "../url.js";

const FETCH_CAP_BYTES = 5 * 1024 * 1024;
export const DHASH_HAMMING_THRESHOLD = 6; // ≤ this = "same photo" flag

// data: (w)×(h) grayscale bytes, row-major, one byte per pixel, w = 9, h = 8.
export function dhashFromGray(data, w = 9, h = 8) {
  if (!data || data.length < w * h) return null;
  let bits = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits += data[y * w + x] < data[y * w + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== 16 || b.length !== 16) return null;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { bits += x & 1; x >>= 1; }
  }
  return bits;
}

export async function dhashFromImage(bytes) {
  const { default: sharp } = await import("sharp");
  const { data } = await sharp(bytes, { animated: false, limitInputPixels: 20_000_000 })
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return dhashFromGray(data, 9, 8);
}

// Public-hostname-guarded, size-capped, content-type-checked. Any failure
// returns null — an unfingerprintable image is reported, never fatal.
export async function fingerprintImageUrl(url, { fetchImpl = fetch } = {}) {
  const safe = safeExternalUrl(String(url || ""));
  if (!safe) return null;
  try {
    const res = await fetchImpl(safe, { redirect: "follow", headers: { "User-Agent": "asilum-imgscreen/1" } });
    if (!res.ok) return null;
    const type = String(res.headers && res.headers.get ? res.headers.get("content-type") || "" : "");
    if (type && !type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > FETCH_CAP_BYTES) return null;
    return await dhashFromImage(buf);
  } catch {
    return null;
  }
}
