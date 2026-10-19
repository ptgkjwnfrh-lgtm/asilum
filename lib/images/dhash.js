// lib/images/dhash.js — PERCEPTUAL HASHING, and nothing else.
//
// Split out of lib/images/fingerprint.js because that module reaches for
// `sharp` to decode a file, and sharp is a native binary that cannot be
// bundled for a browser. Even the DYNAMIC import inside dhashFromImage was
// enough for the bundler to trace it into the client build and fail.
//
// The maths here is pure arithmetic over bytes and runs identically on a
// server and in a canvas. That is the whole point: the SAME hash function has
// to run in both places, or a stamp read on a phone would never match a
// catalog image fingerprinted on a server.
//
// fingerprint.js re-exports everything below, so no server caller changed.

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

/** Bit distance between two 16-char dhash hex strings, or null if either is
 *  malformed. Null is "cannot compare", NOT "identical" — a caller treating it
 *  as 0 would report every unreadable pair as a collision. */

/** Bit distance between two 16-char dhash hex strings, or null if either is
 *  malformed. Null is "cannot compare", NOT "identical" — a caller treating it
 *  as 0 would report every unreadable pair as a collision. */
export function hammingHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== 16 || b.length !== 16) return null;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { bits += x & 1; x >>= 1; }
  }
  return bits;
}

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
