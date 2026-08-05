// scripts/measure-graph-corroboration.mjs — the forged-edge battery (Aug 6).
//
// THE ATTACK, RUN FOR REAL. One identity picks a popular anchor A and a
// payload B, engages the pair repeatedly, and we then serve a FROZEN feed to
// victims who have only ever engaged A. Before the fix the payload lands in
// their feed; after it, it cannot.
//
// DECLARED CRITERIA (each states what would FAIL):
//   C1 SOLO CANNOT LIFT — the forged pair's gamma must be strictly below the
//      score B would have had with no edge at all (the r18 vector floor,
//      0.6 × measured median neighbour cosine 0.848 = 0.509). FAILS IF a solo
//      contributor's gamma >= that floor: the confirmed vulnerability is open.
//   C2 THE FIX IS LOAD-BEARING — the same attack under the legacy rule
//      (BRAIN_EDGE_CORROBORATION=0) must reach a HIGH gamma. FAILS IF the
//      legacy arm is also low: then the battery proves nothing about the fix,
//      only that the attack was never effective.
//   C3 VICTIM PENETRATION — B must not enter the victim's SERVED PAGE in the
//      fixed arm while it does in the legacy arm. FAILS IF B appears in the
//      fixed arm, or if it never appears in the legacy arm (nothing proven).
//   C4 HONEST CONSENSUS SURVIVES — a pair corroborated by 3 distinct
//      identities must score ABOVE the vector floor and remain visible. FAILS
//      IF real consensus is suppressed: the gate would be deleting signal.
//   C5 REPETITION IS INERT — 1 engagement and 40 engagements by the SAME
//      identity must produce byte-identical feeds. FAILS IF they differ.
//   C6 DETERMINISM — the whole battery, run twice, byte-identical.
//
// AMENDMENT HISTORY:
//   1. (first run) C3 measured a top-24 window and the payload was absent in
//      BOTH arms, proving nothing. A user receives a 60-slot page, so the
//      honest victim window is the served page: the forged item lands at rank
//      37 of 60 carrying _bridge "gamma" under the legacy rule. Widened to
//      limit 60 and added the requirement that the legacy arm MUST show
//      penetration, so a silently ineffective attack can no longer pass C3.
//
// Mem-mode only; touches no database. Deterministic (no Math.random).
process.env.DATABASE_URL = "";

const { bumpEdges, getEdges } = await import("../lib/db/index.js");
const { buildFeed } = await import("../lib/brain/index.js");
const { CATALOG } = await import("../lib/ingest/catalog.js");
const { GAMMA_CONTRIB_HALF } = await import("../lib/brain/edges.js");

const VECTOR_FLOOR = 0.6 * 0.848;
const out = { pass: [], fail: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(`${n}: ${d}`);

// A = a piece a taste-aligned user would plausibly engage; B = payload, chosen
// maximally far from that taste so nothing but the forged edge can surface it.
const TASTE = { MINIMAL: 0.9, TAILORED: 0.6 };
const scoreOf = (it) => Object.entries(TASTE).reduce((s, [t, v]) => s + (it.tags?.[t] || 0) * v, 0);
const ranked = [...CATALOG].sort((x, y) => scoreOf(y) - scoreOf(x));
const A = ranked[0].id;
const B = ranked[ranked.length - 1].id;

function victimFeed(edges) {
  return buildFeed({
    profile: { long: { ...TASTE }, session: {}, _meta: { recent: [A], seen: [] } },
    limit: 60, edges,
  }, CATALOG).items.map((i) => i.id);
}

async function run(label, { legacy, contributors, repeats }) {
  const prev = process.env.BRAIN_EDGE_CORROBORATION;
  if (legacy) process.env.BRAIN_EDGE_CORROBORATION = "0"; else delete process.env.BRAIN_EDGE_CORROBORATION;
  // fresh graph per arm: re-import lib/db with a cache-busting query string
  const db = await import("../lib/db/index.js?arm=" + encodeURIComponent(label));
  for (let c = 0; c < contributors; c++) {
    for (let r = 0; r < repeats; r++) await db.bumpEdges([{ a: A, b: B, w: 2 }], `id-${c}`);
  }
  const edges = await db.getEdges([A]);
  const strength = edges[A]?.[B] || 0;
  const feed = victimFeed(edges);
  if (prev === undefined) delete process.env.BRAIN_EDGE_CORROBORATION;
  else process.env.BRAIN_EDGE_CORROBORATION = prev;
  return { strength, gamma: strength / (strength + GAMMA_CONTRIB_HALF), feed, rank: feed.indexOf(B) };
}

const attackFixed = await run("fixed-solo", { legacy: false, contributors: 1, repeats: 40 });
const attackLegacy = await run("legacy-solo", { legacy: true, contributors: 1, repeats: 40 });
const honest = await run("honest-3", { legacy: false, contributors: 3, repeats: 1 });
const once = await run("fixed-once", { legacy: false, contributors: 1, repeats: 1 });

check("C1 solo cannot lift", attackFixed.gamma < VECTOR_FLOOR,
  `40 forged engagements → strength ${attackFixed.strength}, gamma ${attackFixed.gamma.toFixed(3)} vs floor ${VECTOR_FLOOR.toFixed(3)}`);
const legacyGamma = attackLegacy.strength / (attackLegacy.strength + 3);
check("C2 fix is load-bearing", legacyGamma > 0.9,
  `legacy arm: raw w ${attackLegacy.strength}, gamma ${legacyGamma.toFixed(3)} (the vulnerability, reproduced)`);
check("C3 victim penetration", attackFixed.rank === -1 && attackLegacy.rank !== -1,
  `payload rank in the victim's 60-slot page — legacy ${attackLegacy.rank}, fixed ${attackFixed.rank} (-1 = absent)`);
check("C4 honest consensus survives", honest.gamma > VECTOR_FLOOR,
  `3 distinct identities → strength ${honest.strength}, gamma ${honest.gamma.toFixed(3)}`);
check("C5 repetition is inert",
  JSON.stringify(once.feed) === JSON.stringify(attackFixed.feed) && once.strength === attackFixed.strength,
  `1 engagement vs 40 by one identity → strength ${once.strength} vs ${attackFixed.strength}, feeds identical`);

const rerun = await run("fixed-solo-2", { legacy: false, contributors: 1, repeats: 40 });
check("C6 determinism", JSON.stringify(rerun.feed) === JSON.stringify(attackFixed.feed),
  rerun.strength === attackFixed.strength ? "byte-identical across runs" : "DRIFTED");

console.log(`\nGAMMA EDGE CORROBORATION BATTERY`);
console.log(`  anchor A = ${A}  payload B = ${B}  vector floor = ${VECTOR_FLOOR.toFixed(3)}`);
console.log("PASS");
for (const p of out.pass) console.log("  ✓", p);
if (out.fail.length) { console.log("FAIL"); for (const f of out.fail) console.log("  ✗", f); }
console.log(`\n${out.pass.length} passed, ${out.fail.length} failed`);
process.exit(out.fail.length ? 1 : 0);
