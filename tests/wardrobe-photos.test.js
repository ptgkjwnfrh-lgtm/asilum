// tests/wardrobe-photos.test.js — private-Storage photo layer (Phase 3b).
// Pure-logic coverage: gates, path scoping, JPEG validation, consent version,
// owner-scoped row updates, colors-only-when-empty. The HTTP storage calls
// are exercised in live E2E; here fetch is stubbed where needed.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  uploadsAvailable, photoObjectPath, looksLikeJpeg,
  PHOTO_CONSENT_VERSION, storageConfigured, deleteUserPhotos,
} from "../lib/wardrobe/photos.js";
import { addWardrobeItem } from "../lib/wardrobe/index.js";
import {
  setWardrobePhoto, setWardrobeColorsIfEmpty, purgePersonalizationData,
} from "../lib/db/production.js";

const U = "u-wardrobe-photo-test";

test("uploads gate: flag AND storage config both required", () => {
  delete process.env.WARDROBE_UPLOADS_ENABLED;
  assert.equal(uploadsAvailable().available, false);
  process.env.WARDROBE_UPLOADS_ENABLED = "1";
  const withFlag = uploadsAvailable();
  // whether storage is configured depends on the environment — the gate must
  // never report available without BOTH.
  assert.equal(withFlag.available, storageConfigured());
  delete process.env.WARDROBE_UPLOADS_ENABLED;
});

test("photo paths are strictly owner/item scoped", () => {
  assert.equal(photoObjectPath("u-abc", "42"), "u-abc/42.jpg");
  for (const [user, item] of [
    ["../escape", "1"], ["u-ok", "1; DROP"], ["u-ok", "not-a-number"],
    ["", "1"], ["u-ok", ""],
  ]) {
    assert.throws(() => photoObjectPath(user, item), TypeError, `${user}/${item}`);
  }
});

test("JPEG magic bytes are enforced", () => {
  assert.equal(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false, "PNG refused");
  assert.equal(looksLikeJpeg(new Uint8Array([])), false);
  assert.equal(looksLikeJpeg("string"), false);
});

test("consent version is pinned and dated", () => {
  assert.match(PHOTO_CONSENT_VERSION, /^wardrobe-photo-v\d+-\d{4}-\d{2}$/);
});

test("photo row updates are owner-scoped; colors fill only when empty", async () => {
  const r = await addWardrobeItem(U, { source: "manual", title: "canvas chore coat", category: "outerwear" });
  const id = r.item.id;
  assert.equal(await setWardrobePhoto("u-not-owner", id, "x/y.jpg", PHOTO_CONSENT_VERSION), null);
  const set = await setWardrobePhoto(U, id, `${U}/${id}.jpg`, PHOTO_CONSENT_VERSION);
  assert.equal(set.photoPath, `${U}/${id}.jpg`);
  const colored = await setWardrobeColorsIfEmpty(U, id, ["#1a1a1a", "#5a4632"]);
  assert.deepEqual(colored.colors, ["#1a1a1a", "#5a4632"]);
  assert.equal(await setWardrobeColorsIfEmpty(U, id, ["#ffffff"]), null, "existing colors never overridden");
  const cleared = await setWardrobePhoto(U, id, null, null);
  assert.equal(cleared.photoPath, null);
  await purgePersonalizationData(U);
});

test("deleteUserPhotos with storage unconfigured is a clean no-op", async () => {
  if (storageConfigured()) return; // covered live when configured
  assert.deepEqual(await deleteUserPhotos("u-nobody"), { deleted: 0 });
});
