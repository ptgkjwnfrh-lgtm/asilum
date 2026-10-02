// lib/db/production/ebayFeed.js — the eBay feed publisher's two writers
// (schema v56): the STALE-GUARDED item upsert and the per-file CHECKPOINT.
// SERVER-ONLY. Memory mode mirrors both so the publisher's laws are the same
// with no database (mem/Postgres parity).
//
// THE STALE GUARD. upsertItems (lib/db/core/items.js) overwrites on
// conflict, unconditionally — right for a search sync, wrong for bulk files
// that arrive out of order: a bootstrap re-run after a daily file would put
// last week's price back. Here a row is written only when its observation
// is newer than the row's, or the same moment with a sellerItemRevision that
// is not older. A row that has never been observed by a feed (NULL) takes
// the first feed row that reaches it. The query reports which ids it wrote,
// so the publisher counts stale rows honestly instead of calling every
// upsert a success.

import { getPool } from "../core/pool.js";
import { mem } from "../core/store.js";

const FEED_COLUMNS = `id,title,brand,price,currency,tags,img,alt,source,designers,category,era,size,url,
  source_name,source_product_id,source_product_url,slug,description,subcategory,color,
  material,fit,silhouette,condition,decade,color_evidence,is_available,availability_status,
  source_observed_at,source_revision`;

