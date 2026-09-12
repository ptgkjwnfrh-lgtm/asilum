#!/usr/bin/env node
// scripts/ebay-ingest.mjs — THE CATALOG STOPS BEING SYNTHETIC.
//
// Until this ran, `items` held 915 rows and every one of them said
// `source = 'Asilum synthetic seed'`. First light (scripts/ebay-first-light.mjs)
// proved Asterisk could SEE real listings; it wrote nothing, by design. This is
// the other half: the same read, over a committed plan of queries, through the
// catalog gate, into the database behind DATABASE_URL.
//
//   npm run ebay:ingest                          # dry: read, gate, print, write NOTHING
//   npm run ebay:ingest -- --write               # into the database behind DATABASE_URL
//   npm run ebay:ingest -- --lane houses --limit 30
//   npm run ebay:ingest -- --query "helmut lang 1998" --query "rick owens sphinx"
//   npm run ebay:ingest -- --deep                # + identify each piece (≈$0.23 each)
//   npm run ebay:ingest -- --json run.json       # every admitted row, for inspection
//
// WHAT IT DOES NOT DO. It does not identify by default: the deterministic read
// (detail → seller's tags decoded → composed tag array) is free and is what
// fills a catalog; the model at $0.23 a listing is for the pieces that earn it.
// It does not touch the 915 seed rows. Every row it writes carries
// source_name='ebay', so one DELETE undoes the entire run.
//
// ⚖ THE STANDING QUESTION, unresolved and recorded in
// docs/epn-terms-check-2026-08-22.md: EPN's Network Agreement bars using eBay
// Data to improve a system that generates recommendations. Ingested listings
// take the same inferTags path as seed items, so a filled catalog teaches the
// brain. The owner has ruled to proceed (10 Sep: key the adapter; 12 Sep: "get
// real listings into items"). The ruling is the owner's; the record is here.
//
// Keys from .env.local (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_ENV +
// EBAY_PARTNERSHIP_APPROVED=1, DATABASE_URL for --write). `npm test` never
// loads that file (trap 71) and neither does plain node, so this reads it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : null; };
const opts = (k) => args.flatMap((a, i) => (a === "--" + k && args[i + 1] ? [args[i + 1]] : []));
const WRITE = args.includes("--write");
const DEEP = args.includes("--deep");
const NO_COLORS = args.includes("--no-colors");
const LIMIT = Math.max(1, Math.min(50, Number(opt("limit")) || 24));
const CONCURRENCY = Math.max(1, Math.min(6, Number(opt("concurrency")) || 3));
const LANE = opt("lane");
const AD_HOC = opts("query");
const JSON_OUT = opt("json");
const MAX_WRITE = Math.max(1, Math.min(5000, Number(opt("max")) || 1500));

// ---------------------------------------------------------------------------
// THE PLAN. Three lanes, because a catalog needs three different things: the
// houses the archive is about, the garments a wardrobe is made of, and the eras
// a person searches by. Houses come from the same register the ghosts run drew
// on — pieces Asterisk already has a reading for.
export const PLAN = [
  // ---- houses: the archive -------------------------------------------------
  ["houses", "rick owens archive"],
  ["houses", "undercover jun takahashi archive"],
  ["houses", "helmut lang 1998 archive"],
  ["houses", "raf simons archive"],
  ["houses", "maison margiela archive"],
  ["houses", "yohji yamamoto archive"],
  ["houses", "comme des garcons homme plus"],
  ["houses", "issey miyake pleats archive"],
  ["houses", "jean paul gaultier vintage"],
  ["houses", "dries van noten archive"],
  ["houses", "prada vintage 90s"],
  ["houses", "gianni versace vintage"],
  ["houses", "gucci tom ford era"],
  ["houses", "saint laurent paris hedi slimane"],
  ["houses", "dior homme hedi era"],
  ["houses", "number nine takahiro miyashita"],
  ["houses", "junya watanabe man"],
  ["houses", "vivienne westwood vintage"],
  ["houses", "stone island shadow project"],
  ["houses", "kapital japan"],
  ["houses", "the row archive"],
  ["houses", "lemaire"],
  ["houses", "carol christian poell"],
  ["houses", "walter van beirendonck"],
  // ---- garments: the wardrobe ---------------------------------------------
  ["garments", "vintage leather jacket 1970s"],
  ["garments", "military field jacket vintage"],
  ["garments", "wool trench coat vintage"],
  ["garments", "gore-tex shell jacket technical"],
  ["garments", "100% cashmere sweater crewneck"],
  ["garments", "pleated wool trousers vintage"],
  ["garments", "low rise bootcut jeans vintage"],
  ["garments", "leather loafers made in italy"],
  ["garments", "cuban heel leather boots vintage"],
  ["garments", "slouchy brown leather bag vintage"],
  // ---- eras: the way people look ------------------------------------------
  ["eras", "vintage 1970s maxi dress prairie"],
  ["eras", "vintage 1980s power blazer"],
  ["eras", "vintage 1990s minimalist slip dress"],
  ["eras", "y2k low rise archive"],
  ["eras", "vintage band tee 1970s single stitch"],
];

