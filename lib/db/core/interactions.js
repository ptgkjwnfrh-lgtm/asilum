// lib/db/core/interactions.js — THE EVENT LOG, AND THE ONE ATOMIC COMMIT.
//
// recordInteraction is the cheap append. commitInteractionBatch is the
// important one: it takes a PURE `reduce` and writes the profile, the canonical
// events, the interaction rows, the edges and the popularity counters inside a
// single transaction, under a per-user advisory lock. All of it lands or none
// of it does, because a taste vector that moved while the graph it was derived
// from did not is a divergence nothing later can detect.
//
// `operationId` makes a replay idempotent, and a repeat returns
// `{ duplicate: true }` with the CURRENT profile rather than an error — the
// caller retrying a network failure should see the state, not a rejection.

import { bumpEdges, writeEdges } from "./graph.js";
import { bumpPopularity, writePopularity } from "./popularity.js";
import { getPool } from "./pool.js";
import { mem, withUserLock } from "./store.js";
import { memRecordEvent, normalizeEvent } from "./events.js";

// ---- Interaction log ----------------------------------------------------------

export async function recordInteraction(userId, itemId, action, dwellMs = null) {
  const p = await getPool();
  if (!p) { mem.interactions.push({ userId, itemId, action, dwellMs, at: Date.now() }); return; }
  await p.query(
    "INSERT INTO interactions (user_id,item_id,action,dwell_ms) VALUES ($1,$2,$3,$4)",
    [userId, itemId, action, dwellMs]
  );
}

const MEM_OPERATIONS_CAP = 5000;
const validOperationId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9-]{8,80}$/.test(value) ? value : null;

function rememberOperation(scope, userId, operationId) {
  if (!operationId) return true;
  const key = `${scope}:${userId}:${operationId}`;
  if (mem.operations.has(key)) return false;
  mem.operations.set(key, Date.now());
  if (mem.operations.size > MEM_OPERATIONS_CAP) {
    const oldest = mem.operations.keys().next().value;
    mem.operations.delete(oldest);
  }
  return true;
}

// Atomic learning commit for interaction batches. `reduce` is pure and returns
// { profile, edgePairs, popularity }; all durable writes share one transaction.
export async function commitInteractionBatch({ userId, operationId, events, reduce }) {
  const op = validOperationId(operationId);
  const canonical = events.map((event) => normalizeEvent(event.canonicalEvent));
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      if (!rememberOperation("interaction", userId, op)) {
        return { duplicate: true, profile: mem.profiles.get(userId) || {} };
      }
      const derived = reduce(mem.profiles.get(userId) || {});
      mem.profiles.set(userId, derived.profile);
      for (const n of canonical) memRecordEvent(n);
      for (const event of events) {
        mem.interactions.push({ userId, itemId: event.itemId, action: event.action, dwellMs: event.dwellMs, at: Date.now() });
      }
      await Promise.all([bumpEdges(derived.edgePairs, userId), bumpPopularity(derived.popularity, userId)]);
      return { duplicate: false, profile: derived.profile };
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    if (op) {
      const inserted = await client.query(
        `INSERT INTO processed_operations (scope,user_id,operation_id) VALUES ('interaction',$1,$2)
         ON CONFLICT DO NOTHING RETURNING operation_id`, [userId, op]
      );
      if (!inserted.rowCount) {
        const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1", [userId]);
        await client.query("COMMIT");
        return { duplicate: true, profile: current.rows[0]?.vec || {} };
      }
    }
    await client.query(
      "INSERT INTO profiles (user_id,vec) VALUES ($1,'{}'::jsonb) ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
    const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const derived = reduce(current.rows[0]?.vec || {});
    await client.query("UPDATE profiles SET vec=$2,updated_at=now() WHERE user_id=$1", [userId, JSON.stringify(derived.profile)]);
    await client.query(
      `INSERT INTO interactions (user_id,item_id,action,dwell_ms)
       SELECT $1,item_id,action,dwell_ms
       FROM jsonb_to_recordset($2::jsonb) AS x(item_id text,action text,dwell_ms integer)`,
      [userId, JSON.stringify(events.map((event) => ({
        item_id: event.itemId, action: event.action, dwell_ms: event.dwellMs,
      })))]
    );
    await client.query(
      `INSERT INTO user_events (user_id,type,payload,at)
       SELECT user_id,type,payload,to_timestamp(at/1000.0)
       FROM jsonb_to_recordset($1::jsonb) AS x(user_id text,type text,payload jsonb,at double precision)`,
      [JSON.stringify(canonical.map((n) => ({ user_id: n.userId, type: n.type, payload: n.payload, at: n.at })))]
    );
    await writeEdges(client, derived.edgePairs, userId);
    await writePopularity(client, derived.popularity, userId);
    await client.query("COMMIT");
    return { duplicate: false, profile: derived.profile };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Per-user event history (newest first) — powers the orders/tickets view.
export async function getInteractions(userId, { action = null, limit = 50 } = {}) {
  limit = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 50));
  const p = await getPool();
  if (!p) {
    return mem.interactions
      .filter((i) => i.userId === userId && (!action || i.action === action))
      .slice(-limit)
      .reverse()
      .map((i) => ({ itemId: i.itemId, action: i.action, at: i.at }));
  }
  const { rows } = await p.query(
    `SELECT item_id, action, created_at FROM interactions
     WHERE user_id=$1 AND ($2::text IS NULL OR action=$2)
     ORDER BY created_at DESC LIMIT $3`,
    [userId, action, limit]
  );
  return rows.map((r) => ({ itemId: r.item_id, action: r.action, at: new Date(r.created_at).getTime() }));
}
