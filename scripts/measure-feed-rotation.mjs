#!/usr/bin/env node
// scripts/measure-feed-rotation.mjs — DOES A HEAVY SCROLLER SEE THE SAME
// PIECES AGAIN, AND WOULD A BIGGER MEMORY STOP IT?
//
//   node scripts/measure-feed-rotation.mjs
//
// No database, no keys, nothing written. It runs against lib/ingest/catalog.js
// (915 items), which is the same pool the feed route falls back to when the
// items table is empty.
//
// THE CLAIM UNDER TEST. docs/DEBT-REGISTER.md §4 and the roadmap's §4.5d say:
//
//   "SEEN_CAP = 200 is a hard ceiling on feed rotation. Past ~200 pieces
//    served, the oldest fall out of _meta.seen and can reappear — a heavy
//    scroller loops. Raising the cap trades memory per profile."
//
// It was written from reading the code. Reading the code is where the wrong
// half comes from: `seen` is not an exclusion, it is a SCORE MULTIPLIER
// (SEEN_PENALTY = 0.3 in lib/brain/bridges.js). A penalty can be outvoted by a
// strong enough item on the very next page, entirely INSIDE the cap. So "a
// heavy scroller loops" and "the cap is why" are two claims, and only the
// first was ever argued.
//
// WHAT THIS SEPARATES. Every repeat on a page is attributed to one of two
// causes, which is the whole point of the harness:
//
//   FORGOTTEN  the item had fallen out of _meta.seen. Raising SEEN_CAP fixes
//              exactly these and no others.
//   OUTVOTED   the item was still in _meta.seen, carrying the 0.3 penalty, and
//              was served anyway. A bigger cap does nothing for these.
//
// ARMS. Both browse the identical bot through the identical catalog.
//
//   shipped    rotation memory written by the real markSeen() — SEEN_CAP and
//              all. This arm is the product.
//   unbounded  a control that remembers EVERY id ever served, built here
//              rather than by markSeen, because the cap is a module constant
//              with no injection seam. It is one line (no .slice), stated so
//              nobody has to guess what the control is.
//
// The difference between the arms is attributable to the cap and to nothing
// else. If the two arms repeat at the same rate, the cap is not the problem
// and raising it buys nothing.

import { buildFeed, markSeen, migrateProfile } from "../lib/brain/index.js";
import { makeBots } from "../lib/brain/replay.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const PAGES = Number(process.env.PAGES || 40);
const LIMIT = Number(process.env.LIMIT || 60);
const SEED = Number(process.env.SEED || 11);

const bot = makeBots(1, SEED)[0];

// A reader's taste is what makes rotation hard: a bot with no taste is served
// near-arbitrary items and repeats little. This starts from the bot's latent
// taste so the measurement is about a reader the engine has something to say
// to.
const startProfile = () => migrateProfile({ long: { ...bot.latent }, session: {}, _meta: {} });

function run(remember) {
  let profile = startProfile();
  const everServed = new Set();
  const rows = [];
  for (let page = 0; page < PAGES; page++) {
    const seenBefore = new Set(migrateProfile(profile)._meta.seen || []);
    const { items } = buildFeed({ profile, limit: LIMIT }, CATALOG);
    const ids = items.map((it) => it.id);

    let fresh = 0, forgotten = 0, outvoted = 0;
    for (const id of ids) {
      if (!everServed.has(id)) { fresh++; continue; }
      if (seenBefore.has(id)) outvoted++; else forgotten++;
    }
    for (const id of ids) everServed.add(id);
    rows.push({
      page: page + 1, served: ids.length, fresh, outvoted, forgotten,
      distinct: everServed.size, memory: seenBefore.size,
    });
    profile = remember(profile, ids);
  }
  return rows;
}

