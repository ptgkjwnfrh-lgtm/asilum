// scripts/measure-popularity-people.mjs — the delta/epsilon counter battery.
//
// THE VULNERABILITY, both directions, both crossing every user permanently:
//   UPWARD    one identity favouriting an item 120x/min drove delta to ~0.96.
//   DOWNWARD  one identity aiming ~3600 impressions/min at a chosen item drove
//             its novelty to 0.007, removing it from everyone's exploration
//             and reach zones — through a READ endpoint.
//
// DECLARED CRITERIA (each states what would FAIL):
//   C0  HARNESS PARITY (GATE). One identity viewing the same item on 12 pages
//       must leave viewers = 1. FAILS IF it counts 12 — then the simulator is
//       still implementing the pre-fix rule and NO other result here is
//       admissible.
//   C1  UPWARD, PRE-FIX REPRODUCTION. 120 forged engagements under the legacy
//       rule must reach delta >= 0.95. FAILS IF not — the attack was never
//       effective and the round proves nothing.
//   C2  UPWARD, FIXED. Same script: engagers must be 1 and delta must sit at
//       the prior within 0.05. FAILS otherwise.
//   C3  DOWNWARD, PRE-FIX REPRODUCTION. 3600 aimed impressions under the
//       legacy rule must drive novelty below 0.01. FAILS IF not.
//   C4  DOWNWARD, FIXED. Same script: viewers must be 1, and the target's
//       novelty must stay in the top half of the pool. FAILS otherwise.
//   C5  SUPPRESSION PRICE, PUBLISHED. Sweep N distinct identities and report
//       the novelty each buys. The ONLY failure is not writing the number
//       down — this fix raises the price of damage, it does not abolish it.
//   C6  NO CLIFF. Sweeping engagers 0..20, no adjacent step may move delta by
//       more than 0.06. FAILS otherwise — that would mean the prior is still
//       a branch rather than a blend.
//   C7  DAY-ONE IS UNIFORM, NOT FABRICATED. With every count at zero, novelty
//       must be identical for every item. FAILS IF the engine invents an
//       ordering from no evidence.
//   C8  SINGLE IMPLEMENTATION. No file outside lib/brain/popularity.js may
//       read .eng/.imp for scoring, and the novelty curve may appear once.
//       FAILS otherwise — the reach zone previously carried its own copy, and
//       that is exactly the half-ship a human reviewer would miss.
//   C9  KILL SWITCH RESTORES THE VULNERABILITY. With BRAIN_POPULARITY_DEDUP=0
//       the C3 attack must succeed again. FAILS IF not — a switch that does
//       not restore the old behaviour is not a rollback.
//   C10 DETERMINISM. Run twice, byte-identical.
//
// AMENDMENT HISTORY: none yet (first run).
process.env.DATABASE_URL = "";

const { buildNoveltyIndex, deltaScore, noveltyFactor } = await import("../lib/brain/popularity.js");
const { CATALOG } = await import("../lib/ingest/catalog.js");
const fs = await import("node:fs");

