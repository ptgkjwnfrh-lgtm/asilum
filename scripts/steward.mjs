#!/usr/bin/env node
// scripts/steward.mjs — "is anything wrong?", answered in one command.
//
//   set -a; source .env.local; set +a
//   npm run steward            # the whole board
//   npm run steward -- --json  # the same report, machine-readable
//   npm run steward -- --only db.rls-coverage,catalog.integrity
//
// Keyed DB pool, PURE READS — no probes to clean. Exit 0 = nothing needs a
// person; 1 = a blocker; 2 = something is warn or could not be measured.
// A check that cannot run is never silent: it is reported as unmeasurable and
// still moves the exit code, because the alternative is a green board that
// means "the lights are off".

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPool } from "../lib/db/index.js";
import { runSteward, exitCodeFor, schemaVersionsFrom } from "../lib/steward/index.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const onlyArg = args.find((a) => a.startsWith("--only"));
const only = onlyArg
  ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : args[args.indexOf(onlyArg) + 1] || "").split(",").filter(Boolean)
  : null;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const schemaVersions = schemaVersionsFrom(readdirSync(ROOT + "supabase"));

const pool = await getPool();
const query = pool ? (sql, params) => pool.query(sql, params) : null;

const report = await runSteward(
  { query, schemaVersions, now: new Date().toISOString() },
  { only: only && only.length ? only : null },
);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const MARK = { blocker: "!!", warn: "!", note: "·", unmeasurable: "?", ok: "ok" };
  console.log("\nASTERISK STEWARD");
  console.log(pool ? "  reading the live database (read-only)\n" : "  NO DATABASE CONFIGURED — most checks cannot be measured\n");
  for (const f of report.findings) {
    console.log(`${MARK[f.state].padEnd(3)} ${f.id}  [${f.area}]`);
    console.log(`    ${f.evidence}`);
    if (f.action) console.log(`    → ${f.action}`);
  }
  const s = report.summary;
  console.log(`\n${s.blocker} blocker · ${s.warn} warn · ${s.note} note · ${s.unmeasurable} unmeasurable · ${s.ok} ok`);
  if (!report.attention.length) console.log("nothing on this board needs a person right now.\n");
  else console.log(`${report.attention.length} finding(s) want a person: ${report.attention.map((f) => f.id).join(", ")}\n`);
}

if (pool?.end) await pool.end();
process.exit(exitCodeFor(report));
