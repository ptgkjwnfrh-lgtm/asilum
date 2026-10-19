// lib/db/core/graph.js — THE CO-ENGAGEMENT GRAPH.
//
// Edges join items the same person engaged with close together in a session,
// or saved to the same board — board co-membership is the strongest signal we
// have that two pieces belong to one taste.
//
// AN EDGE IS NOT A VOTE, IT IS A COUNT OF PEOPLE. The contributor ledger keyed
// by identityHash is what stops one enthusiastic user from manufacturing a
// strong edge alone, and it is the first identity-linked row in this graph, so
// erasure has to reach it (see store.js). writeEdges takes a query TARGET, not
// a pool, so a caller inside a transaction writes the edges in that same
// transaction — passing the pool instead was a real production bug.

import { CONTRIB_CAP, EDGE_FANOUT_CAP, MEM_EDGES_CAP, canonicalPair, corroborationEnabled, edgeStrength } from "../../brain/edges.js";
import { edgeKey, identityHash, mem } from "./store.js";
import { getPool } from "./pool.js";

// ---- Co-engagement graph (Pinterest-style taste graph) -------------------------
// Edges connect items the same person engaged with close together in a session,
// or saved to the same board (board co-membership — the strongest signal).

export async function bumpEdges(pairs = [], userId = null) {
  if (!pairs.length) return;
  const p = await getPool();
  if (!p) {
    // The mem path is what preview deploys, local dev and most tests run on.
    // If the ledger existed only on Postgres, every one of those would run the
    // ungated rule while reporting success — so it mirrors exactly.
    const hash = userId ? identityHash(userId) : null;
    const best = new Map();
    for (const { a, b, w = 1 } of pairs) {
      if (!a || !b || a === b) continue;
      const weight = Number(w) || 0;
      if (weight <= 0) continue;
      const k = edgeKey(a, b);
      if (!best.has(k) || weight > best.get(k)) best.set(k, weight);
    }
    for (const [k, weight] of best) {
      const edge = mem.edges.get(k) || { w: 0, contributors: 0, by: new Map() };
      if (!corroborationEnabled() || !hash) {
        edge.w += weight;
      } else {
        const known = edge.by.has(hash);
        if (!known && edge.by.size >= CONTRIB_CAP) { mem.edges.set(k, edge); continue; }
        const prior = edge.by.get(hash) || 0;
        if (weight > prior) edge.by.set(hash, weight);
        edge.w = [...edge.by.values()].reduce((t, v) => t + v, 0);
        edge.contributors = edge.by.size;
      }
      mem.edges.set(k, edge);
    }
    // Bounded like mem.events/mem.operations: evict the least-corroborated
    // first, oldest-inserted breaking ties (Map preserves insertion order).
    if (mem.edges.size > MEM_EDGES_CAP) {
      const ranked = [...mem.edges.entries()].sort(
        (x, y) => (x[1].contributors || 0) - (y[1].contributors || 0) || (x[1].w || 0) - (y[1].w || 0));
      for (const [k] of ranked.slice(0, mem.edges.size - MEM_EDGES_CAP)) mem.edges.delete(k);
    }
    return;
  }
  await writeEdges(p, pairs, userId);
}

// Neighborhood lookup: for each requested id, its neighbors and edge weights.
// Returns { id: { neighborId: weight } }.
// Returns { anchorId: { neighborId: strength } } where STRENGTH is the
// distinct-contributor count (lib/brain/edges.js explains why), or the legacy
// summed weight when BRAIN_EDGE_CORROBORATION=0.
//
// Bounded PER ANCHOR, not globally: a global LIMIT would let one hot anchor
// consume the budget and starve the other 99 requested ids, which would be a
// new correctness bug rather than a fix. gammaScore takes a max over anchors,
// so per-anchor top-K is near-lossless. Ordering is corroboration first, then
// weight, then id — deterministic, so the same state returns the same map.
export async function getEdges(ids = []) {
  const out = {};
  ids = [...new Set(ids.map(String).filter(Boolean))].slice(0, 100);
  if (!ids.length) return out;
  const want = new Set(ids);
  const rank = (row) => [-(row.contributors || 0), -(row.w || 0), row.a, row.b];
  const cmp = (x, y) => {
    const rx = rank(x), ry = rank(y);
    for (let i = 0; i < rx.length; i++) { if (rx[i] < ry[i]) return -1; if (rx[i] > ry[i]) return 1; }
    return 0;
  };
  const collect = (rows) => {
    const perAnchor = new Map();
    for (const r of rows) {
      for (const anchor of [r.a, r.b]) {
        if (!want.has(anchor)) continue;
        if (!perAnchor.has(anchor)) perAnchor.set(anchor, []);
        perAnchor.get(anchor).push(r);
      }
    }
    for (const [anchor, rows2] of perAnchor) {
      rows2.sort(cmp);
      const bucket = (out[anchor] = out[anchor] || {});
      for (const r of rows2.slice(0, EDGE_FANOUT_CAP)) {
        const other = r.a === anchor ? r.b : r.a;
        const strength = edgeStrength(r);
        if (strength > 0) bucket[other] = strength;
      }
    }
  };
  const p = await getPool();
  if (!p) {
    const rows = [];
    for (const [k, edge] of mem.edges) {
      const i = k.indexOf("|");
      const a = k.slice(0, i), b = k.slice(i + 1);
      if (!want.has(a) && !want.has(b)) continue;
      rows.push({ a, b, w: edge.w || 0, contributors: edge.contributors || 0 });
    }
    collect(rows);
    return out;
  }
  // LATERAL per anchor so each requested id gets its own top-K budget.
  const { rows } = await p.query(
    `SELECT DISTINCT e.a, e.b, e.w, e.contributors
     FROM unnest($1::text[]) AS anchor(id)
     CROSS JOIN LATERAL (
       SELECT a,b,w,contributors FROM edges
       WHERE a = anchor.id OR b = anchor.id
       ORDER BY contributors DESC, w DESC, a ASC, b ASC
       LIMIT $2
     ) e`,
    [ids, EDGE_FANOUT_CAP]
  );
  collect(rows.map((r) => ({ a: r.a, b: r.b, w: Number(r.w), contributors: Number(r.contributors) })));
  return out;
}

