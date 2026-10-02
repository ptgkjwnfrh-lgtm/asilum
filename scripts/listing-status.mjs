#!/usr/bin/env node
// scripts/listing-status.mjs — one run of the ListingStatus service
// (lib/listing-status): re-check the listings people kept through the
// provider adapter, record sold/removed transitions, queue in-app notices.
//   npm run likes:status -- [--provider ebay] [--limit 200] [--dry]
// Cron it hourly on a host; the per-provider schedule and quota bound a run.
// Reads .env.local like the other operator scripts. --dry lists the pick.
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
try {
  const { values } = parseArgs({ options: { provider: { type: "string", default: "ebay" }, limit: { type: "string" }, dry: { type: "boolean" } } });
  const { recheckKeptItems, pickItemsToRecheck } = await import("../lib/listing-status/index.js");
  const limit = values.limit ? Math.max(1, parseInt(values.limit, 10) || 1) : undefined;
  if (values.dry) {
    const items = await pickItemsToRecheck({ provider: values.provider, limit });
    console.log(JSON.stringify({ provider: values.provider, due: items.map((i) => ({ id: i.id, title: i.title, status: i.availability_status, lastChecked: i.last_checked_at || i.last_synced_at || null })) }, null, 2));
  } else {
    const report = await recheckKeptItems({ provider: values.provider, limit, log: (m) => console.error(`[listing-status] ${m}`) });
    console.log(JSON.stringify(report, null, 2));
  }
  process.exit(0);
} catch (error) { console.error(error.message); process.exit(1); }
