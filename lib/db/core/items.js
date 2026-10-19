// lib/db/core/items.js — THE CATALOG ROWS THIS LAYER OWNS.
//
// Items ingested through /api/ingest. With none, the feed route falls back to
// the seed catalog, so an empty table is a valid state rather than an outage.
//
// Two things here look like fussiness and are not. Every ordered read carries
// a secondary sort on `id`, because the catalog was bulk-seeded in single
// transactions and whole clusters of rows share a created_at — without the
// tiebreaker the cold-user feed can differ between two identical requests. And
// every read maps `price` through Number(), because pg returns NUMERIC as a
// string and the brain and the price filters both expect a number.

import { getPool } from "./pool.js";
import { mem } from "./store.js";

// ---- Items ------------------------------------------------------------------

// Live items ingested via /api/ingest; with none the feed route falls back to
// the seed catalog.
export async function listItems(limit = 200) {
  limit = Math.max(1, Math.min(5000, Number(limit) || 200));
  const p = await getPool();
  if (!p) return Array.from(mem.items.values()).slice(-limit);
  // Secondary sort on id (audit #28): the catalog was bulk-seeded in one
  // transaction, so ~19 clusters of up to 50 rows share a created_at value.
  // Without a tiebreaker their order is plan-dependent, so the cold-user feed
  // (which reads this list before any personalization) could differ between
  // identical requests. id is unique and stable — same convention the search
  // engine already uses for score ties (lib/search/index.js).
  const { rows } = await p.query("SELECT * FROM items ORDER BY created_at DESC, id LIMIT $1", [limit]);
  // pg returns NUMERIC as string; the brain and price filters expect numbers.
  return rows.map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }));
}

// Indexed candidate retrieval for user-facing search. Text hits and mapped
// product tags are gathered in Postgres so ranking no longer needs to scan the
// newest 5,000 rows in application memory for every query.
//
// Release blocker 0A-5: the old single query mixed text and tag matches under
// ORDER BY text_rank DESC, so past the candidate cap every tag-only match
// (text_rank 0) was truncated by RECENCY, and the cap itself was silent. The
// two channels now retrieve independently — text/brand by rank, tag matches
// by summed evidence confidence — each relevance-preserving under its own
// bound, and the result reports `truncated` so no caller can mistake a capped
// candidate set for the whole catalog. Returns { rows, truncated }.
export async function searchItemCandidates(query, mappedTags = [], limit = 1200) {
  const q = String(query || "").trim().slice(0, 200);
  const tags = [...new Set(mappedTags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))].slice(0, 24);
  limit = Math.max(1, Math.min(2000, Number(limit) || 1200));
  const p = await getPool();
  if (!p) return { rows: Array.from(mem.items.values()).slice(-limit), truncated: false };
  const textLimit = Math.ceil(limit * 0.7);
  const tagLimit = Math.ceil(limit * 0.5);
  const textQuery = p.query(
    `WITH query AS (SELECT websearch_to_tsquery('simple', $1) AS value)
     SELECT i.*,
       ts_rank_cd(i.search_document, query.value, 32) AS text_rank
     FROM items AS i
     CROSS JOIN query
     WHERE i.moderation_status='visible'
       AND i.is_available=true
       AND (i.search_document @@ query.value OR lower(i.brand)=lower($1))
     ORDER BY text_rank DESC, i.created_at DESC
     LIMIT $2`,
    [q, textLimit + 1]
  );
  const tagQuery = tags.length ? p.query(
    `SELECT i.*, 0 AS text_rank
     FROM items AS i
     JOIN (
       SELECT product_id, sum(confidence) AS evidence
       FROM product_tags WHERE tag=ANY($1::text[])
       GROUP BY product_id
     ) AS pt ON pt.product_id=i.id
     WHERE i.moderation_status='visible'
       AND i.is_available=true
     ORDER BY pt.evidence DESC, i.created_at DESC
     LIMIT $2`,
    [tags, tagLimit + 1]
  ) : Promise.resolve({ rows: [] });
  const [textRes, tagRes] = await Promise.all([textQuery, tagQuery]);
  const truncated = textRes.rows.length > textLimit || tagRes.rows.length > tagLimit;
  const seen = new Map();
  for (const row of [...textRes.rows.slice(0, textLimit), ...tagRes.rows.slice(0, tagLimit)]) {
    if (!seen.has(row.id)) {
      seen.set(row.id, {
        ...row,
        price: row.price == null ? null : Number(row.price),
        _textRank: Number(row.text_rank) || 0,
      });
    }
  }
  return { rows: [...seen.values()], truncated };
}

