// scripts/backfill-edge-contributors.mjs — rebuild the gamma corroboration
// ledger from the canonical event history.
//
// WHY. The Aug-15 audit found the gamma bridge inert on production: 2,632
// edges, every one at contributors = 0, so edgeStrength() returns 0 and
// getEdges answers every anchor with nothing. schema-v22 deliberately did not
// grandfather historical rows, on the correct grounds that inferring
// contributors from `w` would fabricate history — and because the poisoning
// attack inflates `w`, such an inference would hand the highest trust to the
// most-likely-poisoned edges.
//
// This does NOT infer from w. It replays `user_events`, which is the same
// evidence the live path writes from, and derives distinct-identity
// corroboration the way app/api/interaction/route.js derives it:
//
//   * only POSITIVE actions count, at the live weights
//       bag 2 · share 1.5 · save 1 · favorite 1
//   * a positive on item b pairs with that identity's CO_ENGAGE_SPAN (5) most
//     recent DISTINCT prior positives, exactly as `recentBefore.slice()` does
//   * BOTH endpoints must be real catalog products — the r17 guard against
//     `reading:<interpretationId>` pseudo-anchors, which are deterministic and
//     global and would otherwise steer every user who applied that reading
//   * CONTRIB_CAP (8) bounds each pair
//
// CONSERVATIVE BY CONSTRUCTION: it only ever touches pairs that ALREADY exist
// in `edges`. It cannot invent an edge, only restore the trust signal for one
// the system already built. The recent-ring state at each historical moment
// cannot be reconstructed exactly (the ring decays and rotates), so this is a
// reconstruction, not a replay to the byte — and it errs toward fewer
// contributors, never more.
//
// It then runs the SAME two statements writeEdges runs, so `edges` is
// recomputed from the ledger. That is the documented healing path: a poisoned
// w is replaced by the honest ledger sum. Expect w to CHANGE, and to fall.
//
// USAGE
//   node scripts/backfill-edge-contributors.mjs              # dry run (default)
//   node scripts/backfill-edge-contributors.mjs --apply      # write, in one transaction
//
// ROLLBACK. Before this runs, every edge sits at contributors = 0 and
// edge_contributors is empty — the script refuses to --apply unless that is
// still true, so the undo is exact and needs no snapshot:
//   DELETE FROM edge_contributors;
//   UPDATE edges SET contributors = 0, w = <pre-backfill w>;
// The pre-backfill w values are written to the report file below before any
// write, precisely so that second statement is reconstructible.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const REPORT = path.join(process.cwd(), "backfill-edge-contributors.report.json");

const EVENT_WEIGHT = {
  USER_ADDED_TO_BAG: 2,
  USER_SHARED_ITEM: 1.5,
  USER_SAVED_ITEM: 1,
  USER_FAVORITED_ITEM: 1,
};
const CO_ENGAGE_SPAN = 5;
const CONTRIB_CAP = 8;