function revisionNumber(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** Pure: does `incoming` beat `current` under the stale law? Exported so the
 *  memory mirror and the tests read the same rule the SQL encodes. */
export function observationWins(incoming, current) {
  if (!current || !current.source_observed_at) return true;
  if (!incoming.source_observed_at) return false;
  const a = Date.parse(incoming.source_observed_at), b = Date.parse(current.source_observed_at);
  if (a > b) return true;
  if (a < b) return false;
  const ra = revisionNumber(incoming.source_revision), rb = revisionNumber(current.source_revision);
  if (ra === null || rb === null) return true;
  return ra >= rb;
}

/**
 * Upsert feed rows with the stale guard. Returns { written: [ids], stale: n }.
 * Rows are catalog-shaped (normalizeSourceProduct output) plus
 * source_observed_at (ISO) and source_revision (string|null).
 */
export async function upsertFeedItems(rows = []) {
  const clean = rows.filter((r) => r && r.id).slice(0, 5000);
  if (!clean.length) return { written: [], stale: 0 };
  const p = await getPool();
  if (!p) {
    const written = [];
    for (const it of clean) {
      const cur = mem.items.get(it.id);
      if (observationWins(it, cur)) { mem.items.set(it.id, it); written.push(it.id); }
    }
    return { written, stale: clean.length - written.length };
  }
  const payload = clean.map((it) => ({
    ...it,
    tags: it.tags || {}, designers: it.designers || [], era: it.era || null, size: it.size || null,
    source: it.source || it.source_name || null, source_name: it.source_name || it.source || null,
    source_product_url: it.source_product_url || it.url || null,
    color_evidence: it.color_evidence || it.colorEvidence || {},
    url: it.url || it.source_product_url || null,
    is_available: it.is_available !== false,
    availability_status: it.availability_status || "unknown",
    source_observed_at: it.source_observed_at || null,
    source_revision: it.source_revision == null ? null : String(it.source_revision).slice(0, 40),
  }));
  const { rows: out } = await p.query(
    `INSERT INTO items (${FEED_COLUMNS},last_synced_at,updated_at)
     SELECT id,title,brand,price,currency,COALESCE(tags,'{}'::jsonb),img,alt,source,
            COALESCE(designers,'[]'::jsonb),category,era,size,url,source_name,source_product_id,
            source_product_url,slug,description,subcategory,color,material,fit,silhouette,
            condition,decade,COALESCE(color_evidence,'{}'::jsonb),COALESCE(is_available,true),
            COALESCE(availability_status,'unknown'),source_observed_at,source_revision,now(),now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text,title text,brand text,price numeric,currency text,tags jsonb,img text,alt text,
       source text,designers jsonb,category text,era jsonb,size jsonb,url text,source_name text,
       source_product_id text,source_product_url text,slug text,description text,subcategory text,
       color text,material text,fit text,silhouette text,condition text,decade text,color_evidence jsonb,
       is_available boolean,availability_status text,source_observed_at timestamptz,source_revision text)
     ON CONFLICT (id) DO UPDATE SET
       title=EXCLUDED.title,brand=EXCLUDED.brand,price=EXCLUDED.price,currency=EXCLUDED.currency,
       tags=EXCLUDED.tags,img=EXCLUDED.img,alt=EXCLUDED.alt,source=EXCLUDED.source,
       designers=EXCLUDED.designers,category=EXCLUDED.category,era=EXCLUDED.era,size=EXCLUDED.size,
       url=EXCLUDED.url,source_name=EXCLUDED.source_name,source_product_id=EXCLUDED.source_product_id,
       source_product_url=EXCLUDED.source_product_url,slug=EXCLUDED.slug,description=EXCLUDED.description,
       subcategory=EXCLUDED.subcategory,color=EXCLUDED.color,material=EXCLUDED.material,fit=EXCLUDED.fit,
       silhouette=EXCLUDED.silhouette,condition=EXCLUDED.condition,decade=EXCLUDED.decade,
       color_evidence=EXCLUDED.color_evidence,is_available=EXCLUDED.is_available,
       availability_status=EXCLUDED.availability_status,
       source_observed_at=EXCLUDED.source_observed_at,source_revision=EXCLUDED.source_revision,
       last_synced_at=now(),updated_at=now()
     WHERE items.source_observed_at IS NULL
        OR EXCLUDED.source_observed_at > items.source_observed_at
        OR (EXCLUDED.source_observed_at = items.source_observed_at
            AND (NULLIF(regexp_replace(COALESCE(EXCLUDED.source_revision,''),'\\D','','g'),'') IS NULL
                 OR NULLIF(regexp_replace(COALESCE(items.source_revision,''),'\\D','','g'),'') IS NULL
                 OR NULLIF(regexp_replace(EXCLUDED.source_revision,'\\D','','g'),'')::numeric
                    >= NULLIF(regexp_replace(items.source_revision,'\\D','','g'),'')::numeric))
     RETURNING id`,
    [JSON.stringify(payload)]
  );
  const written = out.map((r) => r.id);
  return { written, stale: clean.length - written.length };
}

// ---- checkpoints -----------------------------------------------------------
const memCheckpoints = new Map(); // sha256 -> row

function cleanCheckpoint(c) {
  return {
    sha256: String(c.sha256 || ""),
    category_id: String(c.categoryId ?? c.category_id ?? ""),
    marketplace: String(c.marketplace || ""),
    feed_scope: String(c.feedScope ?? c.feed_scope ?? ""),
    feed_date: c.feedDate ?? c.feed_date ?? null,
    observed_at: c.observedAt ?? c.observed_at ?? null,
    status: ["running", "done", "failed"].includes(c.status) ? c.status : "running",
    rows_read: Math.max(0, Math.trunc(Number(c.rowsRead ?? c.rows_read) || 0)),
    rows_upserted: Math.max(0, Math.trunc(Number(c.rowsUpserted ?? c.rows_upserted) || 0)),
    rows_stale: Math.max(0, Math.trunc(Number(c.rowsStale ?? c.rows_stale) || 0)),
    rows_rejected: c.rowsRejected && typeof c.rowsRejected === "object" ? c.rowsRejected : (c.rows_rejected || {}),
    last_line: Math.max(0, Math.trunc(Number(c.lastLine ?? c.last_line) || 0)),
    error: c.error == null ? null : String(c.error).slice(0, 400),
    finished_at: c.finishedAt ?? c.finished_at ?? null,
  };
}

export async function readFeedCheckpoint(sha256) {
  const key = String(sha256 || "");
  if (!/^[0-9a-f]{64}$/.test(key)) return null;
  const p = await getPool();
  if (!p) return memCheckpoints.get(key) || null;
  const { rows } = await p.query("SELECT * FROM ebay_feed_checkpoints WHERE sha256 = $1", [key]);
  return rows[0] || null;
}

/** Insert or update the checkpoint — the whole row every time, because a
 *  checkpoint is a statement of where things stand, not a delta. */
export async function writeFeedCheckpoint(c) {
  const row = cleanCheckpoint(c);
  if (!/^[0-9a-f]{64}$/.test(row.sha256)) throw new Error("checkpoint needs the file's sha256");
  const p = await getPool();
  if (!p) {
    const prev = memCheckpoints.get(row.sha256);
    memCheckpoints.set(row.sha256, { ...row, started_at: prev ? prev.started_at : new Date().toISOString(), updated_at: new Date().toISOString() });
    return memCheckpoints.get(row.sha256);
  }
  const { rows } = await p.query(
    `INSERT INTO ebay_feed_checkpoints
       (sha256,category_id,marketplace,feed_scope,feed_date,observed_at,status,rows_read,rows_upserted,rows_stale,rows_rejected,last_line,error,finished_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,now())
     ON CONFLICT (sha256) DO UPDATE SET
       status=EXCLUDED.status,rows_read=EXCLUDED.rows_read,rows_upserted=EXCLUDED.rows_upserted,
       rows_stale=EXCLUDED.rows_stale,rows_rejected=EXCLUDED.rows_rejected,last_line=EXCLUDED.last_line,
       error=EXCLUDED.error,finished_at=EXCLUDED.finished_at,observed_at=EXCLUDED.observed_at,updated_at=now()
     RETURNING *`,
    [row.sha256, row.category_id, row.marketplace, row.feed_scope, row.feed_date, row.observed_at, row.status,
      row.rows_read, row.rows_upserted, row.rows_stale, JSON.stringify(row.rows_rejected), row.last_line, row.error, row.finished_at]
  );
  return rows[0];
}

/** Test seam: forget the memory-mode checkpoints. */
export function resetMemoryCheckpoints() { memCheckpoints.clear(); }