const QUERIES = AD_HOC.length
  ? AD_HOC.map((q) => ["ad-hoc", q])
  : LANE ? PLAN.filter(([lane]) => lane === LANE) : PLAN;

if (!QUERIES.length) {
  console.error(`no queries — lanes are ${[...new Set(PLAN.map(([l]) => l))].join(", ")}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
const { searchEbayRaw } = await import("../lib/ingest/ebay.js");
const { processListing, streamStatus } = await import("../lib/asterisk/stream/index.js");
const { summaryRefusal, catalogRefusal, eraWithEvidence } = await import("../lib/ingest/catalogGate.js");
const { getAdapter } = await import("../lib/ingest/adapters/index.js");
const ebayAdapter = getAdapter("ebay");
const { verifyProductColors } = await import("../lib/ingest/colorEvidence.js");

const gate = ebayAdapter.enabled();
if (!gate.enabled) {
  console.error(`eBay adapter is ${gate.status} — needs ${gate.needs}`);
  process.exit(1);
}
if (WRITE && !process.env.DATABASE_URL) {
  console.error("--write needs DATABASE_URL (the catalog this fills)");
  process.exit(1);
}

const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
console.log(`\n*ASILUM — eBay catalog ingest`);
console.log(`marketplace : ${env}${env === "SANDBOX" ? "  (sandbox listings are made up — set EBAY_ENV=PRODUCTION)" : ""}`);
console.log(`plan        : ${QUERIES.length} quer${QUERIES.length === 1 ? "y" : "ies"} x ${LIMIT} listings`);
console.log(`identify    : ${DEEP ? `ON — ${streamStatus().identify.model}` : "off (deterministic read only)"}`);
console.log(`mode        : ${WRITE ? "WRITE into DATABASE_URL" : "DRY RUN — nothing is written"}\n`);

/** Run `work` over `list` with bounded concurrency, in order. */
async function pool(list, width, work) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, list.length || 1)) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await work(list[i], i); }
  }));
  return out;
}

const refusals = new Map();
const refuse = (reason) => refusals.set(reason, (refusals.get(reason) || 0) + 1);
const admitted = new Map();   // id -> { product, result, query }
let seen = 0, detailsRead = 0, costUsd = 0, searchErrors = 0;

for (const [lane, q] of QUERIES) {
  let summaries = [];
  try {
    summaries = await searchEbayRaw(q, { limit: LIMIT });
  } catch (e) {
    searchErrors += 1;
    console.log(`  ${lane.padEnd(8)} ${q.padEnd(42)} SEARCH FAILED — ${String(e.message).slice(0, 80)}`);
    continue;
  }
  seen += summaries.length;
  // Stage one is free; only survivors cost a detail call.
  const worth = [];
  for (const s of summaries) {
    const reason = summaryRefusal(s);
    if (reason) refuse(reason); else worth.push(s);
  }
  const read = await pool(worth, CONCURRENCY, async (raw) => {
    try { return await processListing(raw, { deep: DEEP }); } catch (e) { return { error: String(e.message).slice(0, 120) }; }
  });
  let kept = 0;
  for (const r of read) {
    if (!r || r.error) { refuse("read-failed"); continue; }
    if (r.summary.detail === "read") detailsRead += 1;
    costUsd += r.summary.costUsd || 0;
    // The brand a seller never named. normalizeEbayItem falls back to the
    // first two words of the title, which on first light produced houses
    // called "Vintage Helmut" and "Size 14" — a guess wearing a fact's
    // clothes. Dropped here, so the normalizer writes "Unknown" instead.
    const base = r.product.brandSource === "title" ? { ...r.product, brand: null } : r.product;
    const dated = eraWithEvidence(base.era);   // no evidence, no era — see the gate
    const product = ebayAdapter.normalizeSourceProduct({
      ...base,
      // the search returned it, so it is on sale; the ticket flow re-checks
      // at purchase time (ebayAdapter.checkAvailability) rather than trusting
      // this timestamp forever
      availability_status: "available",
      is_available: true,
    });
    // normalizeSourceProduct re-derives an absent era from the title
    // (safeEra's fallback IS guessEra), so the assumption has to be removed
    // after the normalizer rather than withheld from it.
    if (!dated) { product.era = null; product.decade = null; }
    const reason = catalogRefusal(product);
    if (reason) { refuse(reason); continue; }
    if (!admitted.has(product.id)) { admitted.set(product.id, { product, result: r, query: q, lane }); kept += 1; }
    else refuse("duplicate-across-queries");
  }
  console.log(`  ${lane.padEnd(8)} ${q.padEnd(42)} ${String(summaries.length).padStart(3)} seen  ${String(worth.length).padStart(3)} read  ${String(kept).padStart(3)} admitted`);
}

const rows = [...admitted.values()].slice(0, MAX_WRITE);
console.log(`\n${seen} listings seen, ${detailsRead} details read, ${rows.length} admitted${rows.length < admitted.size ? ` (capped from ${admitted.size} by --max)` : ""}`);
if (searchErrors) console.log(`${searchErrors} quer${searchErrors === 1 ? "y" : "ies"} failed at the search step`);
if (DEEP) console.log(`identification cost: $${costUsd.toFixed(2)}`);

if (refusals.size) {
  console.log(`\nREFUSED (the interesting half — a reason that climbs is a hole to close):`);
  for (const [reason, n] of [...refusals].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }
}

// What the catalog is getting, in the shape a person would see it.
const brands = new Map();
const categories = new Map();
const decades = new Map();
let withSize = 0, withMeasurements = 0, withDescription = 0, untaggedish = 0, undated = 0;
for (const { product } of rows) {
  const key = (m, k) => m.set(k || "—", (m.get(k || "—") || 0) + 1);
  key(brands, product.brand);
  key(categories, product.category);
  key(decades, product.decade);
  if (product.size?.label) withSize += 1;
  if (product.size?.measurements && Object.keys(product.size.measurements).length) withMeasurements += 1;
  if (product.description) withDescription += 1;
  if (!product.decade) undated += 1;
  if (Object.keys(product.tags || {}).length < 3) untaggedish += 1;
}
const top = (m, n = 12) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`\nWHAT CAME IN`);
console.log(`  houses     : ${brands.size} distinct — ${top(brands)}`);
console.log(`  categories : ${top(categories)}`);
console.log(`  decades    : ${top(decades, 8)}  (${undated} undated — the listing gave no year, season code or decade)`);
console.log(`  a size label on ${withSize}/${rows.length}, listing measurements on ${withMeasurements}, a description on ${withDescription}`);
console.log(`  thin tag vectors (<3 keys): ${untaggedish}`);

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(rows.map((r) => ({ query: r.query, lane: r.lane, product: r.product, summary: r.result.summary })), null, 2));
  console.log(`\nwrote ${JSON_OUT}`);
}

if (!WRITE) {
  console.log(`\nDRY RUN — nothing was written. Re-run with --write to fill the catalog.\n`);
  process.exit(0);
}

// --- the write -------------------------------------------------------------
const { persistProducts } = await import("../lib/ingest/adapters/sync.js");
const { recordSyncLog } = await import("../lib/db/production.js");

const products = NO_COLORS
  ? rows.map((r) => r.product)
  : await verifyProductColors(rows.map((r) => r.product));
const verified = products.filter((p) => p.colorEvidence?.status === "verified").length;
if (!NO_COLORS) console.log(`\ncolour verified from the photographs on ${verified}/${products.length}`);

let upserted = 0;
try {
  upserted = await persistProducts(products, { sourceName: "ebay", results: rows.map((r) => r.result) });
  await recordSyncLog({ sourceName: "ebay", itemsSeen: seen, itemsUpserted: upserted, status: "ok" }).catch(() => {});
  console.log(`\nWROTE ${upserted} rows into items (source_name='ebay'), with their typed tags and images.`);
  console.log(`undo, if it ever needs undoing: DELETE FROM items WHERE source_name='ebay';\n`);
} catch (e) {
  await recordSyncLog({ sourceName: "ebay", itemsSeen: seen, itemsUpserted: 0, status: "failed", error: String(e.message).slice(0, 400) }).catch(() => {});
  console.error(`\nWRITE FAILED — ${e.message}\n`);
  process.exitCode = 1;
}

// The pool has no close door (lib/db/core/pool.js keeps one for the server's
// lifetime); a script exits instead of waiting on an idle connection.
process.exit(process.exitCode || 0);