// Exactly what app/api/feed/route.js passes: the size of the pool it served.
const shipped = run((p, ids) => markSeen(p, ids, CATALOG.length));
const unbounded = run((p, ids) => {
  const next = migrateProfile(p);
  // markSeen without the .slice(0, SEEN_CAP) — that is the entire difference.
  next._meta.seen = [...ids, ...(next._meta.seen || [])];
  return next;
});

const pct = (n, d) => d ? `${((100 * n) / d).toFixed(1)}%` : "—";
const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

console.log(`FEED ROTATION — ${PAGES} pages of ${LIMIT}, catalog ${CATALOG.length}, seed ${SEED}\n`);
console.log("page | arm        | fresh | outvoted | forgotten | distinct | memory");
console.log("-----|------------|-------|----------|-----------|----------|-------");
for (let i = 0; i < PAGES; i++) {
  if (i >= 6 && i < PAGES - 3 && (i + 1) % 5 !== 0) continue; // first 6, every 5th, last 3
  for (const [name, rows] of [["shipped", shipped], ["unbounded", unbounded]]) {
    const r = rows[i];
    console.log(
      `${String(r.page).padStart(4)} | ${name.padEnd(10)} | ${String(r.fresh).padStart(5)} | ` +
      `${String(r.outvoted).padStart(8)} | ${String(r.forgotten).padStart(9)} | ` +
      `${String(r.distinct).padStart(8)} | ${String(r.memory).padStart(6)}`);
  }
}

const totals = (rows) => {
  const served = sum(rows, "served");
  return {
    served, fresh: sum(rows, "fresh"),
    outvoted: sum(rows, "outvoted"), forgotten: sum(rows, "forgotten"),
    distinct: rows[rows.length - 1].distinct,
  };
};
const s = totals(shipped), u = totals(unbounded);

console.log(`
TOTALS over ${PAGES} pages
                    shipped      unbounded
  slots served    ${String(s.served).padStart(8)}       ${String(u.served).padStart(8)}
  distinct items  ${String(s.distinct).padStart(8)}       ${String(u.distinct).padStart(8)}   of ${CATALOG.length}
  repeats         ${String(s.outvoted + s.forgotten).padStart(8)}       ${String(u.outvoted + u.forgotten).padStart(8)}
    outvoted      ${String(s.outvoted).padStart(8)}       ${String(u.outvoted).padStart(8)}   still in memory; a bigger cap does NOTHING for these
    forgotten     ${String(s.forgotten).padStart(8)}       ${String(u.forgotten).padStart(8)}   fell out of memory; a bigger cap fixes exactly these

  repeat rate     ${pct(s.outvoted + s.forgotten, s.served).padStart(8)}       ${pct(u.outvoted + u.forgotten, u.served).padStart(8)}
`);

const capCost = (s.outvoted + s.forgotten) - (u.outvoted + u.forgotten);
console.log(capCost > 0
  ? `THE CAP COSTS ${capCost} REPEATED SLOTS over ${PAGES} pages (${pct(capCost, s.served)} of what was served).`
  : `THE CAP COSTS NOTHING MEASURABLE over ${PAGES} pages. Repeats are ${pct(s.outvoted, s.served)} outvoted, not forgotten — raising SEEN_CAP would not remove one of them.`);

const firstRepeat = shipped.find((r) => r.outvoted + r.forgotten > 0);
console.log(firstRepeat
  ? `First repeat: page ${firstRepeat.page} (${firstRepeat.outvoted} outvoted, ${firstRepeat.forgotten} forgotten).`
  : `No repeat in ${PAGES} pages.`);
const dry = shipped.find((r) => r.fresh === 0);
console.log(dry
  ? `First page on which NOTHING was new: page ${dry.page} (shipped arm).`
  : `The shipped arm was still showing something new on page ${PAGES}.`);
console.log(
  `Reachable catalog for this reader: ${s.distinct}/${CATALOG.length} ` +
  `(${pct(s.distinct, CATALOG.length)}) shipped vs ${u.distinct}/${CATALOG.length} ` +
  `(${pct(u.distinct, CATALOG.length)}) unbounded.`);
