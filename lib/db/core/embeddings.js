// lib/db/core/embeddings.js — THE VECTOR SEAM (v1).
//
// Vectors live as jsonb in the schema-alpha `embeddings` table. pgvector is a
// later, deliberate migration, not an oversight: the seam is here so that
// migration changes one file.
//
// Snapshots are cached per process, so every write invalidates them. A cache
// that survives its own writer is the failure this module is shaped around.

import { getPool } from "./pool.js";
import { mem } from "./store.js";

// ---- Embeddings (v1 seam, asterisk-boost r4) ---------------------------------
// Rows live in the schema-alpha `embeddings` table (jsonb vector — pgvector
// upgrade is a later, deliberate migration). id = "<space>:<owner_id>".

export async function saveEmbeddings(rows = []) {
  const clean = rows
    .filter((r) => r && r.ownerId && r.space && Array.isArray(r.vector))
    .map((r) => ({
      id: `${r.space}:${r.ownerId}`,
      owner_id: r.ownerId,
      owner_kind: r.ownerKind || "product",
      space: r.space,
      provider: r.provider || null,
      vector: r.vector,
    }));
  if (!clean.length) return 0;
  // A write makes every cached snapshot of this space stale (audit #11).
  invalidateEmbeddingSnapshots();
  const p = await getPool();
  if (!p) {
    for (const r of clean) mem.embeddings.set(r.id, r);
    return clean.length;
  }
  await p.query(
    `INSERT INTO embeddings (id, owner_id, owner_kind, space, provider, vector, updated_at)
     SELECT id, owner_id, owner_kind, space, provider, vector, now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text, owner_id text, owner_kind text, space text, provider text, vector jsonb)
     ON CONFLICT (id) DO UPDATE SET
       provider=EXCLUDED.provider, vector=EXCLUDED.vector, updated_at=now()`,
    [JSON.stringify(clean)]
  );
  return clean.length;
}

// The whole product embedding space, cached per server instance.
//
// (audit #11) Every keyed search loaded this table uncached on its blocking
// path and then cosined against every row. The audit rated the cost LATENT
// because EMBEDDINGS_PROVIDER/EMBEDDINGS_API_KEY were blank — they are set
// now and the table holds 915 product vectors, so it is being paid. Measured
// against live Postgres: 915 rows x 1024 dims of JSONB is ~1.76 SECONDS per
// call, five times over, on the request path.
//
// Product vectors change only when the offline embed script runs, so a
// short-lived per-instance snapshot is the same trade getDiscoverablePool and
// getPopularitySnapshot already make here — with a longer TTL, because this
// data is far less volatile and far more expensive to fetch. The in-flight
// promise matters as much as the cache: without it, every search arriving
// during that 1.76s window starts its own copy and holds its own connection.
//
// The returned array is SHARED. Callers read it; nobody may mutate it.
const EMBEDDING_SNAPSHOT_TTL_MS = 5 * 60_000;
const embeddingSnapshots = new Map();
const embeddingSnapshotPromises = new Map();

export async function getEmbeddingSnapshot(space, ownerKind = "product", limit = 5000) {
  const key = JSON.stringify([space, ownerKind, limit]);
  const cached = embeddingSnapshots.get(key);
  if (cached && Date.now() - cached.at < EMBEDDING_SNAPSHOT_TTL_MS) return cached.rows;

  let inflight = embeddingSnapshotPromises.get(key);
  if (!inflight) {
    inflight = (async () => {
      const rows = await listEmbeddings(space, ownerKind, limit);
      embeddingSnapshots.set(key, { rows, at: Date.now() });
      return rows;
    })().finally(() => { embeddingSnapshotPromises.delete(key); });
    embeddingSnapshotPromises.set(key, inflight);
  }
  return inflight;
}

// saveEmbeddings calls this, so a re-embed is visible on the next search
// instead of up to a TTL later. Exported for tests.
export function invalidateEmbeddingSnapshots() {
  embeddingSnapshots.clear();
}

// A PRODUCT vector whose product is gone is dead weight: it can match nothing
// the search can show, yet every byte of it rides the snapshot into every
// instance. (optimize round, 20 Sep 2026) Production held 915 such rows — the
// deleted seed catalog's vectors — and 0 live ones, so each keyed search
// loaded ~6 MB of JSONB to compare against nothing. Product vectors are read
// through the items table in BOTH backends; the rows stay (the steward's
// data.embedding-coverage names them) but never load. Other owner kinds are
// untouched: nothing here knows what they belong to.
export async function listEmbeddings(space, ownerKind = "product", limit = 5000) {
  const p = await getPool();
  if (!p) {
    return [...mem.embeddings.values()]
      .filter((r) => r.space === space && r.owner_kind === ownerKind)
      .filter((r) => ownerKind !== "product" || mem.items.has(r.owner_id))
      .slice(0, limit);
  }
  const { rows } = ownerKind === "product"
    ? await p.query(
        `SELECT e.id, e.owner_id, e.owner_kind, e.space, e.provider, e.vector
         FROM embeddings e JOIN items i ON i.id = e.owner_id
         WHERE e.space=$1 AND e.owner_kind=$2 LIMIT $3`,
        [space, ownerKind, limit]
      )
    : await p.query(
        `SELECT id, owner_id, owner_kind, space, provider, vector
         FROM embeddings WHERE space=$1 AND owner_kind=$2 LIMIT $3`,
        [space, ownerKind, limit]
      );
  return rows;
}