const identityHash = (userId) =>
  createHash("sha256").update(String(userId || "")).digest("hex");

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env.local or env).");
    process.exit(1);
  }
  const { getPool } = await import("../lib/db/index.js");
  const pool = await getPool();
  if (!pool) { console.error("no Postgres pool — nothing to back-fill."); process.exit(1); }

  // ---- preconditions -------------------------------------------------------
  const { rows: [pre] } = await pool.query(`
    SELECT (SELECT count(*)::int FROM edges) edges,
           (SELECT count(*)::int FROM edges WHERE contributors > 0) already,
           (SELECT count(*)::int FROM edge_contributors) ledger`);
  console.log(`edges ${pre.edges} · already corroborated ${pre.already} · ledger rows ${pre.ledger}`);
  if (APPLY && (pre.already > 0 || pre.ledger > 0)) {
    console.error("\nREFUSING TO APPLY: the ledger is not empty, so the documented");
    console.error("rollback (delete all, reset to 0) would destroy real corroboration.");
    console.error("Inspect edge_contributors and decide deliberately.");
    process.exit(1);
  }

  // ---- evidence ------------------------------------------------------------
  const { rows: events } = await pool.query(
    `SELECT user_id, type, payload->>'itemId' AS item, at
     FROM user_events
     WHERE type = ANY($1) AND payload->>'itemId' IS NOT NULL
     ORDER BY user_id, at ASC`,
    [Object.keys(EVENT_WEIGHT)]
  );
  const { rows: catalogRows } = await pool.query("SELECT id FROM items");
  const catalog = new Set(catalogRows.map((r) => r.id));
  const { rows: edgeRows } = await pool.query("SELECT a, b, w FROM edges");
  const existing = new Set(edgeRows.map((r) => `${r.a}|${r.b}`));
  console.log(`evidence: ${events.length} positive events · ${catalog.size} catalog items · ${existing.size} existing edges`);

  // ---- reconstruction ------------------------------------------------------
  // best[pairKey][identityHash] = that identity's strongest weight for the pair
  const best = new Map();
  let recent = [];
  let currentUser = null;
  let skippedPhantom = 0;

  const remember = (pairKey, hash, w) => {
    let perIdentity = best.get(pairKey);
    if (!perIdentity) best.set(pairKey, (perIdentity = new Map()));
    if (!perIdentity.has(hash) || perIdentity.get(hash) < w) perIdentity.set(hash, w);
  };

  for (const ev of events) {
    if (ev.user_id !== currentUser) { currentUser = ev.user_id; recent = []; }
    const b = ev.item;
    const w = EVENT_WEIGHT[ev.type];
    if (!catalog.has(b)) { skippedPhantom++; continue; }
    const hash = identityHash(ev.user_id);
    for (const a of recent.slice(0, CO_ENGAGE_SPAN)) {
      if (a === b || !catalog.has(a)) continue;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const key = `${lo}|${hi}`;
      if (!existing.has(key)) continue;      // never invent an edge
      remember(key, hash, w);
    }
    recent = [b, ...recent.filter((id) => id !== b)].slice(0, CO_ENGAGE_SPAN);
  }

  // CONTRIB_CAP, deterministically: strongest contributors first, hash breaking ties.
  const ledger = [];
  let cappedPairs = 0;
  for (const [key, perIdentity] of best) {
    const [a, b] = key.split("|");
    const ranked = [...perIdentity.entries()]
      .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
    if (ranked.length > CONTRIB_CAP) cappedPairs++;
    for (const [hash, w] of ranked.slice(0, CONTRIB_CAP)) ledger.push({ a, b, identity_hash: hash, w });
  }

  const pairs = best.size;
  const contributorCounts = [...best.values()].map((m) => Math.min(CONTRIB_CAP, m.size));
  const distribution = contributorCounts.reduce((acc, n) => (acc[n] = (acc[n] || 0) + 1, acc), {});
  console.log(`\nreconstructed: ${pairs} of ${existing.size} existing edges gain contributors`);
  console.log(`ledger rows: ${ledger.length} · pairs hitting CONTRIB_CAP: ${cappedPairs}`);
  console.log(`contributors per pair:`, JSON.stringify(distribution));
  console.log(`events on non-catalog items skipped: ${skippedPhantom}`);
  console.log(`edges left at contributors = 0: ${existing.size - pairs}`);

  fs.writeFileSync(REPORT, JSON.stringify({
    generatedFor: APPLY ? "apply" : "dry-run",
    preState: pre,
    reconstructed: { pairs, ledgerRows: ledger.length, cappedPairs, distribution, skippedPhantom },
    // The undo for `edges.w`, captured BEFORE any write.
    priorEdgeWeights: edgeRows.map((r) => ({ a: r.a, b: r.b, w: Number(r.w) })),
  }, null, 2));
  console.log(`\nreport (includes prior w for rollback): ${path.relative(process.cwd(), REPORT)}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    await pool.end();
    return;
  }

  // ---- write ---------------------------------------------------------------
  // One transaction, and the same two statements writeEdges uses: the insert
  // must be VISIBLE to the recompute, which is why they are separate.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO edge_contributors (a,b,identity_hash,w)
       SELECT a,b,identity_hash,w
       FROM jsonb_to_recordset($1::jsonb) AS x(a text, b text, identity_hash text, w real)
       ON CONFLICT (a,b,identity_hash)
         DO UPDATE SET w = GREATEST(edge_contributors.w, EXCLUDED.w)`,
      [JSON.stringify(ledger)]
    );
    const { rowCount } = await client.query(
      `WITH agg AS (
         SELECT c.a, c.b, sum(c.w)::real AS w, count(c.identity_hash)::int AS contributors
         FROM edge_contributors c GROUP BY c.a, c.b
       )
       UPDATE edges e
         SET w = agg.w, contributors = LEAST($1::int, agg.contributors)
       FROM agg WHERE e.a = agg.a AND e.b = agg.b`,
      [CONTRIB_CAP]
    );
    await client.query("COMMIT");
    console.log(`\nAPPLIED: ${ledger.length} ledger rows, ${rowCount} edges recomputed.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\nROLLED BACK:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }

  const { rows: [post] } = await pool.query(`
    SELECT count(*)::int edges,
           count(*) FILTER (WHERE contributors > 0)::int corroborated,
           round(max(w)::numeric,1) max_w
    FROM edges`);
  console.log("after:", JSON.stringify(post));
  await pool.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
