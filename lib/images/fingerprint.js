// lib/images/fingerprint.js
// Deterministic perceptual image fingerprints (dHash) for stolen-image
// screening — gap 3 of the anti-impersonation directive (18 Aug).
// SERVER-ONLY — because of `sharp`, and only because of that. The pure hash
// maths lives in ./dhash.js so the SAME function can run in a browser canvas;
// a stamp read on a phone has to land on the same 16 characters as a catalog
// image fingerprinted here, or nothing would ever match.
//
// NOT a model, NOT AI: resize to 9×8 grayscale (sharp — already the house
// image codec, lib/ingest/colorEvidence.js), compare each pixel to its
// right neighbour → 64 bits → 16 hex chars. Two files of the same photo
// land within a few bits of each other even across recompression/resizing;
// unrelated photos land far apart. The screen FLAGS collisions for a human
// — it never adjudicates (Feature G's law, same as everywhere else).

import { safeExternalUrl } from "../url.js";

const FETCH_CAP_BYTES = 5 * 1024 * 1024;
export { DHASH_HAMMING_THRESHOLD, dhashFromGray, hammingHex } from "./dhash.js";
import { dhashFromGray } from "./dhash.js";

/**
 * Perceptual hash of an image — a 16-char hex dhash.
 *
 * Difference hash: resize to 9x8 grey and record whether each pixel is
 * brighter than its right neighbour. Survives rescaling and recompression,
 * which is the point — it catches the SAME photograph reused under a new
 * listing, not merely a byte-identical file.
 *
 * `.rotate()` applies EXIF orientation first, so the same photo saved upright
 * or sideways hashes alike. Input pixels are capped as a decompression-bomb
 * guard.
 */
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
