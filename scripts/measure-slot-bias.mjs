#!/usr/bin/env node
// scripts/measure-slot-bias.mjs — declared-criteria measurement for r24:
// server-stamped slot/zone on events (audit #27).
//
//   set -a; source .env.local; set +a
//   node scripts/measure-slot-bias.mjs
//
// Keyed DB pool, PURE READS — no probes to clean, nothing written anywhere.
//
// WHAT THIS HAS TO PROVE. Adding a field is easy; the audit asked for evidence
// that the field makes position bias CORRECTABLE. So the battery injects the
// exact confound #27 names — bridges that sit at systematically different
// positions, with identical true appeal — and then tries to recover the truth
// from nothing but the logged events.
//
// Why that confound and not a generic one: the feed assembler puts discovery
// slots at every 5th position and reach slots at the end of the page. Their
// engagement rates are therefore depressed by WHERE they sit, not by what they
// are — and r16 tuning divides engagement share by impression share per
// bridge. Without slot on the event there is no way, even in principle, to tell
// "this bridge earns less" from "this bridge sits lower".
//
// The events here are built by the REAL helpers the route calls —
// recordServe → serveContextFor → eventFromInteraction — not by a local
// reimplementation. The harness law from r16 applies: a battery that builds its
// own version of the thing it validates measures the version it built.
//
// Criteria (DECLARED HERE, before the run):
//   C1  NON-DEGENERATE. The recovered histogram must cover more than one slot
//       and span the examined window. A one-valued histogram de-biases nothing.
//   C2  HONEST COVERAGE. Every feed-sourced engagement carries slot AND zone;
//       every non-feed engagement (a modal, a shared link, an item served a
//       page ago) carries NEITHER. FAILS IF a non-feed interaction is assigned
//       a position — a fabricated slot is worse than a missing one.
//   C3  THE BIAS IS REAL AND THE DATA REMOVES IT. With all three bridges given
//       IDENTICAL true appeal, raw per-bridge engagement rates must differ
//       (the confound exists), and after re-weighting each exposure by the
//       inverse of its slot's estimated attention, the spread between bridges
//       must shrink by at least 50%. FAILS IF the raw spread is already flat
//       (nothing to correct — the injection failed) or if de-biasing does not
//       close most of it (the field does not carry enough to correct with).
//   C4  DETERMINISM. Run twice in-process, byte-identical.
//   L   LIVE COVERAGE, reported not gated: how many real user_events carry a
//       slot. Expected 0 until this ships and traffic arrives; printed so the
//       number is never assumed.
//
// AMENDMENT HISTORY: none yet (first run).

import { recordServe, serveContextFor } from "../lib/brain/index.js";
import { eventFromInteraction } from "../lib/events/index.js";
import { mulberry32 } from "../lib/brain/replay.js";
import { listEvents } from "../lib/db/index.js";

const READERS = 400, PAGE = 60, WINDOW = 24, SEED = 20260806;
// True appeal, IDENTICAL for all three bridges: every difference the battery
// measures downstream is therefore positional, by construction.
const TRUE_APPEAL = 0.5;
// The attention curve the readers actually have. The battery does not get to
// know this — it has to estimate it from the logged slots.
const trueAttention = (slot) => 0.25 + 0.75 * Math.exp(-slot / 12);

/** A page shaped the way the assembler shapes one: discovery every 5th slot,
 *  reach late, alpha everywhere else.
 *
 *  DECLARED FIXTURE CHOICE: reach sits at the END OF THE EXAMINED WINDOW
 *  (slots 22-23) rather than the end of the 60-slot page. A bridge nobody ever
 *  examines has no rate to correct, and the bias under test is the one the
 *  audit says survives r19 — the attention gradient AMONG SLOTS THE READER DID
 *  SEE. Putting reach beyond the window would test whether the window exists,
 *  which is already known. */
function makePage(p) {
  return Array.from({ length: PAGE }, (_, i) => {
    const zone = i >= WINDOW - 2 && i < WINDOW ? "reach" : (i + 1) % 5 === 0 ? "discovery" : "core";
    const bridge = zone === "discovery" ? "discovery-adjacent" : zone === "reach" ? "reach" : "alpha";
    return { id: `p${p}-i${i}`, brand: `b${i % 7}`, _bridge: bridge, _zone: zone };
  });
}

