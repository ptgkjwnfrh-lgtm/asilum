#!/usr/bin/env node
// scripts/steward.mjs — "is anything wrong?", and since 3 Sep 2026, "fix it".
//
//   npm run steward                       read the board (no writes at all)
//   npm run steward -- --plan             ...and say what the hands would do
//   npm run steward -- --act              ...and do the DELEGATED repairs
//   npm run steward -- --act --confirm=commerce.reproject-order
//                                         ...and that confirm-tier one too
//   npm run steward -- --revert=<ledger id>
//   npm run steward -- --ledger[=N]       the last N repairs (default 20)
//   npm run steward -- --instruments      run the seven instruments, report movement
//   npm run steward -- --record           write a steward_runs row for a read
//   npm run steward -- --only=a,b --json --actor=<name>
//
// Exit codes (from lib/steward/index.js): 0 nothing needs a person · 1 a
// blocker · 2 something is warn or could not be measured. A failed repair or
// a failed instrument also exits 1 — the hands report in the same contract.
//
// In GitHub Actions (GITHUB_ACTIONS=true) the run records itself and runs the
// instruments without being asked: that schedule is the machine's nightly
// history, and a history nobody writes is a document. It never ACTS from
// there — the workflow's own permissions say contents: read, and the tier
// that acts on its own runs from the Vercel cron (app/api/steward/run).

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPool } from "../lib/db/index.js";
import {
  runSteward, actSteward, revertAction, readLedger, recordRun, lastInstrumentRun,
  exitCodeFor, schemaVersionsFrom, transactorFor,
} from "../lib/steward/index.js";
import { runInstruments, movement } from "../lib/steward/instruments.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return null;
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  const next = args[args.indexOf(a) + 1];
  return next && !next.startsWith("--") ? next : "";
};

const asJson = flag("json");
const only = value("only") ? value("only").split(",").filter(Boolean) : null;
const confirm = value("confirm") ? value("confirm").split(",").filter(Boolean) : [];
const inActions = process.env.GITHUB_ACTIONS === "true";
const wantInstruments = flag("instruments") || inActions;
const record = flag("record") || inActions;
const actor = value("actor") || (inActions ? "steward:actions" : "steward:cli");
const firedBy = inActions ? "actions" : "cli";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const schemaVersions = schemaVersionsFrom(readdirSync(ROOT + "supabase"));

const pool = await getPool();
const ctx = {
  query: pool ? (sql, params) => pool.query(sql, params) : null,
  transact: transactorFor(pool),
  schemaVersions,
  now: new Date().toISOString(),
};

const say = (...x) => { if (!asJson) console.log(...x); };
const done = async (code, json) => {
  if (asJson) console.log(JSON.stringify(json, null, 2));
  if (pool?.end) await pool.end();
  process.exit(code);
};

// A scheduled run with no database would report a board of `unmeasurable` and
// exit 2 every morning. That is the right answer and the wrong alarm — the
// workflow guards on a repository variable so it SKIPS instead, and this line
// makes the same point to whoever runs it by hand.
if (!pool) say("\n(no DATABASE_URL — every live check below is unmeasurable, which is not the same as healthy.)");

// ---- --ledger: read the record and leave -----------------------------------
if (value("ledger") !== null) {
  const rows = await readLedger(ctx, { limit: Number(value("ledger")) || 20 });
  say("\nSTEWARD LEDGER — newest first");
  if (!rows.length) say("  (empty — the hands have not acted, or there is no database)");
  for (const r of rows) {
    say(`  ${r.at instanceof Date ? r.at.toISOString() : r.at}  ${r.state.toUpperCase().padEnd(8)} ${r.actionId}  ×${r.count}  by ${r.actor}${r.reverted ? "  [reverted]" : ""}`);
    say(`    ${r.id}  ${r.evidence}`);
  }
  await done(0, { ledger: rows });
}

// ---- --revert: undo one applied action and leave ---------------------------
if (value("revert")) {
  const r = await revertAction(ctx, value("revert"), { actor });
  say(r.ok ? `\nreverted ${r.actionId} ×${r.count} — ledger row ${r.ledgerId}` : `\nnot reverted: ${r.why}`);
  await done(r.ok ? 0 : 1, r);
}

// ---- the board -------------------------------------------------------------
const MARK = { blocker: "!!", warn: "!", note: "·", unmeasurable: "?", ok: "ok" };
const printBoard = (report) => {
  say("\nASTERISK STEWARD");
  say(pool ? "  reading the live database\n" : "  NO DATABASE CONFIGURED — most checks cannot be measured\n");
  for (const f of report.findings) {
    say(`${MARK[f.state].padEnd(3)} ${f.id}  [${f.area}]`);
    say(`    ${f.evidence}`);
    if (f.action) say(`    → ${f.action}`);
  }
  const s = report.summary;
  say(`\n${s.blocker} blocker · ${s.warn} warn · ${s.note} note · ${s.unmeasurable} unmeasurable · ${s.ok} ok`);
  if (!report.attention.length) say("nothing on this board needs a person right now.");
  else say(`${report.attention.length} finding(s) want a person: ${report.attention.map((f) => f.id).join(", ")}`);
};

// ---- the instruments (before any row is written, so the row can carry them)
let instruments = null;
let moved = [];
if (wantInstruments) {
  say("\nrunning the seven instruments…");
  const before = await lastInstrumentRun(ctx);
  instruments = await runInstruments({ root: ROOT });
  moved = movement(before, instruments);
  for (const r of instruments.results) say(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(24)} ${(r.ms / 1000).toFixed(1)}s  ${r.last}`);
  say(`  ${instruments.pass} pass · ${instruments.fail} fail · ${(instruments.ms / 1000).toFixed(1)}s`);
  say(moved.length ? `  movement since ${before ? new Date(before.ranAt).toISOString() : "—"}:\n    ${moved.join("\n    ")}` : "  no movement since the last recorded run");
}

// ---- act, plan, or read ----------------------------------------------------
let code;
let json;
if (flag("act") || flag("plan")) {
  const out = await actSteward(ctx, { only, confirm, dryRun: flag("plan") && !flag("act"), actor, firedBy, instruments });
  printBoard(out.report);
  say(`\nHANDS — ${out.hands}`);
  for (const p of out.plans) {
    const act = out.acts.find((a) => a.actionId === p.actionId);
    const verdict = act ? act.state.toUpperCase() : "WOULD";
    say(`  ${verdict.padEnd(22)} ${p.actionId}  ×${p.count}  [${p.tier}]`);
    say(`    ${p.evidence}`);
    if (act?.why) say(`    ${act.why}`);
    if (act?.ledgerId) say(`    ledger ${act.ledgerId}`);
  }
  const failed = out.acts.some((a) => a.state === "failed");
  code = failed ? 1 : exitCodeFor(out.report);
  json = { ...out, instruments, movement: moved };
} else {
  const report = await runSteward(ctx, { only });
  printBoard(report);
  let runId = null;
  if (record) {
    runId = await recordRun(ctx, report, { actor, firedBy, instruments });
    say(runId ? `\nrecorded as run ${runId}` : "\n(not recorded — no database)");
  }
  code = exitCodeFor(report);
  json = { ...report, runId, instruments, movement: moved };
}
if (instruments?.fail) code = 1;
say("");
await done(code, json);
