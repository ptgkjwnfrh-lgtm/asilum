// Fixed-window quotas backed by Postgres, with a bounded in-memory fallback for
// keyless development. Subjects are hashed so the quota table stores no user id.

import { createHash } from "node:crypto";
import { getPool } from "../db/index.js";

const memory = new Map();
const MEMORY_CAP = 10_000;
let lastDatabaseCleanup = 0;

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export async function consumeRateLimit({ scope, subject, limit, windowMs, cost = 1 }) {
  const safeLimit = positiveInt(limit, 1);
  const safeWindow = positiveInt(windowMs, 60_000);
  const safeCost = Math.max(1, positiveInt(cost, 1));
  const startMs = Math.floor(Date.now() / safeWindow) * safeWindow;
  const subjectHash = hash(subject || "anonymous");
  const key = `${String(scope).slice(0, 80)}:${subjectHash}:${startMs}`;
  const p = await getPool();
  if (p) {
    const { rows } = await p.query(
      `INSERT INTO api_rate_limits (scope,subject_hash,window_start,hits)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (scope,subject_hash,window_start)
       DO UPDATE SET hits = api_rate_limits.hits + EXCLUDED.hits
       RETURNING hits`,
      [String(scope).slice(0, 80), subjectHash, new Date(startMs), safeCost]
    );
    const used = Number(rows[0]?.hits || safeCost);
    if (Date.now() - lastDatabaseCleanup > 60 * 60 * 1000) {
      lastDatabaseCleanup = Date.now();
      p.query("DELETE FROM api_rate_limits WHERE window_start < now() - interval '2 days'").catch(() => {});
      p.query("DELETE FROM processed_operations WHERE created_at < now() - interval '7 days'").catch(() => {});
    }
    return { allowed: used <= safeLimit, used, limit: safeLimit, retryAfterMs: startMs + safeWindow - Date.now() };
  }
  const used = (memory.get(key) || 0) + safeCost;
  memory.set(key, used);
  if (memory.size > MEMORY_CAP) {
    for (const oldKey of memory.keys()) {
      memory.delete(oldKey);
      if (memory.size <= MEMORY_CAP * 0.8) break;
    }
  }
  return { allowed: used <= safeLimit, used, limit: safeLimit, retryAfterMs: startMs + safeWindow - Date.now() };
}

export function rateLimitResponse(limit) {
  return {
    error: "rate limit exceeded",
    retryAfter: Math.max(1, Math.ceil(limit.retryAfterMs / 1000)),
  };
}