export async function listItemBrands(limit = 5000) {
  limit = Math.max(1, Math.min(10_000, Number(limit) || 5000));
  const p = await getPool();
  if (!p) return [...new Set(Array.from(mem.items.values()).map((item) => item.brand).filter(Boolean))].slice(0, limit);
  const { rows } = await p.query(
    `SELECT brand FROM items
     WHERE brand IS NOT NULL AND moderation_status='visible'
     GROUP BY brand ORDER BY count(*) DESC, brand LIMIT $1`, [limit]
  );
  return rows.map((row) => row.brand);
}

export async function getItem(id) {
  const p = await getPool();
  if (!p) return mem.items.get(id) || null;
  const { rows } = await p.query("SELECT * FROM items WHERE id=$1", [id]);
  if (!rows[0]) return null;
  return { ...rows[0], price: rows[0].price == null ? null : Number(rows[0].price) };
}

// Batch sibling of getItem, keyed by the primary key.
//
// resolveProducts used to fan out one getItem per id — up to 60 per
// /api/interaction request against the shipped max:5 pool, i.e. 12 sequential
// round-trip waves each holding every connection while it waited (audit #10).
// `id = ANY(...)` makes that one index scan. Returns a Map so callers can keep
// asking about ids that are not there; a missing id is simply absent.
export async function getItems(ids = []) {
  const keys = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (!keys.length) return new Map();
  const p = await getPool();
  if (!p) {
    const out = new Map();
    for (const id of keys) {
      const item = mem.items.get(id);
      if (item) out.set(id, item);
    }
    return out;
  }
  const { rows } = await p.query("SELECT * FROM items WHERE id = ANY($1::text[])", [keys]);
  return new Map(rows.map((row) =>
    [row.id, { ...row, price: row.price == null ? null : Number(row.price) }]));
}

export async function upsertItems(items = []) {
  const rows = items.filter((it) => it && it.id).slice(0, 5000);
  const p = await getPool();
  if (!p) {
    for (const it of rows) mem.items.set(it.id, it);
    return rows.length;
  }
  if (!rows.length) return 0;
  const payload = rows.map((it) => ({
    ...it,
    tags: it.tags || {}, designers: it.designers || [], era: it.era || null,
    size: it.size || null, source: it.source || it.source_name || null,
    source_name: it.source_name || it.source || null,
    source_product_url: it.source_product_url || it.url || null,
    color_evidence: it.color_evidence || it.colorEvidence || {},
    url: it.url || it.source_product_url || null,
    is_available: it.is_available !== false,
    availability_status: it.availability_status || "unknown",
  }));
  await p.query(
    `INSERT INTO items
       (id,title,brand,price,currency,tags,img,alt,source,designers,category,era,size,url,
        source_name,source_product_id,source_product_url,slug,description,subcategory,color,
        material,fit,silhouette,condition,decade,color_evidence,is_available,availability_status,last_synced_at,updated_at)
     SELECT id,title,brand,price,currency,COALESCE(tags,'{}'::jsonb),img,alt,source,
            COALESCE(designers,'[]'::jsonb),category,era,size,url,source_name,source_product_id,
            source_product_url,slug,description,subcategory,color,material,fit,silhouette,
            condition,decade,COALESCE(color_evidence,'{}'::jsonb),COALESCE(is_available,true),COALESCE(availability_status,'unknown'),now(),now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text,title text,brand text,price numeric,currency text,tags jsonb,img text,alt text,
       source text,designers jsonb,category text,era jsonb,size jsonb,url text,source_name text,
       source_product_id text,source_product_url text,slug text,description text,subcategory text,
       color text,material text,fit text,silhouette text,condition text,decade text,color_evidence jsonb,
       is_available boolean,availability_status text)
     ON CONFLICT (id) DO UPDATE SET
       title=EXCLUDED.title,brand=EXCLUDED.brand,price=EXCLUDED.price,currency=EXCLUDED.currency,
       tags=EXCLUDED.tags,img=EXCLUDED.img,alt=EXCLUDED.alt,source=EXCLUDED.source,
       designers=EXCLUDED.designers,category=EXCLUDED.category,era=EXCLUDED.era,size=EXCLUDED.size,
       url=EXCLUDED.url,source_name=EXCLUDED.source_name,source_product_id=EXCLUDED.source_product_id,
       source_product_url=EXCLUDED.source_product_url,slug=EXCLUDED.slug,description=EXCLUDED.description,
       subcategory=EXCLUDED.subcategory,color=EXCLUDED.color,material=EXCLUDED.material,fit=EXCLUDED.fit,
       silhouette=EXCLUDED.silhouette,condition=EXCLUDED.condition,decade=EXCLUDED.decade,
       color_evidence=EXCLUDED.color_evidence,
       is_available=EXCLUDED.is_available,availability_status=EXCLUDED.availability_status,
       last_synced_at=now(),updated_at=now()`,
    [JSON.stringify(payload)]
  );
  return rows.length;
}
