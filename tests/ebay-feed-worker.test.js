// tests/ebay-feed-worker.test.js — the worker loop (owner brief §15 point 4):
// the plan is pure and bounded; a tick walks it through fakes, saves state
// after every file, records 204s as empty and a failure as the thing to
// retry; the stager's 204 is not a failure.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  planTick, runTick, emptyState, readState, writeState, hourKey,
  BOOTSTRAP_MAX_AGE_DAYS, MAX_SNAPSHOTS_PER_TICK, MAX_DAILIES_PER_TICK, STATE_FILE,
} from "../lib/ingest/ebayFeedWorker.js";
import { stageEbayFeed, FEED_SCOPE } from "../lib/ingest/ebayFeed.js";

const NOW = Date.parse("2026-10-15T12:30:00Z");
const base = () => emptyState({ categoryId: "11450" });

test("a fresh state plans the bootstrap and nothing else", () => {
  const plan = planTick(base(), NOW);
  assert.equal(plan.bootstrap, true);
  assert.deepEqual(plan.dailies, []); assert.deepEqual(plan.snapshots, []);
  assert.match(plan.reasons.bootstrap, /no bootstrap/);
});

test("a stale bootstrap is refreshed; a fresh one plans dailies in the window and snapshots up to two hours ago, bounded", () => {
  const old = { ...base(), bootstrap: { observedAt: "2026-10-01T04:00:00.000Z" } };
  assert.equal(planTick(old, NOW).bootstrap, true);
  assert.match(planTick(old, NOW).reasons.bootstrap, new RegExp(`limit ${BOOTSTRAP_MAX_AGE_DAYS}`));
  const fresh = { ...base(), bootstrap: { observedAt: "2026-10-09T04:00:00.000Z" }, dailies: { "2026-10-10": { sha256: "x" } } };
  const plan = planTick(fresh, NOW);
  assert.equal(plan.bootstrap, false);
  assert.deepEqual(plan.dailies, ["2026-10-11", "2026-10-12"], "10 is applied, 13–15 are not served yet");
  assert.deepEqual(plan.gaps, []);
  assert.equal(plan.snapshots.length, MAX_SNAPSHOTS_PER_TICK);
  assert.equal(plan.snapshots[0], "2026-10-09T05", "the hour after the bootstrap's observation");
  const caught = { ...fresh, snapshots: { lastHour: "2026-10-15T07", applied: 1, empty: 0 } };
  assert.deepEqual(planTick(caught, NOW).snapshots, ["2026-10-15T08", "2026-10-15T09", "2026-10-15T10"], "ready = floor(now − 2 h)");
  // never older than retention
  const ancient = { ...base(), bootstrap: { observedAt: "2026-10-09T04:00:00.000Z" }, snapshots: { lastHour: "2026-10-01T00", applied: 0, empty: 0 } };
  assert.equal(planTick(ancient, NOW).snapshots[0], "2026-10-09T05");
  assert.equal(hourKey(Date.parse("2026-10-15T09:59:59Z")), "2026-10-15T09");
});

test("daily dates that fell out of the window are gaps, once, and at most MAX_DAILIES_PER_TICK dailies run per tick", () => {
  const s = { ...base(), bootstrap: { observedAt: "2026-09-26T04:00:00.000Z" } };
  // bootstrap 19 days old → refresh wins; pin the age limit off to read the gap logic
  const plan = planTick(s, Date.parse("2026-10-02T12:00:00Z"));
  assert.equal(plan.bootstrap, false);
  assert.deepEqual(plan.dailies, ["2026-09-27", "2026-09-28", "2026-09-29"]);
  const s2 = { ...base(), bootstrap: { observedAt: "2026-10-09T04:00:00.000Z" }, gaps: [] };
  const p2 = planTick({ ...s2, bootstrap: { observedAt: "2026-10-09T04:00:00.000Z" } }, NOW);
  assert.ok(p2.dailies.length <= MAX_DAILIES_PER_TICK);
  const s3 = { ...base(), bootstrap: { observedAt: "2026-10-10T04:00:00.000Z" }, gaps: ["2026-10-11"] };
  // 2026-10-11 is only 4 days old at NOW — fetchable, not a gap; a recorded gap is not repeated
  assert.deepEqual(planTick(s3, NOW).gaps, []);
});

