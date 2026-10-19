// lib/db/core/popularity.js — ENGAGEMENT AND EXPOSURE COUNTERS.
//
// Two numbers per item that mean different things. `eng`/`imp` are RAW events,
// never deduped, diagnostic only. `engagers`/`viewers` are PEOPLE, deduped by
// identityHash, and they are what scoring is allowed to read — the distinction
// is the whole point of the table.
//
// Decay is optional and detected, not assumed: hasDecayColumns() decides
// whether the decayed columns exist, and until the migration runs the same code
// falls back to lifetime counts. writePopularity takes a query target for the
// same reason writeEdges does.

import { decayFactor, decayedSum, halfLifeMs, popularityDedupEnabled } from "../../brain/popularity.js";
import { getPool, hasDecayColumns } from "./pool.js";
import { identityHash, mem } from "./store.js";

// ---- Popularity counters (TikTok-style engagement/exposure) --------------------

export async function bumpPopularity(entries = [], userId = null) {
  if (!entries.length) return;
  const p = await getPool();
  if (!p) {
    // Mirrors the Postgres path exactly. If the ledger existed on only one
    // path, preview deploys, local dev and most tests would run the ungated
    // rule while reporting success.
    const hash = userId ? identityHash(userId) : null;
    for (const { id, eng = 0, imp = 0 } of entries) {
      if (!id) continue;
      const cur = mem.popularity.get(id) || { eng: 0, imp: 0, engagers: 0, viewers: 0, by: new Map() };
      cur.eng += Number(eng) || 0;   // diagnostic: raw events, never deduped
      cur.imp += Number(imp) || 0;
      if (popularityDedupEnabled() && hash) {
        const prior = cur.by.get(hash) || { engaged: false, viewed: false };
        const now = Date.now();
        const next = {
          engaged: prior.engaged || (Number(eng) || 0) > 0,
          viewed: prior.viewed || (Number(imp) || 0) > 0,
          // (r25) first_seen, mirroring the Postgres column. Set once: a
          // returning identity is the same person, and refreshing the stamp
          // would let one identity keep an item permanently fresh by coming
          // back — reintroducing the repetition-is-worthless property's exact
          // inverse in the time dimension.
          engagedAt: prior.engagedAt ?? ((Number(eng) || 0) > 0 ? now : undefined),
          viewedAt: prior.viewedAt ?? ((Number(imp) || 0) > 0 ? now : undefined),
        };
        cur.by.set(hash, next);
        let engagers = 0, viewers = 0;
        for (const v of cur.by.values()) { if (v.engaged) engagers++; if (v.viewed) viewers++; }
        cur.engagers = engagers;
        cur.viewers = viewers;
      }
      mem.popularity.set(id, cur);
    }
    return;
  }
  await writePopularity(p, entries, userId);
}

// Returns { itemId: { eng, imp } } for the most-engaged items.
export async function getPopularity(limit = 5000) {
  limit = Math.max(1, Math.min(10000, Math.trunc(Number(limit)) || 5000));
  const p = await getPool();
  const out = {};
  if (!p) {
    // COPIES, not live references: these objects are the scoring input, and
    // handing out the stored object let a concurrent write change a count
    // between the scoring of item 3 and item 40 within one assembly — a
    // non-deterministic ranking, on the path most tests run.
    const rows = [...mem.popularity.entries()]
      .sort((x, y) => (y[1].engagers || 0) - (x[1].engagers || 0) || (y[1].eng || 0) - (x[1].eng || 0))
      .slice(0, limit);
    const now = Date.now();
    for (const [id, v] of rows) {
      // (r25) The DEFINITION, computed straight from the ledger: no
      // materialization to go stale, because a mem store is small by nature.
      const engagedAt = [], viewedAt = [];
      for (const c of (v.by || new Map()).values()) {
        if (c.engaged && c.engagedAt !== undefined) engagedAt.push(c.engagedAt);
        if (c.viewed && c.viewedAt !== undefined) viewedAt.push(c.viewedAt);
      }
      out[id] = {
        eng: v.eng || 0, imp: v.imp || 0,
        engagers: v.engagers || 0, viewers: v.viewers || 0,
        engagersDecayed: decayedSum(engagedAt, now),
        viewersDecayed: decayedSum(viewedAt, now),
      };
    }
    return out;
  }
  // (r25) engagers_decayed / viewers_decayed are the sum as of decayed_at;
  // one multiplication carries it to now (see lib/brain/popularity.js on why
  // the exponential factors). Feature-detected, so this is safe to run before
  // the v25 migration is applied — until then the decayed fields are absent
  // and scoring falls back to lifetime counts.
  const decayCols = await hasDecayColumns(p);
  const { rows } = await p.query(
    decayCols
      ? "SELECT item_id,eng,imp,engagers,viewers,engagers_decayed,viewers_decayed,decayed_at FROM popularity ORDER BY engagers DESC, eng DESC LIMIT $1"
      : "SELECT item_id,eng,imp,engagers,viewers FROM popularity ORDER BY engagers DESC, eng DESC LIMIT $1",
    [limit]
  );
  const nowMs = Date.now();
  for (const r of rows) {
    out[r.item_id] = {
      eng: Number(r.eng), imp: Number(r.imp),
      engagers: Number(r.engagers), viewers: Number(r.viewers),
    };
    if (decayCols && r.decayed_at) {
      const f = decayFactor(nowMs - new Date(r.decayed_at).getTime());
      out[r.item_id].engagersDecayed = Number(r.engagers_decayed) * f;
      out[r.item_id].viewersDecayed = Number(r.viewers_decayed) * f;
    }
  }
  return out;
}

