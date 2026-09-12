// lib/db/production/catalog.js — WHAT WE KNOW ABOUT A PIECE, and what people
// asked for.
//
// Five tables that all describe the catalog rather than a transaction:
// `user_measurements`, `product_tags`, `product_images`, `search_mappings` and
// `search_logs`. They sit together because they are read together — a search
// resolves a mapping, scores a tag layer, and logs what it served.
//
// The tag writer is the one to read before changing anything here: every facet
// resolves through lib/tagging/vocabulary.js, and a facet nobody defined is
// dropped at the door rather than refused by the v49 CHECK three layers down.

import { facetOf } from "../../tagging/vocabulary.js";
import { getPool } from "../index.js";
import { EMPTY_MEASUREMENTS, measurementProfileForDisplay } from "../../brain/measurements.js";
import { mem, push, boundedLimit } from "./store.js";

// ---- Private user measurements ----------------------------------------------

export async function getUserMeasurements(userId) {
  const p = await getPool();
  if (!p) return measurementProfileForDisplay(mem.measurements.get(userId) || {});
  const { rows } = await p.query(
    `SELECT usual_size,preferred_unit,chest_in,waist_in,hips_in,inseam_in,height_in
     FROM user_measurements WHERE user_id=$1`, [userId]);
  if (!rows[0]) return { ...EMPTY_MEASUREMENTS };
  const row = rows[0];
  return measurementProfileForDisplay({
    usualSize: row.usual_size, preferredUnit: row.preferred_unit,
    inches: {
      chest: row.chest_in, waist: row.waist_in, hips: row.hips_in,
      inseam: row.inseam_in, height: row.height_in,
    },
  });
}

export async function saveUserMeasurements(userId, storage) {
  if (!userId || !storage?.inches) throw new TypeError("normalized measurements required");
  const p = await getPool();
  if (!p) {
    mem.measurements.set(userId, structuredClone(storage));
    return measurementProfileForDisplay(storage);
  }
  const m = storage.inches;
  await p.query(
    `INSERT INTO user_measurements
       (user_id,usual_size,preferred_unit,chest_in,waist_in,hips_in,inseam_in,height_in,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (user_id) DO UPDATE SET
       usual_size=EXCLUDED.usual_size,preferred_unit=EXCLUDED.preferred_unit,
       chest_in=EXCLUDED.chest_in,waist_in=EXCLUDED.waist_in,hips_in=EXCLUDED.hips_in,
       inseam_in=EXCLUDED.inseam_in,height_in=EXCLUDED.height_in,updated_at=now()`,
    [userId, storage.usualSize, storage.preferredUnit, m.chest, m.waist, m.hips, m.inseam, m.height]
  );
  return measurementProfileForDisplay(storage);
}

export async function deleteUserMeasurements(userId) {
  const p = await getPool();
  if (!p) return mem.measurements.delete(userId);
  return (await p.query("DELETE FROM user_measurements WHERE user_id=$1", [userId])).rowCount > 0;
}

// ---- product tags -------------------------------------------------------------

/**
 * Fold tag rows onto one row per (tag, facet), keeping the strongest claim.
 *
 * THE TWO BRANCHES DISAGREED, AND ONLY ONE OF THEM COULD BE SEEN. The
 * in-memory store skipped a pair it already held; Postgres took the whole list
 * into one INSERT ... ON CONFLICT DO UPDATE, which throws "cannot affect row a
 * second time" the moment a list names the same pair twice. Every test runs on
 * the memory branch, so the defect was invisible until a real ingest hit the
 * real database: a listing whose Material aspect says "Cotton" and whose
 * composed descriptors also carry `cotton` produces exactly that pair twice,
 * and the items rows were written while their tags were not.
 *
 * GREATEST is the same rule the ON CONFLICT clause applies, so folding here
 * and conflicting there now mean the same thing.
 */
export function dedupeTagRows(rows = []) {
  const byPair = new Map();
  for (const row of rows) {
    const key = `${row.tag}\u0000${row.tagType}`;
    const prev = byPair.get(key);
    if (!prev) byPair.set(key, row);
    else if (row.confidence > prev.confidence) byPair.set(key, { ...row, source: row.source });
  }
  return [...byPair.values()];
}