test("a tick walks the plan through the stager and the publisher, saving after every file; 204 is empty; a failure stops and is recorded", async () => {
  const calls = [], saves = [];
  const stage = async (o) => {
    calls.push(o);
    if (o.feedScope === "ALL_ACTIVE") return { directory: "/d/boot", sha256: "a".repeat(64), lastModified: "2026-10-09T04:00:00.000Z" };
    if (o.feedScope === "NEWLY_LISTED" && o.date === "2026-10-11") return { status: "empty" };
    if (o.feedScope === "NEWLY_LISTED") return { directory: "/d/" + o.date, sha256: "b".repeat(64) };
    if (o.snapshotHour === "2026-10-09T06") return { status: "empty" };
    if (o.snapshotHour === "2026-10-09T08") throw new Error("eBay Feed HTTP 500; check entitlement, date or quota");
    return { directory: "/d/" + o.snapshotHour, sha256: "c".repeat(64) };
  };
  const publish = async ({ directory }) => ({ rowsUpserted: directory.endsWith("boot") ? 1000 : 3, rowsStale: 0 });
  const save = async (s) => { saves.push(JSON.stringify(s)); };
  const state = base();
  // tick 1: the bootstrap, then stop (dailies/snapshots plan against it next tick)
  const t1 = await runTick(state, { stage, publish, save, now: NOW, outputDir: "/d" });
  assert.deepEqual(t1.done.map((d) => d.kind), ["bootstrap"]);
  assert.equal(state.bootstrap.observedAt, "2026-10-09T04:00:00.000Z");
  assert.equal(calls.length, 1); assert.equal(calls[0].outputDir, "/d");
  // tick 2: dailies 11 (empty) and 12, then snapshots 05, 06 (empty), 07, then 08 fails
  await assert.rejects(runTick(state, { stage, publish, save, now: NOW, outputDir: "/d" }), /HTTP 500/);
  assert.deepEqual(state.dailies["2026-10-11"].empty, true);
  assert.equal(state.dailies["2026-10-12"].rowsUpserted, 3);
  assert.equal(state.snapshots.lastHour, "2026-10-09T07");
  assert.equal(state.snapshots.applied, 2); assert.equal(state.snapshots.empty, 1);
  assert.match(state.lastError.message, /HTTP 500/);
  assert.ok(saves.length >= 6, "state saved after every file, not once at the end");
  // tick 3 retries the failed hour first
  const stage3 = async (o) => (o.feedScope === "SNAPSHOT" ? { directory: "/d/" + o.snapshotHour, sha256: "c".repeat(64) } : { status: "empty" });
  const t3 = await runTick(state, { stage: stage3, publish, save, now: NOW, outputDir: "/d" });
  assert.equal(t3.plan.snapshots[0], "2026-10-09T08");
  assert.equal(state.lastError, null);
  // dry: plan only
  const dry = await runTick(base(), { stage: () => assert.fail("no staging on --dry"), publish, save, now: NOW, dryRun: true });
  assert.equal(dry.plan.bootstrap, true); assert.deepEqual(dry.done, []);
});

test("the state file is written atomically and refuses another category's file", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asilum-feed-worker-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const s = await readState(dir, { categoryId: "11450", marketplace: "EBAY_US" });
  assert.equal(s.bootstrap, null);
  s.bootstrap = { observedAt: "2026-10-09T04:00:00.000Z" };
  await writeState(dir, s);
  assert.deepEqual((await readdir(dir)).sort(), [STATE_FILE]);
  const again = await readState(dir, { categoryId: "11450", marketplace: "EBAY_US" });
  assert.equal(again.bootstrap.observedAt, "2026-10-09T04:00:00.000Z");
  await assert.rejects(readState(dir, { categoryId: "625", marketplace: "EBAY_US" }), /not 625/);
  assert.equal(JSON.parse(await readFile(join(dir, STATE_FILE), "utf8")).version, 1);
});

test("the stager returns `empty` on 204 and leaves nothing behind", async (t) => {
  const before = Object.fromEntries(["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_ENV", "EBAY_PARTNERSHIP_APPROVED", "EBAY_FEED_APPROVED"].map((k) => [k, process.env[k]]));
  Object.assign(process.env, { EBAY_CLIENT_ID: "x", EBAY_CLIENT_SECRET: "y", EBAY_ENV: "PRODUCTION", EBAY_PARTNERSHIP_APPROVED: "1", EBAY_FEED_APPROVED: "1" });
  const root = await mkdtemp(join(tmpdir(), "asilum-feed-204-"));
  t.after(async () => { for (const [k, v] of Object.entries(before)) v === undefined ? delete process.env[k] : process.env[k] = v; await rm(root, { recursive: true, force: true }); });
  const res = await stageEbayFeed({ categoryId: "11450", feedScope: "SNAPSHOT", snapshotHour: "2026-10-15T09", now: NOW, outputDir: root }, {
    tokenProvider: async ({ scope }) => { assert.equal(scope, FEED_SCOPE); return "t"; },
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(res.status, "empty"); assert.equal(res.snapshotHour, "2026-10-15T09");
  assert.deepEqual(await readdir(root), []);
  // a non-empty snapshot still stages normally
  const gz = gzipSync("itemId\ttitle\n1\tx\n");
  const ok = await stageEbayFeed({ categoryId: "11450", feedScope: "SNAPSHOT", snapshotHour: "2026-10-15T09", now: NOW, outputDir: root }, {
    tokenProvider: async () => "t",
    fetchImpl: async () => new Response(gz, { status: 200, headers: { "content-length": String(gz.length), etag: '"s1"' } }),
  });
  assert.equal(ok.status, "staged_not_published"); assert.equal(ok.snapshotHour, "2026-10-15T09");
});
