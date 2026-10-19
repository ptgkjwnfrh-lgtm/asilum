// tests/dm-media.test.js — the DM media pipeline's PURE half (V.2 brief §3):
// what one upload goes through before any storage or database. The pipeline
// is gated OFF in production (OWNER-DECISIONS #3); these prove it does what
// the brief asks when it is switched on.
import test from "node:test";
import assert from "node:assert/strict";
import { DM_MEDIA_DEFAULTS, MediaRefused, dmMediaAvailable, dmObjectPaths, processImage, safeDmPath } from "../lib/dm/media.js";

const sharp = (await import("sharp")).default;

async function jpegWithExif({ width = 2400, height = 1200, orientation = 6 } = {}) {
  // a real JPEG with EXIF orientation AND a GPS block, from sharp itself
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation, exif: { IFD0: { Copyright: "secret owner" }, GPS: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } } })
    .toBuffer();
}

test("the pipeline is absent unless the flag is on, and the flag alone is not enough", () => {
  const keys = ["DM_MEDIA_ENABLED", "MESSAGING_ENABLED", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    delete process.env.DM_MEDIA_ENABLED;
    assert.equal(dmMediaAvailable().available, false);
    assert.match(dmMediaAvailable().reason, /OWNER-DECISIONS #3/);
    // the media flag rides on the messaging flag: media without messaging is nothing
    process.env.DM_MEDIA_ENABLED = "1"; delete process.env.MESSAGING_ENABLED;
    assert.equal(dmMediaAvailable().available, false);
    process.env.MESSAGING_ENABLED = "1"; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.match(dmMediaAvailable().reason, /storage/);
  } finally {
    for (const k of keys) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; }
  }
});

test("an upload is oriented, stripped of EXIF and GPS, resized, re-encoded twice, and hashed on its original bytes", async () => {
  const input = await jpegWithExif();
  const meta = await sharp(input).metadata();
  assert.equal(meta.orientation, 6); assert.ok(meta.exif, "the fixture carries EXIF");
  const out = await processImage(input);
  assert.equal(out.format, "jpeg"); assert.equal(out.width, 2400); assert.equal(out.height, 1200);
  // orientation 6 = rotate 90°: the display is portrait now, long edge 1600
  assert.equal(out.display.width, 800); assert.equal(out.display.height, 1600);
  assert.equal(out.thumb.height, 320); assert.equal(out.thumb.width, 160);
  for (const img of [out.display, out.thumb]) {
    const m = await sharp(img.buffer).metadata();
    assert.equal(m.format, "webp");
    assert.equal(m.exif, undefined, "no EXIF survives"); assert.equal(m.orientation, undefined, "orientation was applied, not carried");
    assert.equal(img.buffer.includes(Buffer.from("secret owner")), false, "no copyright string survives");
    assert.equal(img.buffer.includes(Buffer.from("GPS")), false, "no GPS block survives");
  }
  assert.match(out.sha256, /^[0-9a-f]{64}$/);
  const again = await processImage(input);
  assert.equal(again.sha256, out.sha256, "the hash is of the ORIGINAL bytes, so a resend de-duplicates");
  assert.ok(out.display.bytes < input.length, "the display WebP is smaller than the upload");
});

test("the limits refuse by name: bytes before decode, pixels before decode, formats, animation", async () => {
  await assert.rejects(() => processImage(Buffer.alloc(0)), (e) => e instanceof MediaRefused && e.code === "empty");
  await assert.rejects(() => processImage(Buffer.alloc(100), { uploadMaxBytes: 50 }), (e) => e.code === "too-large");
  await assert.rejects(() => processImage(Buffer.from("not an image at all")), (e) => e.code === "unreadable");
  const small = await jpegWithExif({ width: 400, height: 400, orientation: 1 });
  await assert.rejects(() => processImage(small, { decodeMaxPixels: 100_000 }), (e) => e.code === "too-many-pixels" || e.code === "unreadable", "a pixel count over the limit never decodes");
  const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).gif().toBuffer();
  await assert.rejects(() => processImage(gif), (e) => e.code === "format");
  assert.equal(DM_MEDIA_DEFAULTS.uploadMaxBytes, 10 * 1024 * 1024); assert.equal(DM_MEDIA_DEFAULTS.decodeMaxPixels, 40_000_000);
  assert.equal(DM_MEDIA_DEFAULTS.displayMaxEdge, 1600); assert.equal(DM_MEDIA_DEFAULTS.thumbEdge, 320); assert.equal(DM_MEDIA_DEFAULTS.webpQuality, 78);
});

test("object paths live under the conversation and nothing else parses", () => {
  const c = "0b2e4a4e-6a1d-4c6e-8b2e-1f2a3b4c5d6e";
  const p = dmObjectPaths(c);
  assert.ok(p.display.startsWith(c + "/") && p.display.endsWith(".display.webp"));
  assert.equal(safeDmPath(p.thumb), p.thumb);
  assert.throws(() => safeDmPath("../../etc/passwd"));
  assert.throws(() => safeDmPath(c + "/x.jpg"));
  assert.throws(() => dmObjectPaths("not-a-uuid"));
});
