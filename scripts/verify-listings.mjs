#!/usr/bin/env node
// scripts/verify-listings.mjs — run ASILUM's listing checks (V.2 brief §12)
// over listings whose current evidence version has no row yet, bounded.
//   npm run verify:listings -- --limit 200 --dry
// Reads .env.local for DATABASE_URL. With the model off the AI check is
// LOCAL RULES, so nothing here can mint a badge without a human: every
// passing listing lands PENDING for review.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const args = process.argv.slice(2);
const limit = Math.max(1, Math.min(1000, Number(args[args.indexOf("--limit") + 1]) || 100));
const dry = args.includes("--dry");
const { getDiscoverablePool } = await import("../lib/products.js");
const { latestVerifications } = await import("../lib/db/production/verification.js");
const { evidenceVersionOf, badgeFor } = await import("../lib/verification/ledger.js");
const { runChecks } = await import("../lib/verification/run.js");
const pool = (await getDiscoverablePool()).slice(0, limit);
const latest = await latestVerifications(pool.map((i) => i.id));
const report = { considered: pool.length, due: 0, ran: 0, byState: {}, dry };
for (const item of pool) {
  const cur = latest.get(item.id);
  if (cur && cur.evidenceVersion === evidenceVersionOf(item) && Date.parse(cur.expiresAt) > Date.now()) continue;
  report.due++;
  if (dry) continue;
  try {
    const rec = await runChecks(item);
    const state = badgeFor(rec, item).state;
    report.byState[state] = (report.byState[state] || 0) + 1;
    report.ran++;
  } catch (e) { report.error = String(e.message || e); break; }
}
console.log(JSON.stringify(report, null, 1));