export async function addProductTags(productId, tags = []) {
  // tags: [{tag, tagType?, confidence?, source?}]
  // THE THIRD WRITER, and it went through no vocabulary at all — it accepted
  // whatever facet name a caller passed and defaulted to "aesthetic". The two
  // ingest paths were reconciled in lib/tagging/vocabulary.js and this one was
  // not, which is how a register acquires a fourth dialect a week later.
  // facetOf resolves an alias and returns null for a facet nobody defined; a
  // tag with no facet is dropped here rather than refused by the v49 CHECK
  // three layers down, where the error names a constraint instead of a cause.
  const clean = tags
    .map((t) => ({
      tag: String(t.tag || "").trim().toLowerCase().slice(0, 60),
      tagType: facetOf(t.tagType || t.tag_type || "aesthetic"),
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
      source: t.source || "system",
    }))
    .filter((t) => t.tag && t.tagType);
  const rows = dedupeTagRows(clean);
  if (!productId || !rows.length) return 0;
  const p = await getPool();
  if (!p) {
    for (const t of rows) {
      if (!mem.productTags.some((x) => x.productId === productId && x.tag === t.tag && x.tagType === t.tagType))
        push(mem.productTags, { id: mem.seq++, productId, ...t });
    }
    return rows.length;
  }
  await p.query(
    `INSERT INTO product_tags (product_id,tag,tag_type,confidence,source)
     SELECT $1,tag,tag_type,confidence,source
     FROM jsonb_to_recordset($2::jsonb) AS x(tag text,tag_type text,confidence real,source text)
     ON CONFLICT (product_id,tag,tag_type) DO UPDATE SET
       confidence=GREATEST(product_tags.confidence,EXCLUDED.confidence),source=EXCLUDED.source`,
    [productId, JSON.stringify(rows.map((t) => ({
      tag: t.tag, tag_type: t.tagType, confidence: t.confidence, source: t.source,
    })))]
  );
  return rows.length;
}

export async function getProductTags(productId) {
  const p = await getPool();
  if (!p) return mem.productTags.filter((t) => t.productId === productId);
  const { rows } = await p.query(
    "SELECT id, product_id, tag, tag_type, confidence, source FROM product_tags WHERE product_id=$1",
    [productId]
  );
  return rows.map((r) => ({ id: r.id, productId: r.product_id, tag: r.tag, tagType: r.tag_type, confidence: Number(r.confidence), source: r.source }));
}

// Products whose tag layer matches any of the given tags → { productId: score }.
export async function productsByTags(tags = [], { limit = 500 } = {}) {
  limit = boundedLimit(limit, 500, 1000);
  const want = tags.map((t) => String(t).toLowerCase()).filter(Boolean);
  const out = {};
  if (!want.length) return out;
  const p = await getPool();
  if (!p) {
    for (const t of mem.productTags) {
      if (want.includes(t.tag)) out[t.productId] = (out[t.productId] || 0) + t.confidence;
    }
    return out;
  }
  const { rows } = await p.query(
    `SELECT product_id, sum(confidence) AS score FROM product_tags
     WHERE tag = ANY($1) GROUP BY product_id ORDER BY score DESC LIMIT $2`,
    [want, limit]
  );
  for (const r of rows) out[r.product_id] = Number(r.score);
  return out;
}

// Same match, but scores kept per tag_type so callers can weight them
// (dense-layer search) → { productId: { tagType: score } }.
export async function productsByTagsTyped(tags = [], { limit = 500 } = {}) {
  limit = boundedLimit(limit, 500, 1000);
  const want = tags.map((t) => String(t).toLowerCase()).filter(Boolean);
  const out = {};
  if (!want.length) return out;
  const p = await getPool();
  if (!p) {
    for (const t of mem.productTags) {
      if (!want.includes(t.tag)) continue;
      (out[t.productId] ||= {})[t.tagType] = ((out[t.productId] ||= {})[t.tagType] || 0) + t.confidence;
    }
    return out;
  }
  const { rows } = await p.query(
    `WITH scores AS (
       SELECT product_id, tag_type, sum(confidence) AS score
       FROM product_tags
       WHERE tag = ANY($1)
       GROUP BY product_id, tag_type
     ), top_products AS (
       SELECT product_id
       FROM scores
       GROUP BY product_id
       ORDER BY sum(score) DESC, product_id
       LIMIT $2
     )
     SELECT scores.product_id, scores.tag_type, scores.score
     FROM scores
     JOIN top_products USING (product_id)
     ORDER BY scores.product_id, scores.tag_type`,
    [want, limit]
  );
  for (const r of rows) (out[r.product_id] ||= {})[r.tag_type] = Number(r.score);
  return out;
}

export async function deleteProductTag(id) {
  const p = await getPool();
  if (!p) {
    const i = mem.productTags.findIndex((t) => t.id === Number(id));
    if (i >= 0) mem.productTags.splice(i, 1);
    return i >= 0;
  }
  const r = await p.query("DELETE FROM product_tags WHERE id=$1", [id]);
  return r.rowCount > 0;
}

