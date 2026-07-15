// tests/profile-rooms.test.js — MySpace-inspired profile rooms (Feature E),
// mem mode. Rooms are account-only (ADR-002); statements pass a
// deterministic sanitize + screen pipeline; derived modules read live
// signals; the public view serves only published + visible rooms.

import { test } from "node:test";
import assert from "node:assert/strict";

import { accountIdFromIdentity } from "../lib/identity.js";
import {
  profileRoomsEnabled, sanitizeStatement, screenStatement,
  validateHandle, validateAnthem, ownRoomView, publicRoomView,
  RESERVED_HANDLES, STATEMENT_MAX,
} from "../lib/profile/rooms.js";
import {
  upsertProfileRoom, setProfileModule, setProfileRoomModeration,
  getProfileRoom, listProfileThemes, purgePersonalizationData, setFollow,
} from "../lib/db/production.js";

const ACCOUNT = "0f9d2c4a-1111-4222-8333-abcdefabcdef";
const OTHER = "1e8c3b5d-4444-4555-9666-fedcbafedcba";

test("flag defaults on; 0 is the kill switch", () => {
  assert.equal(profileRoomsEnabled(), true);
  process.env.PROFILE_THEMES_ENABLED = "0";
  assert.equal(profileRoomsEnabled(), false);
  delete process.env.PROFILE_THEMES_ENABLED;
});

test("accountIdFromIdentity maps sb- to the auth uuid and nothing else", () => {
  assert.equal(accountIdFromIdentity("sb-" + ACCOUNT), ACCOUNT);
  assert.equal(accountIdFromIdentity("sb-" + ACCOUNT.toUpperCase()), ACCOUNT);
  assert.equal(accountIdFromIdentity("u-" + ACCOUNT), null, "device identities never map");
  assert.equal(accountIdFromIdentity("sb-not-a-uuid"), null);
  assert.equal(accountIdFromIdentity(""), null);
  assert.equal(accountIdFromIdentity(null), null);
});

test("sanitizeStatement strips control chars and markup, caps length", () => {
  assert.equal(sanitizeStatement("  hello \u0000\u0007 <b>world</b>  "), "hello bworld/b");
  assert.equal(sanitizeStatement("a\r\nb\n\n\n\nc"), "a\nb\n\nc");
  assert.throws(() => sanitizeStatement("x".repeat(STATEMENT_MAX + 1)), TypeError);
  assert.throws(() => sanitizeStatement(42), TypeError);
  assert.equal(sanitizeStatement(""), "");
});

test("screenStatement flags contact info and link spam, passes plain words", () => {
  assert.deepEqual(screenStatement("archival tailoring and nothing else"), []);
  assert.deepEqual(screenStatement("reach me at me@example.com"), ["contact-email"]);
  assert.deepEqual(screenStatement("call +1 (555) 123-4567 now"), ["contact-phone"]);
  assert.deepEqual(
    screenStatement("https://a.com https://b.com https://c.com"), ["link-heavy"]);
});

test("validateHandle enforces format and the reserved list", () => {
  assert.equal(validateHandle("  Noir-Fit9 "), "noir-fit9");
  assert.throws(() => validateHandle("ab"), TypeError);
  assert.throws(() => validateHandle("has space"), TypeError);
  assert.throws(() => validateHandle("@mockish"), TypeError);
  for (const reserved of ["asilum", "admin", "asterisk"]) {
    assert.ok(RESERVED_HANDLES.includes(reserved));
    assert.throws(() => validateHandle(reserved), TypeError);
  }
});

test("validateAnthem canonicalizes real music entities and refuses the rest", () => {
  const picks = validateAnthem(["david bowie", "DAVID BOWIE"]);
  assert.deepEqual(picks, ["david bowie"], "dedupes to the canonical name");
  assert.throws(() => validateAnthem(["not a real artist xyz"]), TypeError);
  assert.throws(() => validateAnthem(["david bowie", "deftones", "jazz", "city pop"]), TypeError);
  assert.throws(() => validateAnthem("david bowie"), TypeError);
});

test("room lifecycle: claim, theme, publish, public visibility rules", async () => {
  await upsertProfileRoom(ACCOUNT, { handle: validateHandle("test-room") });
  await assert.rejects(
    () => upsertProfileRoom(OTHER, { handle: "test-room" }),
    /handle-taken/, "handles are unique across accounts");

  const themes = await listProfileThemes();
  assert.ok(themes.length >= 5, "registry seeds five skins");
  await upsertProfileRoom(ACCOUNT, { themeId: "after-dark" });
  await assert.rejects(() => upsertProfileRoom(ACCOUNT, { themeId: "no-such-skin" }), TypeError);

  assert.equal(await publicRoomView("test-room"), null, "unpublished rooms are invisible");
  await upsertProfileRoom(ACCOUNT, { published: true });
  const pub = await publicRoomView("test-room");
  assert.equal(pub.handle, "test-room");
  assert.equal(pub.theme.id, "after-dark");

  await setProfileRoomModeration(ACCOUNT, "under_review");
  assert.equal(await publicRoomView("test-room"), null, "under_review rooms are invisible");
  await setProfileRoomModeration(ACCOUNT, "visible");
});

test("modules: stored content roundtrips, hidden modules stay off the public room", async () => {
  await setProfileModule(ACCOUNT, "statement", { content: { text: sanitizeStatement("archival everything") } });
  await setProfileModule(ACCOUNT, "soundtrack", { content: { entities: validateAnthem(["david bowie"]) } });
  await setProfileModule(ACCOUNT, "brands", { visible: false });
  await setFollow("sb-" + ACCOUNT, "brand", "Helmut Lang");

  const own = await ownRoomView(ACCOUNT);
  assert.equal(own.room.modules.length, 4, "owner sees every module, hidden included");
  assert.equal(own.room.modules.find((m) => m.module === "statement").content.text, "archival everything");

  const pub = await publicRoomView("test-room");
  const ids = pub.modules.map((m) => m.module);
  assert.ok(!ids.includes("brands"), "hidden module absent from the public room");
  assert.equal(pub.modules.find((m) => m.module === "soundtrack").content.entities[0].name, "david bowie");

  await assert.rejects(() => setProfileModule(ACCOUNT, "friends", {}), TypeError);
  await assert.rejects(() => setProfileModule(OTHER, "statement", { content: { text: "x" } }),
    /room-required/, "modules require the room row");
});

test("privacy purge erases the account's room and modules", async () => {
  assert.ok(await getProfileRoom(ACCOUNT));
  await purgePersonalizationData("sb-" + ACCOUNT);
  assert.equal(await getProfileRoom(ACCOUNT), null);
  assert.equal(await publicRoomView("test-room"), null);
});
