// tests/image-fingerprint.test.js — the stolen-image screen's primitives.
// dHash is deterministic arithmetic, not judgment: same photo → same bits,
// recompressed photo → near bits, different photo → far bits. The url
// fetcher refuses private hosts and non-images, and never throws.

import test from "node:test";
import assert from "node:assert/strict";

const { dhashFromGray, hammingHex, dhashFromImage, fingerprintImageUrl } =
  await import("../lib/images/fingerprint.js");

test("dhashFromGray: known ramp matrix produces the all-ones hash", () => {
  // Every pixel is brighter than its left neighbour → every bit 1.
  const ramp = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) ramp.push(x * 10);
  assert.equal(dhashFromGray(ramp), "ffffffffffffffff");
  // Reversed ramp → all zeros.
  const fall = ramp.map((v) => 90 - v);
  assert.equal(dhashFromGray(fall), "0000000000000000");
  assert.equal(dhashFromGray([1, 2, 3]), null);
});

test("hammingHex counts differing bits and refuses malformed input", () => {
  assert.equal(hammingHex("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(hammingHex("ffffffffffffffff", "0000000000000000"), 64);
  assert.equal(hammingHex("ffffffffffffffff", "fffffffffffffffe"), 1);
  assert.equal(hammingHex("short", "ffffffffffffffff"), null);
  assert.equal(hammingHex(null, "ffffffffffffffff"), null);
});

test("sharp round-trip: identical images collide at 0, unrelated ones land far", async () => {
  const { default: sharp } = await import("sharp");
  const gradient = await sharp(Buffer.from(
    `<svg width="120" height="120"><defs><linearGradient id="g"><stop offset="0" stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/></svg>`
  )).png().toBuffer();
  const checker = await sharp(Buffer.from(
    `<svg width="120" height="120"><rect width="120" height="120" fill="white"/><rect x="0" y="0" width="60" height="60" fill="black"/><rect x="60" y="60" width="60" height="60" fill="black"/></svg>`
  )).png().toBuffer();
  const a1 = await dhashFromImage(gradient);
  const a2 = await dhashFromImage(gradient);
  const b = await dhashFromImage(checker);
  assert.match(a1, /^[0-9a-f]{16}$/);
  assert.equal(hammingHex(a1, a2), 0, "same bytes, same hash");
  assert.ok(hammingHex(a1, b) > 10, `unrelated images must land far apart (got ${hammingHex(a1, b)})`);
  // A recompressed copy of the same picture stays within the flag threshold.
  const rejpg = await sharp(gradient).jpeg({ quality: 40 }).toBuffer();
  assert.ok(hammingHex(a1, await dhashFromImage(rejpg)) <= 6, "recompression survives the screen");
});

test("fingerprintImageUrl: loopback refused before fetch, non-image refused, throw becomes null", async () => {
  let fetched = 0;
  assert.equal(await fingerprintImageUrl("http://127.0.0.1/x.jpg", { fetchImpl: async () => { fetched++; } }), null);
  assert.equal(fetched, 0, "private hosts never reach fetch");
  assert.equal(await fingerprintImageUrl("https://cdn.example/x", {
    fetchImpl: async () => ({ ok: true, headers: { get: () => "text/html" }, arrayBuffer: async () => new ArrayBuffer(8) }),
  }), null);
  assert.equal(await fingerprintImageUrl("https://cdn.example/x.jpg", {
    fetchImpl: async () => { throw new Error("down"); },
  }), null);
});
