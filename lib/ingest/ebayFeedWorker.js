// lib/ingest/ebayFeedWorker.js — THE WORKER LOOP (owner brief §15 point 4,
// 1 Oct 2026): the bootstrap, then daily catch-up, then hourly snapshots,
// planned from a durable state file and run one tick at a time. SERVER-ONLY.
//
// The planner is pure (planTick): given the state and the clock it says
// exactly which files are due and why, so a test can read the plan without
// a network and an operator can read it with --dry. The runner (runTick)
// walks the plan through injectable `stage` and `publish` — in production
// the stager (lib/ingest/ebayFeed.js) and the publisher
// (lib/ingest/ebayFeedPublish.js); in tests, fakes — and writes the state
// back after every file, so a tick killed halfway loses nothing but the
// file it was on.
//
// What the feed offers, from the spec (buy_feed_v1_beta_oas3.json):
//   bootstrap   ALL_ACTIVE, weekly; its generation time is Last-Modified.
//   daily       NEWLY_LISTED for one date, 14 files kept, each available
//               3–14 days after its date (48–72 h latency).
//   snapshot    one file per GMT hour of changes, generated two hours
//               later, 7 days kept; 204 = nothing changed that hour.
//
// The laws: a bootstrap older than BOOTSTRAP_MAX_AGE_DAYS is refreshed; a
// daily file is applied once, in date order; a daily date that fell out of
// the 14-day window before it was applied is a GAP the state records and
// the steward reads — the next bootstrap closes it; snapshots run from the
// hour after the latest observation already applied, at most
// MAX_SNAPSHOTS_PER_TICK per tick so a tick is bounded; an hour that
// returns 204 is recorded as empty, not as a failure; a failure stops the
// tick (the next tick retries the same file — the publisher's checkpoint
// makes that idempotent) and is recorded with its message.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { catchUpPlan } from "./ebayFeedPublish.js";

export const BOOTSTRAP_MAX_AGE_DAYS = 7;
export const SNAPSHOT_RETENTION_DAYS = 7;
export const SNAPSHOT_LAG_HOURS = 2;
export const MAX_SNAPSHOTS_PER_TICK = 6;
export const MAX_DAILIES_PER_TICK = 4;
export const STATE_FILE = "ebay-feed-worker.json";

const HOUR = 3_600_000, DAY = 86_400_000;

export function emptyState({ categoryId, marketplace = "EBAY_US" }) {
  return {
    version: 1, categoryId: String(categoryId), marketplace,
    bootstrap: null,          // { observedAt, sha256, directory, publishedAt }
    dailies: {},              // date -> { sha256, publishedAt, rowsUpserted } | { empty: true }
    gaps: [],                 // dates lost to the window before they were applied
    snapshots: { lastHour: null, applied: 0, empty: 0 },
    lastTickAt: null, lastError: null,
  };
}

/** The hour key ("YYYY-MM-DDTHH") of a timestamp, floored. */
export function hourKey(ms) { return new Date(Math.floor(ms / HOUR) * HOUR).toISOString().slice(0, 13); }

/**
 * What this tick should do, in order. Pure.
 *   { bootstrap: boolean, dailies: [dates], gaps: [dates], snapshots: [hourKeys], reasons: {...} }
 */
export function planTick(state, now = Date.now()) {
  const reasons = {};
  const observed = state.bootstrap ? Date.parse(state.bootstrap.observedAt) : NaN;
  let bootstrap = false;
  if (!state.bootstrap || !Number.isFinite(observed)) { bootstrap = true; reasons.bootstrap = "no bootstrap applied yet"; }
  else if (now - observed > BOOTSTRAP_MAX_AGE_DAYS * DAY) { bootstrap = true; reasons.bootstrap = `bootstrap is ${Math.floor((now - observed) / DAY)} days old (limit ${BOOTSTRAP_MAX_AGE_DAYS})`; }

  let dailies = [], gaps = [];
  if (!bootstrap) {
    const published = new Set(Object.keys(state.dailies || {}));
    const plan = catchUpPlan({ bootstrapObservedAt: state.bootstrap.observedAt, now, published });
    dailies = plan.fetchable.slice(0, MAX_DAILIES_PER_TICK);
    gaps = plan.expired.filter((d) => !(state.gaps || []).includes(d));
    if (dailies.length) reasons.dailies = `${plan.fetchable.length} daily file(s) fetchable, taking ${dailies.length}`;
    if (gaps.length) reasons.gaps = `${gaps.length} daily date(s) fell out of the 14-day window before they were applied`;
  }

  let snapshots = [];
  if (!bootstrap) {
    // from the hour after the latest thing applied, never older than retention
    const latest = Math.max(
      Number.isFinite(observed) ? observed : 0,
      state.snapshots && state.snapshots.lastHour ? Date.parse(state.snapshots.lastHour + ":00:00Z") : 0,
      now - SNAPSHOT_RETENTION_DAYS * DAY,
    );
    const firstHour = Math.floor(latest / HOUR) * HOUR + HOUR;
    const lastReady = Math.floor((now - SNAPSHOT_LAG_HOURS * HOUR) / HOUR) * HOUR;
    for (let h = firstHour; h <= lastReady && snapshots.length < MAX_SNAPSHOTS_PER_TICK; h += HOUR) snapshots.push(hourKey(h));
    if (snapshots.length) reasons.snapshots = `${snapshots.length} hourly snapshot(s) ready since ${hourKey(firstHour)}`;
  }
  return { bootstrap, dailies, gaps, snapshots, reasons };
}

