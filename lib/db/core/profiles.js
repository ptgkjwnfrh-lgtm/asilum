// lib/db/core/profiles.js — TASTE VECTORS.
//
// A profile is the durable answer to "what does this person like", and it is
// read-modify-write: a dwell batch racing a favorite can drop an update
// entirely. mutateProfile is the one that goes through withUserLock; getProfile
// and saveProfile are the raw halves and are only safe when the caller already
// holds the lock or does not care. Reach for mutateProfile unless you know why
// you are not.

import { getPool } from "./pool.js";
import { mem, withUserLock } from "./store.js";

// ---- Profiles ----------------------------------------------------------------

export async function getProfile(userId) {
  const p = await getPool();
  if (!p) return mem.profiles.get(userId) || {};
  const { rows } = await p.query("SELECT vec FROM profiles WHERE user_id=$1", [userId]);
  return rows[0]?.vec || {};
}

export async function saveProfile(userId, vec) {
  const p = await getPool();
  if (!p) { mem.profiles.set(userId, vec); return; }
  await p.query(
    `INSERT INTO profiles (user_id,vec,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (user_id) DO UPDATE SET vec=EXCLUDED.vec, updated_at=now()`,
    [userId, JSON.stringify(vec)]
  );
}

// Cross-instance-safe profile read/modify/write. Use this for mutations that
// are not already part of a larger transaction.
export async function mutateProfile(userId, mutator) {
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      const next = await mutator(mem.profiles.get(userId) || {});
      mem.profiles.set(userId, next || {});
      return next || {};
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    await client.query(
      "INSERT INTO profiles (user_id,vec) VALUES ($1,'{}'::jsonb) ON CONFLICT (user_id) DO NOTHING", [userId]
    );
    const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const next = (await mutator(current.rows[0]?.vec || {})) || {};
    const serialized = JSON.stringify(next);
    if (serialized.length > 256 * 1024) throw new RangeError("profile exceeds 256 KiB");
    await client.query("UPDATE profiles SET vec=$2,updated_at=now() WHERE user_id=$1", [userId, serialized]);
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Long-term taste vectors, for cross-user similarity (lib/taste-graph). Capped —
// callers must report the cap so a partial scan never reads as a full one.
//
// (audit #12 residual) This was `listProfiles`, selecting the whole `vec` JSONB.
// Cross-user similarity only ever reads the long-term vector, but `vec` also
// carries `session` and — dominating everything — `_meta`, whose `seen` array
// alone measured 726 kB across a 500-row scan. The v29 index fixed the sort;
// the transfer stayed. Measured on live at 4,137 rows: the full column moved
// 1,408,369 B per call, the long vector alone moves 164,606 B (-88.3%), and the
// round trip fell 218.4 ms -> 45.9 ms (medians of 7, both warmed, re-checked
// interleaved). Renamed because a function returning taste vectors should not
// be called listProfiles.
//
// NOTE for anyone re-measuring: EXPLAIN ANALYZE says this shape is SLOWER
// (0.62 -> 2.64 ms) because extracting the subfield is real server work and
// execution time excludes the wire. Transfer is the cost being removed here,
// so wall-clock round trip is the honest measure — the one case where the
// house rule of preferring EXPLAIN ANALYZE inverts.
//
// COALESCE(NULLIF(...)) reproduces the old caller's `vec?.long || vec` exactly,
// including legacy flat profiles that predate the two-timescale split: a JSON
// `null` long falls through to the whole vec, an empty object `{}` does not.
export async function listTasteVectors(limit = 500) {
  limit = Math.max(1, Math.min(1000, Math.trunc(Number(limit)) || 500));
  const p = await getPool();
  if (!p) {
    return Array.from(mem.profiles.entries()).slice(0, limit)
      .map(([userId, vec]) => ({ userId, long: vec?.long || vec || {} }));
  }
  const { rows } = await p.query(
    `SELECT user_id, COALESCE(NULLIF(vec->'long', 'null'::jsonb), vec) AS long
       FROM profiles ORDER BY updated_at DESC LIMIT $1`, [limit]
  );
  return rows.map((r) => ({ userId: r.user_id, long: r.long || {} }));
}
