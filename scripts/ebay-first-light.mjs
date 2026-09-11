#!/usr/bin/env node
// scripts/ebay-first-light.mjs — FIRST LIGHT for the eBay adapter.
//
// The owner's question (10 Sep 2026): "I need to see if Asterisk can properly
// see items and then add internal tags to them." This runs the real Browse
// API search through the real normalizer (lib/ingest/ebay.js → inferTags,
// guessCategory, guessEra, sizeRecord) and prints what Asterisk saw and what
// it tagged — no database, no server, nothing written anywhere.
//
//   npm run ebay:first-light                         # the default archive queries
//   npm run ebay:first-light -- "helmut lang 1998" "raf simons archive"
//   EBAY_LIMIT=10 npm run ebay:first-light
//
// Keys come from .env.local (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_ENV)
// — `npm test` never loads that file (trap 71), and neither does plain node,
// so this script reads it itself. EBAY_ENV=PRODUCTION for the marketplace;
// anything else is the sandbox (sparse, made-up listings).
//
// Read the output for the FAILURES: an untagged title is a hole in the
// lexicon, a "tops" category on a jacket is a hole in guessCategory. Those
// lines are the point of this instrument.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const { searchEbay } = await import("../lib/ingest/ebay.js");
const { processQuery, streamStatus } = await import("../lib/asterisk/stream/index.js");
const DEEP = process.argv.includes("--deep");

const DEFAULT_QUERIES = [
  "helmut lang archive",
  "raf simons archive",
  "comme des garcons homme plus",
  "yohji yamamoto pour homme",
  "margiela artisanal",
  "issey miyake pleats",
  "carol christian poell",
  "number nine archive",
  "undercover jun takahashi",
  "rick owens drkshdw",
];
const argQueries = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const queries = argQueries.length ? argQueries : DEFAULT_QUERIES;
const limit = Math.max(1, Math.min(50, Number(process.env.EBAY_LIMIT) || 12));
const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";

if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
  console.error("no keys: set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (and EBAY_ENV=PRODUCTION) in .env.local");
  process.exit(2);
}

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
const tagFreq = new Map();
let seen = 0, tagged = 0, sized = 0, priced = 0;
const untagged = [];

let identified = 0, detailRead = 0, totalCost = 0;
const status = streamStatus();
console.log(`eBay FIRST LIGHT · ${env} · ${queries.length} queries × ${limit}${DEEP ? ` · DEEP (detail + decode${status.identify.enabled ? ` + identify ${status.identify.model}/${status.identify.effort}${status.identify.search ? "+search" : ""}` : " · identify OFF: no ANTHROPIC_API_KEY"})` : ""}\n`);
for (const q of queries) {
  let items, results = null;
  try {
    if (DEEP) {
      results = await processQuery(q, { limit, concurrency: 3 });
      items = results.map((r) => r.product);
    } else {
      items = await searchEbay(q, { limit, verifyColors: false });
    }
  } catch (e) {
    console.log(`▌ ${q}\n  FAILED: ${String(e.message).slice(0, 300)}\n`);
    continue;
  }
  console.log(`▌ ${q} — ${items.length} listings`);
  console.log("  " + pad("TITLE", 46) + pad("BRAND", 16) + pad("CAT", 11) + pad("ERA", 6) + pad("SIZE", 7) + pad("PRICE", 9) + "TASTE (strongest first)");
  for (const it of items) {
    seen += 1;
    // inferTags returns the brain's PROFILE — a tag → weight object, the cold
    // start vector — not a list. Show the strongest first, weight to 2 places.
    const tags = Array.isArray(it.tags) ? it.tags.map((t) => [t, null])
      : Object.entries(it.tags || {}).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);
    if (tags.length) tagged += 1; else untagged.push(it.title);
    if (it.size?.label) sized += 1;
    if (it.price != null) priced += 1;
    for (const [t] of tags) tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
    const canonical = tags.filter(([t]) => t === t.toUpperCase());
    const descriptors = tags.filter(([t]) => t !== t.toUpperCase());
    console.log("  " + pad(it.title, 46) + pad(it.brand, 16) + pad(it.category, 11) + pad(it.era?.decade, 6) + pad(it.size?.label ?? "—", 7)
      + pad(it.price != null ? `${it.currency} ${it.price}` : "—", 9) + (canonical.slice(0, 4).map(([t, w]) => (w == null ? t : `${t} ${w.toFixed(2)}`)).join(" · ") || "∅ NO TAGS"));
    if (DEEP) {
      const r = results[items.indexOf(it)];
      const rec = r?.identification?.record;
      if (r?.summary?.detail === "read") detailRead += 1;
      if (rec) {
        identified += 1;
        const y = rec.identification.year;
        console.log("      ↳ " + [rec.identification.house, rec.identification.line, rec.identification.garment, rec.identification.collection,
          y.value ? `${y.value} (${y.confidence})` : y.low || y.high ? `${y.low ?? "?"}–${y.high ?? "?"}` : null].filter(Boolean).join(" · ")
          + ` · conf ${rec.confidence}` + (r.identification.searched ? " · searched" : "") + ` · $${r.identification.costUsd}`);
        console.log("      ↳ " + rec.identification.what_it_is.slice(0, 140));
      } else if (r?.identification) {
        console.log(`      ↳ identify ${r.identification.status}${r.identification.error ? ": " + r.identification.error.slice(0, 120) : ""}`);
      }
      totalCost += r?.summary?.costUsd || 0;
      if (descriptors.length) console.log("      ↳ " + descriptors.slice(0, 10).map(([t, w]) => `${t} ${w.toFixed(2)}`).join(" · "));
      if (r?.summary?.aspects) console.log(`      ↳ seller tags ${r.summary.aspects} · brand from ${it.brandSource}` + (r.readings?.length ? ` · ${r.readings.length} readings` : ""));
    }
  }
  console.log();
}

const top = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
console.log("═══ what Asterisk saw");
console.log(`  listings ${seen} · tagged ${tagged} (${seen ? Math.round((100 * tagged) / seen) : 0}%) · size read ${sized} · priced ${priced}`
  + (DEEP ? ` · detail read ${detailRead} · identified ${identified} · cost $${totalCost.toFixed(3)}` : ""));
console.log("  top tags: " + (top.map(([t, n]) => `${t}×${n}`).join("  ") || "none"));
if (untagged.length) {
  console.log(`\n═══ ${untagged.length} listings Asterisk could NOT tag (lexicon holes — the useful part)`);
  for (const t of untagged.slice(0, 40)) console.log("  ∅ " + t);
}
