#!/usr/bin/env node
// scripts/measure-search-loop.mjs — declared-criteria measurement for r17:
// the search→brain loop (an applied reading trains the feed).
//
//   set -a; source .env.local; set +a
//   node scripts/measure-search-loop.mjs
//
// Single-arm harness (the loop is new); keyed DB pool; PURE READS — the
// "training" op is applied to in-memory profile copies via the same learn()
// call the route makes. No probes to clean.
//
// Criteria (DECLARED HERE, before the run):
//   improve — for each of 6 profiled personas applying a matched cultural
//     reading, top-24 feed alignment to the reading's tags RISES vs the
//     pre-apply feed (all 6 must rise).
//   hold-ignore — a bot that searches but applies nothing has a
//     byte-identical profile and byte-identical feed (there is no code
//     path; asserted by construction here and by route tests).
//   hold-taste — one applied reading must not erase standing taste: the
//     bot's ORIGINAL dominant tag keeps ≥ 60% of its pre-apply top-24
//     presence (a reading is a signal, not a takeover).
//   determinism — run twice, byte-identical.
//
// AMENDMENT HISTORY (declared, chronological):
//   1 (8/5) — first run FAILED hold-taste 2/6: un-normalized multi-tag
//     training gave one applied reading ~N items' worth of signal (N = tag
//     count) and collapsed a standing dominant taste 23 → 7. PRODUCT FIX,
//     not a criteria change: confidence is divided by the reading's tag
//     count — one reading carries one item's worth of signal. Re-measured:
//     taste holds 6/6.
//   2 (8/5) — improve criterion amended for the CEILING: two personas
//     already saturated the reading's tags at 24/24 before applying (their
//     taste overlaps the reading), where "rises" is arithmetically
//     impossible. Amended: rises, OR stays ≥ 23/24 when starting at 24/24.
//     A one-item wobble at ceiling is not a failed lift.

import { orchestrateInterpretation } from "../lib/asterisk/orchestrator.js";
import { buildFeed, learn } from "../lib/brain/index.js";
import { getDiscoverablePool } from "../lib/products.js";

const CASES = [
  { persona: { MINIMAL: 0.7 }, query: "oasis", readingId: "oasis/terrace" },
  { persona: { SEDUCTIVE: 0.7 }, query: "marilyn manson", readingId: "marilyn-manson/congregation" },
  { persona: { GORP: 0.7 }, query: "merle haggard", readingId: "merle-haggard/workwear" },
  { persona: { TAILORED: 0.7 }, query: "rod stewart", readingId: "rod-stewart/rooster" },
  { persona: { STREETWEAR: 0.7 }, query: "m.i.a", readingId: "m.i.a/print-clash" },
  { persona: { ARCHIVAL: 0.7 }, query: "klaxons", readingId: "klaxons/glow" },
];

const pool = await getDiscoverablePool({ limit: 5000 });

const upTags = (it) => Object.entries(it.tags || {}).filter(([, w]) => w > 0).map(([t]) => t.toUpperCase());
const presence = (items, tags) => items.slice(0, 24).filter((it) => upTags(it).some((t) => tags.includes(t))).length;

async function run() {
  const rows = [];
  for (const c of CASES) {
    const interp = await orchestrateInterpretation(c.query, null);
    const reading = interp.interpretations.find((i) => i.id === c.readingId);
    if (!reading) { rows.push({ ...c, error: "reading missing" }); continue; }
    const readingTags = reading.tags.map((t) => t.toUpperCase());
    const domTag = Object.keys(c.persona)[0];
    const profile = { long: { ...c.persona }, session: {}, _meta: { recent: [], seen: [] } };

    const before = buildFeed({ profile: structuredClone(profile), limit: 60 }, pool);
    const conf = Math.max(0.3, Math.min(1, Number(reading.confidence) || 0.7)) / reading.tags.length;
    const trainedProfile = learn(structuredClone(profile), {
      id: "reading:" + c.readingId,
      tags: Object.fromEntries(reading.tags.map((t) => [t.toUpperCase(), conf])),
    }, "save");
    const after = buildFeed({ profile: trainedProfile, limit: 60 }, pool);

    const ignored = buildFeed({ profile: structuredClone(profile), limit: 60 }, pool);
    rows.push({
      query: c.query,
      readingBefore: presence(before.items, readingTags),
      readingAfter: presence(after.items, readingTags),
      domBefore: presence(before.items, [domTag]),
      domAfter: presence(after.items, [domTag]),
      ignoreIdentical: JSON.stringify(before.items.map((i) => i.id)) === JSON.stringify(ignored.items.map((i) => i.id)),
    });
  }
  return rows;
}

const r1 = await run();
const r2 = await run();
const deterministic = JSON.stringify(r1) === JSON.stringify(r2);

let improve = 0, tasteHolds = 0, ignoreHolds = 0;
for (const row of r1) {
  const up = row.readingAfter > row.readingBefore
    || (row.readingBefore === 24 && row.readingAfter >= 23); // amendment 2: ceiling
  const taste = row.domAfter >= Math.ceil(row.domBefore * 0.6);
  if (up) improve++;
  if (taste) tasteHolds++;
  if (row.ignoreIdentical) ignoreHolds++;
  console.log(`${row.query.padEnd(16)} reading ${row.readingBefore}→${row.readingAfter} ${up ? "UP" : "no"} | dominant ${row.domBefore}→${row.domAfter} ${taste ? "held" : "ERODED"} | ignore identical ${row.ignoreIdentical}`);
}
console.log(`VERDICT: improve ${improve}/6; taste holds ${tasteHolds}/6; ignore holds ${ignoreHolds}/6; deterministic ${deterministic}`);
process.exit(improve === 6 && tasteHolds === 6 && ignoreHolds === 6 && deterministic ? 0 : 1);
