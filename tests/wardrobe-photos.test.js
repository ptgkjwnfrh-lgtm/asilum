// tests/wardrobe-photos.test.js — private-Storage photo layer (Phase 3b).
// Pure-logic coverage: gates, path scoping, JPEG validation, consent version,
// owner-scoped row updates, colors-only-when-empty. The HTTP storage calls
// are exercised in live E2E; here fetch is stubbed where needed.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  uploadsAvailable, photoObjectPath, looksLikeJpeg,
  PHOTO_CONSENT_VERSION, storageConfigured, deleteUserPhotos, ensureWardrobeBucket,
} from "../lib/wardrobe/photos.js";
import { addWardrobeItem } from "../lib/wardrobe/index.js";
import {
  setWardrobePhoto, purgePersonalizationData,
  getWardrobeItem, deleteWardrobeItem, withUserOperationLock,
} from "../lib/db/production.js";
import { PHOTO_REQUEST_MAX_BYTES } from "../lib/wardrobe/photo-contract.js";
import { readMultipartRequest } from "../lib/security/multipart.js";

const U = "u-wardrobe-photo-test";
const VERSION = "11111111-1111-4111-8111-111111111111";

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
  assert.equal(photoObjectPath("u-abc", "42", VERSION), `u-abc/42-${VERSION}.jpg`);
  for (const [user, item, version] of [
    ["../escape", "1", VERSION], ["u-ok", "1; DROP", VERSION],
    ["u-ok", "not-a-number", VERSION], ["", "1", VERSION],
    ["u-ok", "", VERSION], ["u-ok", "1", "not-a-version"],
  ]) {
    assert.throws(() => photoObjectPath(user, item, version), TypeError, `${user}/${item}`);
  }
});

test("JPEG magic bytes are enforced", () => {
  assert.equal(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false, "PNG refused");
  assert.equal(looksLikeJpeg(new Uint8Array([])), false);
  assert.equal(looksLikeJpeg("string"), false);
});

test("multipart uploads are bounded before form parsing", async () => {
  const wrongType = await readMultipartRequest(new Request("http://local/upload", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }), { maxBytes: PHOTO_REQUEST_MAX_BYTES });
  assert.equal(wrongType.response.status, 415);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(PHOTO_REQUEST_MAX_BYTES + 1));
      controller.close();
    },
  });
  const oversized = await readMultipartRequest(new Request("http://local/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: stream,
    duplex: "half",
  }), { maxBytes: PHOTO_REQUEST_MAX_BYTES });
  assert.equal(oversized.response.status, 413);
});

test("consent version is pinned and dated", () => {
  assert.match(PHOTO_CONSENT_VERSION, /^wardrobe-photo-v\d+-\d{4}-\d{2}$/);
});

test("photo row updates are owner-scoped; colors fill only when empty", async () => {
  const r = await addWardrobeItem(U, { source: "manual", title: "canvas chore coat", category: "outerwear" });
  const id = r.item.id;
  assert.equal(await setWardrobePhoto("u-not-owner", id, "x/y.jpg", PHOTO_CONSENT_VERSION), null);
  const set = await setWardrobePhoto(U, id, `${U}/${id}.jpg`, PHOTO_CONSENT_VERSION, {
    colors: ["#1a1a1a", "#5a4632"],
  });
  assert.equal(set.photoPath, `${U}/${id}.jpg`);
  assert.deepEqual(set.colors, ["#1a1a1a", "#5a4632"]);
  const replaced = await setWardrobePhoto(U, id, `${U}/${id}-replacement.jpg`, PHOTO_CONSENT_VERSION, {
    colors: ["#ffffff"],
  });
  assert.deepEqual(replaced.colors, ["#1a1a1a", "#5a4632"], "existing colors never overridden");
  const cleared = await setWardrobePhoto(U, id, null, null);
  assert.equal(cleared.photoPath, null);
  await purgePersonalizationData(U);
});

test("photo compare-and-swap prevents stale updates and item deletion", async () => {
  const r = await addWardrobeItem(U, { source: "manual", title: "race-safe coat", category: "outerwear" });
  const id = r.item.id;
  const firstPath = photoObjectPath(U, id, VERSION);
  const first = await setWardrobePhoto(U, id, firstPath, PHOTO_CONSENT_VERSION, { expectedPhotoPath: null });
  assert.equal(first.photoPath, firstPath);
  assert.equal(await setWardrobePhoto(U, id, `${U}/${id}.jpg`, PHOTO_CONSENT_VERSION, {
    expectedPhotoPath: null,
  }), null, "a stale writer cannot replace the current version");
  assert.equal(await deleteWardrobeItem(U, id, { expectedPhotoPath: null }), false,
    "a stale item delete cannot orphan the current photo");
  assert.equal((await getWardrobeItem(U, id)).photoPath, firstPath);
  await purgePersonalizationData(U);
});

test("owner operation lock serializes photo and privacy mutations", async () => {
  let active = 0;
  let peak = 0;
  await Promise.all([1, 2, 3].map(() => withUserOperationLock(U, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
  })));
  assert.equal(peak, 1);
});

test("deleteUserPhotos with storage unconfigured is a clean no-op", async () => {
  if (storageConfigured()) return; // covered live when configured
  assert.deepEqual(await deleteUserPhotos("u-nobody"), { deleted: 0 });
});

test("production erasure fails closed when Storage cannot be verified", async () => {
  const prior = {
    nodeEnv: process.env.NODE_ENV,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NODE_ENV = "production";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(deleteUserPhotos("u-nobody"), /cannot be verified/);
  } finally {
    restoreEnv("NODE_ENV", prior.nodeEnv);
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", prior.url);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", prior.key);
  }
});

test("bucket setup repairs and verifies an existing bucket", async () => {
  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const priorFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    if (String(url).endsWith("/bucket") && options.method === "POST") {
      return Response.json({ message: "already exists" }, { status: 409 });
    }
    if (String(url).endsWith("/bucket/wardrobe") && options.method === "PUT") {
      return Response.json({ message: "updated" });
    }
    if (String(url).endsWith("/bucket/wardrobe") && options.method === "GET") {
      return Response.json({ public: false, file_size_limit: 2 * 1024 * 1024, allowed_mime_types: ["image/jpeg"] });
    }
    return Response.json({}, { status: 500 });
  };
  try {
    assert.deepEqual(await ensureWardrobeBucket(), { created: false, existed: true, verified: true });
    assert.deepEqual(calls.map((call) => call.method), ["POST", "PUT", "GET"]);
  } finally {
    globalThis.fetch = priorFetch;
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", priorUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", priorKey);
  }
});

test("privacy erasure drains every Storage page and verifies the prefix is empty", async () => {
  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const priorFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const pages = [
    Array.from({ length: 1000 }, (_, index) => ({ name: `${index + 1}-${VERSION}.jpg` })),
    [{ name: `1001-${VERSION}.jpg` }],
    [],
  ];
  let deleteCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/object/list/")) return Response.json(pages.shift());
    if (options.method === "DELETE") { deleteCalls++; return Response.json({}); }
    return Response.json({}, { status: 500 });
  };
  try {
    assert.deepEqual(await deleteUserPhotos("u-page-test"), { deleted: 1001 });
    assert.equal(deleteCalls, 2);
  } finally {
    globalThis.fetch = priorFetch;
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", priorUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", priorKey);
  }
});