// ---- state on durable storage -------------------------------------------------
export async function readState(outputDir, defaults) {
  const path = join(resolve(outputDir), STATE_FILE);
  try {
    const s = JSON.parse(await readFile(path, "utf8"));
    if (s && s.version === 1 && s.categoryId === String(defaults.categoryId) && s.marketplace === defaults.marketplace) return s;
    if (s && s.version === 1) throw new Error(`state file is for category ${s.categoryId} / ${s.marketplace}, not ${defaults.categoryId} / ${defaults.marketplace}`);
  } catch (e) { if (e.code !== "ENOENT" && !/Unexpected token|JSON/.test(String(e.message))) throw e; }
  return emptyState(defaults);
}

export async function writeState(outputDir, state) {
  const dir = resolve(outputDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, STATE_FILE + ".tmp");
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, join(dir, STATE_FILE));   // atomic: a killed write leaves the old state
  return state;
}

// ---- one tick -------------------------------------------------------------------
/**
 * Run one tick. `deps`: { stage(options) → manifest | { status: "empty" },
 * publish({ directory }) → report, save(state) → void, now, log }. Returns
 * { plan, done: [...], state }. Stops at the first failure and records it;
 * the next tick retries the same file.
 */
export async function runTick(state, deps) {
  const { stage, publish, save = async () => {}, now = Date.now(), log = () => {}, dryRun = false } = deps;
  const plan = planTick(state, now);
  const done = [];
  const base = { categoryId: state.categoryId, marketplace: state.marketplace, outputDir: deps.outputDir };
  state.lastTickAt = new Date(now).toISOString();
  if (dryRun) return { plan, done, state };
  try {
    if (plan.gaps.length) {
      state.gaps = [...(state.gaps || []), ...plan.gaps];
      log(`gap: ${plan.gaps.join(", ")} fell out of the daily window before being applied — the next bootstrap closes it`);
      await save(state);
    }
    if (plan.bootstrap) {
      log(`bootstrap: ${plan.reasons.bootstrap}`);
      const m = await stage({ ...base, feedScope: "ALL_ACTIVE" });
      const report = await publish({ directory: m.directory });
      state.bootstrap = { observedAt: m.lastModified, sha256: m.sha256, directory: m.directory, publishedAt: new Date(now).toISOString(), rowsUpserted: report.rowsUpserted };
      // a fresh bootstrap supersedes every daily and snapshot before it
      state.dailies = {}; state.gaps = []; state.snapshots = { lastHour: null, applied: 0, empty: 0 };
      done.push({ kind: "bootstrap", sha256: m.sha256, rowsUpserted: report.rowsUpserted, rowsStale: report.rowsStale });
      await save(state);
      return { plan, done, state };   // dailies and snapshots are planned against the new bootstrap next tick
    }
    for (const date of plan.dailies) {
      log(`daily: ${date}`);
      const m = await stage({ ...base, feedScope: "NEWLY_LISTED", date });
      if (m.status === "empty") { state.dailies[date] = { empty: true, at: new Date(now).toISOString() }; done.push({ kind: "daily", date, empty: true }); await save(state); continue; }
      const report = await publish({ directory: m.directory });
      state.dailies[date] = { sha256: m.sha256, publishedAt: new Date(now).toISOString(), rowsUpserted: report.rowsUpserted, rowsStale: report.rowsStale };
      done.push({ kind: "daily", date, rowsUpserted: report.rowsUpserted, rowsStale: report.rowsStale });
      await save(state);
    }
    for (const hour of plan.snapshots) {
      log(`snapshot: ${hour}`);
      const m = await stage({ ...base, feedScope: "SNAPSHOT", snapshotHour: hour });
      if (m.status === "empty") { state.snapshots.empty++; state.snapshots.lastHour = hour; done.push({ kind: "snapshot", hour, empty: true }); await save(state); continue; }
      const report = await publish({ directory: m.directory });
      state.snapshots.applied++; state.snapshots.lastHour = hour;
      done.push({ kind: "snapshot", hour, rowsUpserted: report.rowsUpserted, rowsStale: report.rowsStale });
      await save(state);
    }
    state.lastError = null;
    await save(state);
    return { plan, done, state };
  } catch (error) {
    state.lastError = { at: new Date(now).toISOString(), message: String(error && error.message || error).slice(0, 400) };
    await save(state).catch(() => {});
    throw error;
  }
}
