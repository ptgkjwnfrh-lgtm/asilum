#!/usr/bin/env node
// scripts/measure-attribution.mjs — declared-criteria measurement for r14:
// bridge attribution instrumentation. The whole point of this round is that
// it changes NOTHING about ranking — so the battery's centerpiece is a
// byte-identity proof, not an improvement claim.
//
//   set -a; source .env.local; set +a
//   node scripts/measure-attribution.mjs baseline|after
//
// Arms: baseline = main via git worktree; after = the r14 branch. Keyed DB
// path for the pool + popularity + edges (same reads as /api/feed). PURE
// READS — this battery writes no profiles, no events, no impressions, and
// therefore needs no probe cleanup.
//
// Criteria (DECLARED HERE, before the run):
//   hold — for every profile scenario below, the feed's (id, _score, _zone)
//     sequence is byte-identical across arms. One mismatch = r14 is not
//     instrumentation and does not ship.
//   coverage (after arm only) — 100% of served slots carry a whitelisted
//     _bridge; zoned slots carry pathway attributions; core slots carry one
//     of the six bridge names.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFeed } from "../lib/brain/index.js";
import { getDiscoverablePool, getPopularitySnapshot } from "../lib/products.js";
import { getEdges } from "../lib/db/index.js";

const ARM = process.argv[2];
if (!["baseline", "after"].includes(ARM)) { console.error("usage: measure-attribution.mjs baseline|after"); process.exit(1); }

const WHITELIST = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "ad", "discovery-adjacent", "discovery-crossuser", "reach"]);
const CORE = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "ad"]);

const SCENARIOS = [
  { name: "cold", profile: { long: {}, session: {}, _meta: {} } },
  { name: "minimal-tailored", profile: { long: { MINIMAL: 0.8, TAILORED: 0.5 }, session: {}, _meta: { recent: [], seen: [] } } },
  { name: "gorp-warm", profile: { long: { GORP: 0.9, UTILITARIAN: 0.6 }, session: { STREETWEAR: 0.3 }, _meta: { recent: [], seen: [] } } },
  { name: "bored", profile: { long: { SEDUCTIVE: 0.7 }, session: {}, _meta: { recent: [], seen: [], fatigue: 9 } }, epsilonActive: true },
  { name: "safe-mode", profile: { long: { ARCHIVAL: 0.6, STATEMENT: 0.4 }, session: {}, _meta: { recent: [], seen: [] } }, novelty: "safe" },
];

const pool = await getDiscoverablePool({ limit: 5000 });
const popularity = await getPopularitySnapshot();

const report = { arm: ARM, scenarios: {} };
for (const s of SCENARIOS) {
  const recent = s.profile._meta.recent || [];
  const edges = recent.length ? await getEdges(recent) : {};
  const { items } = buildFeed({
    profile: structuredClone(s.profile),
    epsilonActive: !!s.epsilonActive, novelty: s.novelty,
    edges, popularity, limit: 60,
  }, pool);
  const sequence = items.map((it) => [it.id, it._score, it._zone]);
  const attributed = items.filter((it) => WHITELIST.has(it._bridge));
  const coreOk = items.filter((it) => it._zone === "core").every((it) => CORE.has(it._bridge));
  const zonedOk = items.filter((it) => it._zone !== "core").every((it) => ["discovery-adjacent", "discovery-crossuser", "reach"].includes(it._bridge));
  report.scenarios[s.name] = {
    served: items.length,
    attributed: attributed.length,
    coreOk, zonedOk,
    bridges: items.reduce((m, it) => { if (it._bridge) m[it._bridge] = (m[it._bridge] || 0) + 1; return m; }, {}),
    sequence,
  };
  console.log(`${ARM} ${s.name.padEnd(16)} served ${items.length} attributed ${attributed.length} core-taxonomy ${coreOk} zoned-taxonomy ${zonedOk}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(here, `.attribution-${ARM}.json`), JSON.stringify(report, null, 2));

if (ARM === "after") {
  const base = JSON.parse(fs.readFileSync(path.join(here, ".attribution-baseline.json"), "utf8"));
  let identical = 0, covered = 0;
  for (const [name, s] of Object.entries(report.scenarios)) {
    const b = base.scenarios[name];
    const same = b && JSON.stringify(b.sequence) === JSON.stringify(s.sequence);
    if (same) identical++; else console.log(`BYTE-IDENTITY BROKEN: ${name}`);
    if (s.attributed === s.served && s.coreOk && s.zonedOk) covered++;
    else console.log(`COVERAGE GAP: ${name} (${s.attributed}/${s.served})`);
  }
  const n = Object.keys(report.scenarios).length;
  console.log(`VERDICT: byte-identity ${identical}/${n}; full attribution coverage ${covered}/${n}`);
}
console.log("done");