// Merge: every product tagged `from` gets `to` (same type), `from` rows removed.
export async function mergeProductTags(from, to) {
  const p = await getPool();
  const f = String(from || "").toLowerCase(), t = String(to || "").toLowerCase();
  if (!f || !t || f === t) return 0;
  if (!p) {
    let n = 0;
    for (const row of mem.productTags) if (row.tag === f) { row.tag = t; n++; }
    return n;
  }
  const r = await p.query(
    `INSERT INTO product_tags (product_id, tag, tag_type, confidence, source)
     SELECT product_id, $2, tag_type, confidence, 'admin' FROM product_tags WHERE tag=$1
     ON CONFLICT (product_id, tag, tag_type) DO NOTHING`,
    [f, t]
  );
  await p.query("DELETE FROM product_tags WHERE tag=$1", [f]);
  return r.rowCount;
}

// ---- product images -------------------------------------------------------------

export async function addProductImages(productId, images = []) {
  const clean = images
    .map((im, i) => ({
      imageUrl: im.imageUrl || im.image_url || (typeof im === "string" ? im : null),
      altText: im.altText || im.alt_text || null,
      position: im.position ?? i,
      sourceImageUrl: im.sourceImageUrl || im.source_image_url || null,
    }))
    .filter((im) => im.imageUrl);
  if (!productId || !clean.length) return 0;
  const p = await getPool();
  if (!p) return clean.length; // memory mode: items.img already covers display
  await p.query(
    `INSERT INTO product_images (product_id,image_url,alt_text,position,source_image_url)
     SELECT $1,image_url,alt_text,position,source_image_url
     FROM jsonb_to_recordset($2::jsonb)
       AS x(image_url text,alt_text text,position integer,source_image_url text)
     ON CONFLICT (product_id,image_url) DO UPDATE SET
       alt_text=EXCLUDED.alt_text,position=EXCLUDED.position,source_image_url=EXCLUDED.source_image_url`,
    [productId, JSON.stringify(clean.map((im) => ({
      image_url: im.imageUrl, alt_text: im.altText, position: im.position,
      source_image_url: im.sourceImageUrl,
    })))]
  );
  return clean.length;
}

export async function getProductImages(productId) {
  const p = await getPool();
  if (!p) return [];
  const { rows } = await p.query(
    "SELECT image_url, alt_text, position FROM product_images WHERE product_id=$1 ORDER BY position",
    [productId]
  );
  return rows.map((r) => ({ imageUrl: r.image_url, altText: r.alt_text, position: r.position }));
}

// ---- search mappings -------------------------------------------------------------

export async function upsertSearchMapping(m) {
  const phrase = String(m.searchPhrase || m.search_phrase || "").trim().toLowerCase();
  if (!phrase) return null;
  const row = {
    searchPhrase: phrase,
    mappedTags: (m.mappedTags || m.mapped_tags || []).map((t) => String(t).toLowerCase()),
    relatedTerms: (m.relatedTerms || m.related_terms || []).map((t) => String(t).toLowerCase()),
    referenceType: m.referenceType || m.reference_type || "aesthetic",
    confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0.7)),
  };
  const p = await getPool();
  if (!p) { mem.mappings.set(phrase, row); return row; }
  await p.query(
    `INSERT INTO search_mappings (search_phrase, mapped_tags, related_terms, reference_type, confidence, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (search_phrase) DO UPDATE SET
       mapped_tags=EXCLUDED.mapped_tags, related_terms=EXCLUDED.related_terms,
       reference_type=EXCLUDED.reference_type, confidence=EXCLUDED.confidence, updated_at=now()`,
    [phrase, JSON.stringify(row.mappedTags), JSON.stringify(row.relatedTerms), row.referenceType, row.confidence]
  );
  return row;
}

export async function listSearchMappings(limit = 500) {
  limit = boundedLimit(limit, 500, 1000);
  const p = await getPool();
  if (!p) return Array.from(mem.mappings.values());
  const { rows } = await p.query(
    "SELECT search_phrase, mapped_tags, related_terms, reference_type, confidence FROM search_mappings LIMIT $1",
    [limit]
  );
  return rows.map((r) => ({
    searchPhrase: r.search_phrase,
    mappedTags: r.mapped_tags || [],
    relatedTerms: r.related_terms || [],
    referenceType: r.reference_type,
    confidence: Number(r.confidence),
  }));
}