export async function writePopularity(target, entries = [], userId = null) {
  const clean = entries.filter(({ id }) => id).map(({ id, eng = 0, imp = 0 }) => ({
    id, eng: Number(eng) || 0, imp: Number(imp) || 0,
  }));
  if (!clean.length) return;

  const runRaw = (q) => q(
    `WITH input AS (
       SELECT id,sum(eng)::real AS eng,sum(imp)::real AS imp
       FROM jsonb_to_recordset($1::jsonb) AS x(id text,eng real,imp real) GROUP BY id
     ) INSERT INTO popularity (item_id,eng,imp,updated_at) SELECT id,eng,imp,now() FROM input
     ON CONFLICT (item_id) DO UPDATE SET eng=popularity.eng+EXCLUDED.eng,
       imp=popularity.imp+EXCLUDED.imp,updated_at=now()`, [JSON.stringify(clean)]
  );

  if (!popularityDedupEnabled() || !userId) {
    await runRaw((text, params) => target.query(text, params));
    return;
  }

  // eng/imp stay as diagnostics (and as an abuse fingerprint: a 120:1
  // eng-to-engagers ratio is a signature). engagers/viewers are what ranking
  // reads, and the ledger's primary key is what makes repetition worthless.
  //
  // TWO statements, then the recompute — the v22 lesson: CTEs in a single
  // statement read a snapshot from statement start, so a recompute fused onto
  // the ledger insert cannot see the row it just wrote.
  const hash = identityHash(userId);
  const ledger = clean.map(({ id, eng, imp }) => ({
    id, engaged: eng > 0, viewed: imp > 0,
  })).filter((r) => r.engaged || r.viewed);

  const run = async (q) => {
    await runRaw(q);
    if (!ledger.length) return;
    await q(
      `WITH input AS (
         SELECT id, bool_or(engaged) AS engaged, bool_or(viewed) AS viewed
         FROM jsonb_to_recordset($1::jsonb) AS x(id text, engaged boolean, viewed boolean)
         GROUP BY id
       )
       INSERT INTO popularity_contributors (item_id, identity_hash, engaged, viewed)
       SELECT id, $2, engaged, viewed FROM input
       ON CONFLICT (item_id, identity_hash) DO UPDATE SET
         engaged = popularity_contributors.engaged OR EXCLUDED.engaged,
         viewed  = popularity_contributors.viewed  OR EXCLUDED.viewed`,
      [JSON.stringify(ledger), hash]
    );
    // (r25) The recompute now also materializes the RECENCY-WEIGHTED sums, as
    // of now(), which is stamped into decayed_at. Because the exponential
    // factors, a single multiplication at read time carries these to any later
    // instant — so this stays a write-time cost over the touched items only,
    // never a per-read scan of the ledger. Recomputed from the ledger on every
    // touch, so the materialized value cannot drift away from the definition.
    const decayCols = await hasDecayColumns({ query: (t, pr) => q(t, pr) })
      .catch(() => false);
    const halfLifeSeconds = halfLifeMs() / 1000;
    await q(
      decayCols
        ? `WITH touched AS (
             SELECT DISTINCT id FROM jsonb_to_recordset($1::jsonb) AS x(id text)
           ), agg AS (
             SELECT t.id,
                    count(*) FILTER (WHERE c.engaged) ::int AS engagers,
                    count(*) FILTER (WHERE c.viewed)  ::int AS viewers,
                    COALESCE(sum(power(0.5, extract(epoch FROM (now() - c.first_seen)) / $2::float8))
                             FILTER (WHERE c.engaged), 0) AS engagers_decayed,
                    COALESCE(sum(power(0.5, extract(epoch FROM (now() - c.first_seen)) / $2::float8))
                             FILTER (WHERE c.viewed), 0) AS viewers_decayed
             FROM touched t LEFT JOIN popularity_contributors c ON c.item_id = t.id
             GROUP BY t.id
           )
           UPDATE popularity p SET engagers = agg.engagers, viewers = agg.viewers,
             engagers_decayed = agg.engagers_decayed,
             viewers_decayed = agg.viewers_decayed,
             decayed_at = now()
           FROM agg WHERE p.item_id = agg.id`
        : `WITH touched AS (
             SELECT DISTINCT id FROM jsonb_to_recordset($1::jsonb) AS x(id text)
           ), agg AS (
             SELECT t.id,
                    count(*) FILTER (WHERE c.engaged) ::int AS engagers,
                    count(*) FILTER (WHERE c.viewed)  ::int AS viewers
             FROM touched t LEFT JOIN popularity_contributors c ON c.item_id = t.id
             GROUP BY t.id
           )
           UPDATE popularity p SET engagers = agg.engagers, viewers = agg.viewers
           FROM agg WHERE p.item_id = agg.id`,
      decayCols
        ? [JSON.stringify(ledger.map(({ id }) => ({ id }))), halfLifeSeconds]
        : [JSON.stringify(ledger.map(({ id }) => ({ id })))]
    );
  };

  // A pooled CLIENT also exposes .connect() — only a Pool lacks .release().
  const isPool = typeof target.connect === "function" && typeof target.release !== "function";
  if (isPool) {
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      await run((text, params) => client.query(text, params));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  await run((text, params) => target.query(text, params));
}
