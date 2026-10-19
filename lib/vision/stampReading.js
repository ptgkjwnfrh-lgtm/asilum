// lib/vision/stampReading.js — READING A STAMP, on the device, before it is
// ever sent anywhere.
//
// ── THE DOCTRINE THIS FILE EXISTS TO SERVE ──────────────────────────────────
//
// Owner directive, 27 August 2026: *"i want it to feel like magic to a layman
// how this system can do this without me telling it to. this feeling should be
// followed in every complex system so it will be hard for competitors to
// follow."*
//
// So there is NO "search by image" button, and there never will be. A person
// stamps their passport with a picture because that is what a passport is for.
// If the archive already holds that picture, the passport simply knows — the
// way a border officer recognises a stamp without being asked to compare it to
// a book.
//
// WHY THE ABSENCE OF A BUTTON IS THE MOAT. A competitor can copy a control
// labelled "Reverse Image Search" in an afternoon; the label tells them what to
// build. They cannot copy a recognition that fires at the right moment with no
// control at all, because there is nothing in the interface to point at and
// nothing in the feature list to read. What they would have to reverse-engineer
// is the JUDGEMENT about when to speak — and that is the part that took work.
//
// See docs/INVISIBLE-MACHINERY.md for how this applies to every other system.
//
// ── WHAT ACTUALLY CROSSES THE WIRE ──────────────────────────────────────────
//
// The photograph does not leave the device. Ever.
//
// The stamp is decoded in a canvas, reduced to 72 grayscale pixels, and
// collapsed into a 16-character hash. That string is what gets sent. It cannot
// be turned back into the picture, it carries no faces, no room, no metadata —
// and it is enough to recognise the same photograph.
//
// That is not a side benefit dressed up as a principle. The board already
// decoded these pixels for palette analysis, so the hash costs one extra
// canvas pass and nothing else. Doing it any other way — uploading the image
// to be matched server-side — would be slower, more expensive, and would take
// a person's photograph for a feature that never needed it.

import { dhashFromGray } from "../images/dhash.js";

/** dhash wants a 9×8 grid: 8 rows of 9, compared left-to-right. */
const W = 9;
const H = 8;

/**
 * The perceptual hash of an image file, computed in the browser, or null.
 *
 * Null means "could not read it" and is a perfectly ordinary answer — a
 * caller must go quiet rather than guess. Never throws: a stamp that cannot be
 * read must not break the upload it arrived with.
 *
 * `createImageBitmap` handles EXIF orientation, so the same photograph saved
 * upright or sideways reduces to the same hash.
 */
export async function dhashFromFile(file) {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, W, H);
    if (bitmap.close) bitmap.close();
    const { data } = ctx.getImageData(0, 0, W, H);
    // RGBA → one luminance byte per pixel, the grid dhashFromGray expects.
    const grey = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      grey[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    }
    return dhashFromGray(grey, W, H);
  } catch {
    return null;
  }
}

/**
 * Hashes for a set of stamps, in order, with unreadable ones dropped.
 *
 * Returns `[]` rather than throwing when nothing can be read, because the
 * recognition is a quiet extra on top of an upload that must succeed either
 * way.
 */
export async function readStamps(files = []) {
  const out = [];
  for (const file of files) {
    const dhash = await dhashFromFile(file);
    if (dhash) out.push(dhash);
  }
  return out;
}