export async function deleteSearchMapping(phrase) {
  const key = String(phrase || "").trim().toLowerCase();
  const p = await getPool();
  if (!p) return mem.mappings.delete(key);
  const r = await p.query("DELETE FROM search_mappings WHERE search_phrase=$1", [key]);
  return r.rowCount > 0;
}

// ---- search logs -------------------------------------------------------------

// (r24) search_logs.served_ids arrives with schema v24. The column is detected
// ONCE per process rather than assumed, so this code is safe to deploy before
// the migration is applied: until then the per-search exposure record is
// simply absent, and the moment v24 lands it starts recording with no deploy.
// REQUIRED_SCHEMA_VERSION is deliberately NOT bumped for the same reason —
// bumping it would make the app refuse to boot until the migration ran, which
// turns an additive column into a deploy-order landmine.
let servedIdsColumn = null;
async function hasServedIdsColumn(p) {
  if (servedIdsColumn === null) {
    try {
      const r = await p.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='search_logs' AND column_name='served_ids'`
      );
      servedIdsColumn = r.rowCount > 0;
    } catch { servedIdsColumn = false; }
  }
  return servedIdsColumn;
}
/** Test seam: forget the detection so a battery can exercise both shapes. */
export function resetServedIdsColumnCache() { servedIdsColumn = null; }

/**
 * A person's own searches that came back EMPTY — the honest record of what
 * they wanted and we did not have.
 *
 * FIRST-PARTY ONLY. This reads one person's history to serve that same person,
 * and every row is already in their §6 export. It is never aggregated across
 * readers and never leaves the account it belongs to.
 *
 * `result_count = 0` is the whole filter. A search that returned something is
 * not a want — it is a question that got an answer.
 */
export async function listEmptySearches(userId, { sinceDays = 120, limit = 40 } = {}) {
  if (!userId) return [];
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const p = await getPool();
  if (!p) {
    return mem.searchLogs
      .filter((r) => r.userId === userId && !r.resultCount && (r.at || 0) >= cutoff)
      .slice(-limit).reverse()
      .map((r) => ({ query: r.query, at: new Date(r.at || Date.now()) }));
  }
  const { rows } = await p.query(
    `SELECT query, max(created_at) AS at, count(*)::int AS asked
       FROM search_logs
      WHERE user_id=$1 AND result_count = 0
        AND created_at > now() - ($2 || ' days')::interval
      GROUP BY query
      ORDER BY max(created_at) DESC
      LIMIT $3`,
    [userId, String(sinceDays), limit]
  );
  return rows.map((r) => ({ query: r.query, at: r.at, asked: r.asked }));
}

export async function logSearch({ userId = null, query, interpreted = {}, resultCount = 0, servedIds = null }) {
  if (!query) return;
  const ids = Array.isArray(servedIds)
    ? servedIds.filter((id) => typeof id === "string" && id).slice(0, 100)
    : null;
  const p = await getPool();
  if (!p) { push(mem.searchLogs, { userId, query, interpreted, resultCount, servedIds: ids, at: Date.now() }); return; }
  if (ids && await hasServedIdsColumn(p)) {
    await p.query(
      "INSERT INTO search_logs (user_id, query, interpreted, result_count, served_ids) VALUES ($1,$2,$3,$4,$5)",
      [userId, String(query).slice(0, 200), JSON.stringify(interpreted), resultCount, JSON.stringify(ids)]
    );
    return;
  }
  await p.query(
    "INSERT INTO search_logs (user_id, query, interpreted, result_count) VALUES ($1,$2,$3,$4)",
    [userId, String(query).slice(0, 200), JSON.stringify(interpreted), resultCount]
  );
}

/**
 * Read back recent search logs. A measurement record nobody can read is not a
 * record — this is what makes the v24 exposure column inspectable by a battery
 * and by scripts/measure-slot-bias.mjs. Read-only, newest first, bounded.
 */
export async function listSearchLogs({ limit = 200 } = {}) {
  const n = Math.max(1, Math.min(2000, Number(limit) || 200));
  const p = await getPool();
  if (!p) return mem.searchLogs.slice(-n).reverse();
  const cols = (await hasServedIdsColumn(p))
    ? "user_id, query, interpreted, result_count, served_ids, created_at"
    : "user_id, query, interpreted, result_count, NULL::jsonb AS served_ids, created_at";
  const r = await p.query(`SELECT ${cols} FROM search_logs ORDER BY created_at DESC LIMIT $1`, [n]);
  return r.rows.map((row) => ({
    userId: row.user_id, query: row.query, interpreted: row.interpreted,
    resultCount: row.result_count, servedIds: row.served_ids || null, at: row.created_at,
  }));
}

