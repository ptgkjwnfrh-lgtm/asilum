#!/usr/bin/env node
// scripts/sync-demo-sources.mjs — THE DEMO SWEEP (owner, 30 Oct 2026).
//
//   set -a; source .env.local; set +a
//   node scripts/sync-demo-sources.mjs            # dry: fetch every eBay lane, print counts, write nothing
//   node scripts/sync-demo-sources.mjs --write    # fold the sweep into the catalog (products, images, tags)
//   node scripts/sync-demo-sources.mjs --limit 40 # per lane (default 24, max 50)
//
// What it does. Runs the eBay adapter's demo sweep — one Browse search per
// lane of EBAY_DEMO_LANES (clothes, shoes, watches, jewelry, furniture, rugs,
// figurines, ornaments; lib/ingest/ebay.js) — through the one sync pipeline
// (lib/ingest/adapters/sync.js: the normalizer, colour evidence, upsert). It
// also prints the readiness of the three keyless-or-free seams the demo
// leans on, so one run says what the recording will show.
//
// --write touches whatever DATABASE_URL names. On the production database
// that is the live catalog: read .claude/skills/database-safety first, and
// prefer a memory-mode or staging run for a rehearsal.

import { ebayAdapter } from "../lib/ingest/adapters/ebayAdapter.js";
import { EBAY_DEMO_LANES } from "../lib/ingest/ebay.js";

const args = process.argv.slice(2);
const write = args.includes("--write");
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Math.max(1, Math.min(50, parseInt(args[limitAt + 1], 10) || 24)) : 24;

const on = (v) => (v ? "ON " : "off");
console.log("demo seams:");
console.log(`  eBay Browse          ${on(ebayAdapter.enabled().enabled)}  ${ebayAdapter.enabled().needs || "(" + (process.env.EBAY_ENV || "SANDBOX") + ")"}`);
console.log(`  iTunes Search        ${on(process.env.ITUNES_SEARCH_ENABLED === "1")}  ITUNES_SEARCH_ENABLED=1 — song previews on the SONG cards`);
console.log(`  Ticketmaster         ${on(!!process.env.TICKETMASTER_API_KEY)}  TICKETMASTER_API_KEY — live concerts on the map`);
console.log(`  Pexels Video         ${on(!!process.env.PEXELS_API_KEY)}  PEXELS_API_KEY — licensed motions in the row`);
console.log(`  database             ${process.env.DATABASE_URL ? "Postgres (DATABASE_URL set)" : "memory — a --write here lasts only this process"}`);
console.log("");

if (!ebayAdapter.enabled().enabled) {
  console.log("eBay is not ready; nothing to sweep. " + ebayAdapter.enabled().needs);
  process.exit(2);
}

console.log(`${write ? "SWEEPING AND WRITING" : "DRY SWEEP"} — ${EBAY_DEMO_LANES.length} lanes, up to ${limit} each`);
if (write) {
  const { syncProducts } = await import("../lib/ingest/adapters/sync.js");
  const runs = await syncProducts({ only: "ebay", limit });
  for (const run of runs) {
    console.log(`${run.sourceName}: ${run.status} — seen ${run.itemsSeen}, upserted ${run.itemsUpserted}${run.error ? " — " + run.error : ""}`);
    for (const lane of run.lanes || []) console.log(`  ${String(lane.items).padStart(3)}  ${lane.category.padEnd(12)} ${lane.query}${lane.error ? "  ✗ " + lane.error : ""}`);
  }
  process.exit(runs.some((r) => r.status === "failed") ? 1 : 0);
} else {
  const run = await ebayAdapter.syncProducts({ limit });
  for (const lane of run.lanes || []) console.log(`  ${String(lane.items).padStart(3)}  ${lane.category.padEnd(12)} ${lane.query}${lane.error ? "  ✗ " + lane.error : ""}`);
  const byCat = {};
  for (const p of run.products) byCat[p.category] = (byCat[p.category] || 0) + 1;
  console.log(`\n${run.products.length} distinct listings; by catalog category:`);
  for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`);
  const withImg = run.products.filter((p) => p.img || (p.images && p.images.length)).length;
  console.log(`${withImg} carry an image. Nothing was written; add --write to fold them into the catalog.`);
}