export async function writeEdges(target, pairs = [], userId = null) {
  // One canonical row per pair, and within ONE request a contributor's
  // strongest action for that pair wins (max, not sum) — repetition inside a
  // batch was the cheapest half of the forgery.
  const best = new Map();
  for (const { a, b, w = 1 } of pairs) {
    if (!a || !b || a === b) continue;
    const key = canonicalPair(a, b);
    const weight = Number(w) || 0;
    if (weight <= 0) continue;
    const k = key.a + "|" + key.b;
    const prev = best.get(k);
    if (!prev || weight > prev.w) best.set(k, { a: key.a, b: key.b, w: weight });
  }
  const clean = [...best.values()];
  if (!clean.length) return;

  if (!corroborationEnabled() || !userId) {
    // Legacy path (BRAIN_EDGE_CORROBORATION=0), byte-for-byte the old rule.
    await target.query(
      `WITH input AS (
         SELECT a,b,sum(w)::real AS w FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text,w real) GROUP BY a,b
       ) INSERT INTO edges (a,b,w) SELECT a,b,w FROM input
       ON CONFLICT (a,b) DO UPDATE SET w=edges.w+EXCLUDED.w`, [JSON.stringify(clean)]
    );
    return;
  }

  const hash = identityHash(userId);
  // `edges` is a MATERIALIZED VIEW of the ledger: w is the sum of each
  // contributor's best weight for the pair, contributors is the distinct
  // count. TWO statements, deliberately: CTEs in a single statement read a
  // snapshot taken at statement start, so a recompute fused onto the insert
  // cannot see the row it just wrote and lags by exactly one contributor
  // (CI caught this: three distinct people scored 2). Splitting them inside
  // the transaction makes the write visible to the recompute.
  //
  // Recompute rather than delta-arithmetic because a repeat contributor
  // RAISING their best (favorite → bag) must move w by the difference, and
  // ON CONFLICT cannot see the pre-update value in RETURNING. It is
  // idempotent, and it HEALS the historical rows: a poisoned w is replaced by
  // the honest ledger sum the first time the pair is touched again.
  //
  // CONTRIB_CAP bounds storage: past the cap the curve is flat, so a new
  // identity's row would buy no ranking and cost a row. Existing contributors
  // may always update their own.
  const runBoth = async (q) => {
    await q(
      `WITH input AS (
         SELECT a,b,max(w)::real AS w
         FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text,w real) GROUP BY a,b
       ), allowed AS (
         SELECT i.* FROM input i
         LEFT JOIN edges e ON e.a = i.a AND e.b = i.b
         WHERE COALESCE(e.contributors, 0) < $3::int
            OR EXISTS (SELECT 1 FROM edge_contributors c
                       WHERE c.a = i.a AND c.b = i.b AND c.identity_hash = $2)
       )
       INSERT INTO edge_contributors (a,b,identity_hash,w)
       SELECT a,b,$2,w FROM allowed
       ON CONFLICT (a,b,identity_hash)
         DO UPDATE SET w = GREATEST(edge_contributors.w, EXCLUDED.w)`,
      [JSON.stringify(clean), hash, CONTRIB_CAP]
    );
    await q(
      `WITH touched AS (
         SELECT DISTINCT a,b FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text)
       ), agg AS (
         SELECT t.a, t.b,
                COALESCE(sum(c.w),0)::real AS w,
                count(c.identity_hash)::int AS contributors
         FROM touched t LEFT JOIN edge_contributors c ON c.a = t.a AND c.b = t.b
         GROUP BY t.a, t.b
       )
       INSERT INTO edges (a,b,w,contributors)
       SELECT a, b, w, LEAST($2::int, contributors) FROM agg WHERE contributors > 0
       ON CONFLICT (a,b) DO UPDATE
         SET w = EXCLUDED.w, contributors = EXCLUDED.contributors`,
      [JSON.stringify(clean.map(({ a, b }) => ({ a, b }))), CONTRIB_CAP]
    );
  };

  // A pooled CLIENT also has .connect() — calling it throws "Client has
  // already been connected". Only a Pool hands out clients, and only a
  // pooled client has .release(), so that is the discriminating test.
  const isPool = typeof target.connect === "function" && typeof target.release !== "function";
  if (isPool) {
    // Standalone caller (a pool): the two statements need their own
    // transaction or a crash between them leaves the view stale.
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      await runBoth((text, params) => client.query(text, params));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  await runBoth((text, params) => target.query(text, params));
}
