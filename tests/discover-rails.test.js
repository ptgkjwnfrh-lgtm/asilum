// tests/discover-rails.test.js — cultural Discover rails (Feature D), mem mode.
// Rails derive from reviewed sources at read time; rotation is deterministic
// by day; taste orders but never filters; prefs are the only writes and are
// covered by purge/adoption.

import { test } from "node:test";
import assert from "node:assert/strict";

import { discoverRails, dayIndex, railsEnabled, RAIL_KINDS } from "../lib/discover/rails.js";
import {
  listDiscoverRails, getRailPrefs, setRailPref, updateDiscoverRail,
  purgePersonalizationData, adoptAccountData, saveMemoryPreferences,
} from "../lib/db/production.js";

const U = "u-rails-test";
const DAY = new Date("2026-07-15T12:00:00Z");

test("flag defaults on; 0 is the kill switch", () => {
  assert.equal(railsEnabled(), true);
  process.env.DISCOVER_RAILS_ENABLED = "0";
  assert.equal(railsEnabled(), false);
  delete process.env.DISCOVER_RAILS_ENABLED;
});

test("registry seeds all four rail kinds in order", async () => {
  const rails = await listDiscoverRails();
  assert.deepEqual(rails.map((r) => r.kind), RAIL_KINDS);
  assert.ok(rails.every((r) => r.enabled && r.version >= 1));
});

test("rails assemble with real content and honest exploration basis", async () => {
  const result = await discoverRails(null, DAY);
  assert.equal(result.rails.length, 4);
  assert.equal(result.personalized, false);
  assert.equal(result.guidanceEnabled, false);
  const screen = result.rails.find((r) => r.id === "screen");
  assert.ok(screen.entities.length > 0 && screen.entities.length <= 6);
  assert.ok(screen.entities.every((e) => ["film", "tv"].includes(e.kind)));
  assert.ok(screen.entities.every((e) => e.pills.length > 0));
  const trend = result.rails.find((r) => r.id === "trend");
  assert.ok(trend.entities.every((e) => ["rising", "peaking"].includes(e.phase)));
  const exploration = result.rails.find((r) => r.id === "exploration");
  assert.match(exploration.basis, /no taste on file/);
});

test("rails honor the durable Asterisk guidance preference", async () => {
  const user = "u-rails-guidance";
  assert.equal((await discoverRails(user, DAY)).guidanceEnabled, true);
  await saveMemoryPreferences(user, { guidanceEnabled: false });
  const paused = await discoverRails(user, DAY);
  assert.equal(paused.guidanceEnabled, false);
  assert.equal(paused.personalized, false);
  assert.match(paused.rails.find((r) => r.id === "exploration").basis, /no taste on file/);
  await purgePersonalizationData(user);
});

test("rotation is deterministic within a day and moves across days", async () => {
  const a = await discoverRails(null, DAY);
  const b = await discoverRails(null, new Date(DAY.getTime() + 60_000));
  assert.deepEqual(
    a.rails.find((r) => r.id === "screen").entities.map((e) => e.name),
    b.rails.find((r) => r.id === "screen").entities.map((e) => e.name),
    "same day, same rail");
  const c = await discoverRails(null, new Date(DAY.getTime() + 86_400_000));
  assert.notDeepEqual(
    a.rails.find((r) => r.id === "soundtrack").entities.map((e) => e.name),
    c.rails.find((r) => r.id === "soundtrack").entities.map((e) => e.name),
    "next day rotates");
  assert.equal(dayIndex(DAY) + 1, dayIndex(new Date(DAY.getTime() + 86_400_000)));
});

test("consecutive days show disjoint picks when the pool holds two windows", async () => {
  const a = await discoverRails(null, DAY);
  const b = await discoverRails(null, new Date(DAY.getTime() + 86_400_000));
  const names = (result, id) => result.rails.find((r) => r.id === id).entities.map((e) => e.name);
  for (const id of ["screen", "trend"]) {
    const today = new Set(names(a, id));
    const overlap = names(b, id).filter((n) => today.has(n));
    assert.equal(overlap.length, 0, `${id} rail must not repeat yesterday's picks`);
  }
});

test("registry updates validate input and are persistent-only operator actions", async () => {
  await assert.rejects(() => updateDiscoverRail("BAD ID!", { enabled: false }), TypeError);
  await assert.rejects(() => updateDiscoverRail("screen", {}), TypeError);
  await assert.rejects(() => updateDiscoverRail("screen", { position: 5000 }), TypeError);
  await assert.rejects(() => updateDiscoverRail("screen", { title: "" }), TypeError);
  assert.equal(await updateDiscoverRail("screen", { enabled: false }), null,
    "mem mode refuses — the persistent registry is the only real one");
});

test("prefs: set, merge into rails, validate, purge, adopt (account wins)", async () => {
  await setRailPref(U, "screen", { collapsed: true });
  await setRailPref(U, "trend", { hidden: true });
  assert.equal((await getRailPrefs(U)).screen.collapsed, true);
  const result = await discoverRails(U, DAY);
  assert.equal(result.rails.find((r) => r.id === "screen").collapsed, true);
  assert.equal(result.rails.find((r) => r.id === "trend").hidden, true);
  assert.equal(await setRailPref(U, "no-such-rail", { collapsed: true }), null);
  await assert.rejects(() => setRailPref(U, "BAD ID!", { collapsed: true }), TypeError);

  const to = "sb-rails-adopt";
  await setRailPref(to, "screen", { collapsed: false });
  await adoptAccountData(U, to);
  const adopted = await getRailPrefs(to);
  assert.equal(adopted.screen.collapsed, false, "account-side pref wins");
  assert.equal(adopted.trend.hidden, true, "device pref fills the gap");
  assert.deepEqual(await getRailPrefs(U), {});
  await purgePersonalizationData(to);
  assert.deepEqual(await getRailPrefs(to), {});
});