function run() {
  const rnd = mulberry32(SEED);
  const exposures = [];   // { slot, bridge }
  const engagements = []; // canonical events, built by the real helpers
  let fabricated = 0, missing = 0, offFeedStamped = 0;

  for (let r = 0; r < READERS; r++) {
    const page = makePage(r % 7);
    const profile = recordServe({ long: {}, session: {}, _meta: {} }, `serve-${r}`, page);
    for (let slot = 0; slot < WINDOW; slot++) {
      const it = page[slot];
      // THE EXPOSURE THE SYSTEM RECORDS is the reported window — every slot
      // that entered the viewport. That is what /api/impressions receives and
      // what the r16 denominator is built from. TRUE attention decays inside
      // that window, and the difference between the two is precisely the
      // residual confound #27 says is uncorrectable without a slot on the
      // event. (Were the denominator itself per-slot-truthful, attention would
      // cancel and there would be nothing here to measure.)
      exposures.push({ slot, bridge: it._bridge });
      if (rnd() >= trueAttention(slot) * TRUE_APPEAL) continue;
      const ctx = serveContextFor(profile, it.id);
      const ev = eventFromInteraction(`u${r}`, "favorite", { id: it.id, brand: it.brand }, null, ctx);
      if (!Number.isInteger(ev.payload.slot) || !ev.payload.zone) missing++;
      else if (ev.payload.slot !== slot) fabricated++;
      engagements.push(ev);
    }
    // An interaction on something this reader was NOT served from the feed —
    // the item-detail modal, a shared link. It must come back unpositioned.
    const off = eventFromInteraction(`u${r}`, "favorite", { id: `elsewhere-${r}`, brand: "X" }, null,
      serveContextFor(profile, `elsewhere-${r}`));
    if ("slot" in off.payload || "zone" in off.payload) offFeedStamped++;
  }

  // ---- recover the attention curve from the logs alone ----------------------
  const expBySlot = new Array(WINDOW).fill(0);
  const engBySlot = new Array(WINDOW).fill(0);
  for (const e of exposures) expBySlot[e.slot]++;
  for (const ev of engagements) engBySlot[ev.payload.slot]++;
  // Exposure here is what the server SERVED (every slot of the window); the
  // logged engagement rate per slot therefore carries attention x appeal, and
  // appeal is constant, so the normalized rate IS the attention estimate.
  const rate = engBySlot.map((n, i) => (expBySlot[i] ? n / expBySlot[i] : 0));
  const top = Math.max(...rate);
  const attnHat = rate.map((x) => (top > 0 ? x / top : 0));

  // ---- per-bridge rates, raw and de-biased ---------------------------------
  const BRIDGES = ["alpha", "discovery-adjacent", "reach"];
  const raw = {}, debiased = {};
  for (const b of BRIDGES) {
    const exp = exposures.filter((e) => e.bridge === b);
    const eng = engagements.filter((ev) => ev.payload.bridge === b);
    raw[b] = exp.length ? eng.length / exp.length : 0;
    // Horvitz-Thompson: an exposure at a slot nobody really looks at is not a
    // whole chance to engage, so the DENOMINATOR is discounted by the slot's
    // estimated attention while engagements are counted plainly. Weighting
    // both sides cancels and corrects nothing — the arithmetic mistake that
    // makes a de-biasing step look like it ran.
    //   observed rate = appeal x mean attention over the bridge's slots
    //   => appeal = engagements / sum(attention over its exposures)
    const effective = exp.reduce((acc, e) => acc + attnHat[e.slot], 0);
    debiased[b] = effective ? eng.length / effective : 0;
  }
  const spread = (o) => Math.max(...Object.values(o)) - Math.min(...Object.values(o));
  return { expBySlot, engBySlot, attnHat, raw, debiased, rawSpread: spread(raw), debiasedSpread: spread(debiased), missing, fabricated, offFeedStamped, exposures: exposures.length, engagements: engagements.length };
}

const r1 = run();
const r2 = run();
const deterministic = JSON.stringify(r1) === JSON.stringify(r2);

console.log(`readers ${READERS}, window ${WINDOW} of ${PAGE} slots — ${r1.exposures} exposures, ${r1.engagements} engagements`);
console.log(`engagements by slot : ${r1.engBySlot.join(",")}`);
console.log(`attention recovered : ${r1.attnHat.map((x) => x.toFixed(2)).join(",")}`);
console.log(`   (true curve      : ${Array.from({ length: WINDOW }, (_, i) => (trueAttention(i) / trueAttention(0)).toFixed(2)).join(",")})`);
console.log(`per-bridge rate RAW      : ${Object.entries(r1.raw).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(" | ")}  spread ${r1.rawSpread.toFixed(4)}`);
console.log(`per-bridge rate DE-BIASED: ${Object.entries(r1.debiased).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(" | ")}  spread ${r1.debiasedSpread.toFixed(4)}`);
console.log(`   (all three bridges were given IDENTICAL true appeal ${TRUE_APPEAL} — every difference above is position)`);

const distinctSlots = new Set(r1.engBySlot).size;
const c1 = distinctSlots > 1 && r1.engBySlot.filter((n) => n > 0).length === WINDOW;
const c2 = r1.missing === 0 && r1.fabricated === 0 && r1.offFeedStamped === 0;
const shrink = r1.rawSpread > 0 ? 1 - r1.debiasedSpread / r1.rawSpread : 0;
const c3 = r1.rawSpread > 0.01 && shrink >= 0.5;

console.log(`C1 histogram non-degenerate (${distinctSlots} distinct counts, ${r1.engBySlot.filter((n) => n > 0).length}/${WINDOW} slots covered) : ${c1 ? "ok" : "FAIL"}`);
console.log(`C2 coverage honest (missing ${r1.missing}, fabricated ${r1.fabricated}, off-feed stamped ${r1.offFeedStamped}) : ${c2 ? "ok" : "FAIL"}`);
console.log(`C3 bias real and removable (raw spread ${r1.rawSpread.toFixed(4)} -> ${r1.debiasedSpread.toFixed(4)}, ${(shrink * 100).toFixed(0)}% closed, need 50%) : ${c3 ? "ok" : "FAIL"}`);

// L — live coverage. Reported, never gated: zero is the expected reading until
// this ships and real traffic arrives, and a battery that failed on it would be
// failing on the calendar.
try {
  const rows = await listEvents(null, 500).catch(() => []);
  const engaged = (rows || []).filter((e) => e?.payload?.itemId);
  const withSlot = engaged.filter((e) => Number.isInteger(e.payload.slot));
  console.log(`L  live user_events sampled ${engaged.length}; carrying a slot: ${withSlot.length} (reported — 0 is expected before this ships)`);
} catch {
  console.log(`L  live user_events unavailable (no DB configured) — reported, not gated`);
}

const pass = c1 && c2 && c3 && deterministic;
console.log(`VERDICT: ${pass ? "PASS" : "FAIL"}; deterministic ${deterministic}`);
process.exit(pass ? 0 : 1);