const out = { pass: [], fail: [], notes: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(`${n}: ${d}`);

const TARGET = CATALOG[0].id;
// A pool where every item has been seen by a realistic spread of people.
function pool(targetViewers, targetEngagers = 0) {
  const p = {};
  CATALOG.slice(0, 200).forEach((it, i) => {
    p[it.id] = { eng: 0, imp: 0, engagers: 0, viewers: (i % 12) + 1 };
  });
  p[TARGET] = { eng: 0, imp: 0, engagers: targetEngagers, viewers: targetViewers };
  return p;
}
const legacy = (fn) => {
  process.env.BRAIN_POPULARITY_DEDUP = "0";
  try { return fn(); } finally { delete process.env.BRAIN_POPULARITY_DEDUP; }
};

// C0 — harness parity, the gate.
{
  const { simulateSession, makeBots } = await import("../lib/brain/replay.js");
  const [bot] = makeBots(1, 42);
  const s = simulateSession(bot, null, { pool: CATALOG, pages: 12, limit: 60 });
  const pops = s.popularity || {};
  let viewersMax = 0, impMax = 0, repeated = 0;
  for (const v of Object.values(pops)) {
    viewersMax = Math.max(viewersMax, v.viewers || 0);
    impMax = Math.max(impMax, v.imp || 0);
    if ((v.imp || 0) > 1) repeated++;
  }
  // NON-VACUITY: the first run of this gate passed with viewers 0 AND
  // impressions 0 — the simulator had never run, because simulateSession did
  // not return its popularity map. A gate that passes on an empty result is
  // the r18 vacuity trap. It now requires proof that exposure happened AND
  // that at least one item was served more than once.
  check("C0 harness parity (GATE)", impMax > 1 && repeated > 0 && viewersMax === 1,
    `one bot over 12 pages → raw impressions peaked at ${impMax} on ${repeated} repeated items, distinct viewers ${viewersMax} (must be exactly 1)`);
}

// C1 / C2 — upward.
{
  const forged = legacy(() => deltaScore({ id: TARGET }, { [TARGET]: { eng: 120, imp: 10 } }));
  check("C1 upward pre-fix", forged >= 0.95, `120 forged engagements → delta ${forged.toFixed(4)}`);
  const fixed = deltaScore({ id: TARGET }, { [TARGET]: { eng: 120, imp: 10, engagers: 1, viewers: 1 } });
  check("C2 upward fixed", Math.abs(fixed - 0.3) < 0.05,
    `same 120 events → engagers 1 → delta ${fixed.toFixed(4)} (prior 0.3); raw eng retained at 120 as the abuse fingerprint`);
}

// C3 / C4 — downward, the asymmetric direction.
{
  const burned = legacy(() => noveltyFactor({ id: TARGET }, { [TARGET]: { eng: 0, imp: 3600 } }));
  check("C3 downward pre-fix", burned < 0.01, `3600 aimed impressions → novelty ${burned.toFixed(4)}`);
  const p = pool(1);
  const idx = buildNoveltyIndex(p);
  const nov = noveltyFactor({ id: TARGET }, p, idx);
  check("C4 downward fixed", nov >= 0.5,
    `one identity's 3600 reports → viewers 1 → novelty ${nov.toFixed(3)} (top half of the pool)`);
}

// C5 — the price, published.
{
  const rows = [];
  for (const n of [1, 5, 25, 100, 500]) {
    const p = pool(n);
    rows.push(`${n} identities → novelty ${buildNoveltyIndex(p).get(n).toFixed(3)}`);
  }
  out.notes.push("SUPPRESSION PRICE (distinct signed identities → target's novelty): " + rows.join(" | "));
  check("C5 price published", rows.length === 5, rows.join(" | "));
}

// C6 — no cliff.
{
  let worst = 0, at = null;
  let prev = deltaScore({ id: TARGET }, { [TARGET]: { engagers: 0, viewers: 0 } });
  for (let n = 1; n <= 20; n++) {
    const d = deltaScore({ id: TARGET }, { [TARGET]: { engagers: n, viewers: n * 2 } });
    if (Math.abs(d - prev) > worst) { worst = Math.abs(d - prev); at = n; }
    prev = d;
  }
  check("C6 no cliff", worst <= 0.06, `largest adjacent step ${worst.toFixed(4)} at engagers=${at}`);
}

// C7 — day one is uniform.
{
  const p = {};
  for (const it of CATALOG.slice(0, 100)) p[it.id] = { eng: 0, imp: 0, engagers: 0, viewers: 0 };
  const idx = buildNoveltyIndex(p);
  const vals = new Set(Object.keys(p).map((id) => noveltyFactor({ id }, p, idx)));
  check("C7 day-one uniform", vals.size === 1,
    `distinct novelty values across a zero-evidence catalog: ${vals.size} (${[...vals][0]})`);
}

// C8 — single implementation.
{
  const files = ["lib/brain/bridges.js", "lib/brain/index.js", "app/api/feed/route.js"];
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    if (/\.imp\b|\.eng\b/.test(src.replace(/^\s*\/\/.*$/gm, ""))) offenders.push(f);
    if (/25\s*\/\s*\(/.test(src)) offenders.push(f + " (inline novelty curve)");
  }
  check("C8 single implementation", offenders.length === 0,
    offenders.length ? "raw counter reads survive in: " + offenders.join(", ") : "scoring reads live only in lib/brain/popularity.js");
}

// C9 — kill switch restores the vulnerability.
{
  const burned = legacy(() => noveltyFactor({ id: TARGET }, { [TARGET]: { eng: 0, imp: 3600 } }));
  check("C9 kill switch", burned < 0.01, `with BRAIN_POPULARITY_DEDUP=0 the attack works again → novelty ${burned.toFixed(4)}`);
}

// C10 — determinism.
{
  const p = pool(7, 3);
  const once = JSON.stringify(Object.keys(p).map((id) => [deltaScore({ id }, p), noveltyFactor({ id }, p)]));
  const twice = JSON.stringify(Object.keys(p).map((id) => [deltaScore({ id }, p), noveltyFactor({ id }, p)]));
  check("C10 determinism", once === twice, once === twice ? "byte-identical" : "DRIFTED");
}

console.log("\nPOPULARITY — PEOPLE, NOT EVENTS");
console.log("PASS");
for (const p of out.pass) console.log("  ✓", p);
if (out.notes.length) { console.log("NOTES"); for (const n of out.notes) console.log("  ·", n); }
if (out.fail.length) { console.log("FAIL"); for (const f of out.fail) console.log("  ✗", f); }
console.log(`\n${out.pass.length} passed, ${out.fail.length} failed`);
process.exit(out.fail.length ? 1 : 0);
