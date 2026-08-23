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

// ---- Global cost circuit breakers --------------------------------------------
// Anonymous-abuse boundary (release blocker 0A-4): per-subject quotas bound a
// single caller, but a flood of fresh anonymous identities shares no subject.
// Each expensive surface also draws from ONE global per-minute budget; when it
// is exhausted the surface fails closed with 429 + Retry-After instead of
// letting unbounded anonymous traffic run up database and compute cost.
// Budgets are generous multiples of legitimate peak traffic, tunable per
// scope via GLOBAL_BUDGET_<SCOPE> (0 disables that breaker). The edge/WAF and
// challenge layers in front of this are deployment controls — see
// docs/THREAT-MODEL.md "Anonymous abuse boundary".
const GLOBAL_BUDGETS = {
  search: 3000,
  interpret: 1800,
  discover: 4000,
  feed: 4000,
  "identity-issue": 300,
  // (audit #20) WRITE surfaces also draw a global breaker. Reads failed
  // closed at their budgets while writes — which mutate profiles, the edge
  // graph and popularity counters, and cost more per op — had no aggregate
  // ceiling at all, so a flood of accumulated device identities (unexpiring
  // stateless HMACs) could run up unbounded DB cost. Generous multiples of
  // legitimate peak, tunable via GLOBAL_BUDGET_<SCOPE> (0 disables).
  interaction: 4000,
  boards: 2000,
  "interpret-feedback": 1800,
  // The mail desk. Every signed-in reader polls `summary` on a 45s timer and
  // `activity` every 3s with a thread open, and `inbox` and `thread` are the
  // two expensive reads in the subsystem — a keyset page carrying a correlated
  // unread count AND a correlated preview subquery PER ROW, and a member probe
  // plus a 101-row read plus a reactions aggregate plus the palette. They had
  // per-subject quotas on two of six ops and no aggregate ceiling at all,
  // which is the exact hole this section exists to close: per-subject quotas
  // bound one caller, and a flood of fresh identities shares no subject.
  "dm-read": 6000,
  "dm-write": 3000,
};

export async function consumeGlobalBudget(scope, cost = 1) {
  const key = "GLOBAL_BUDGET_" + String(scope).toUpperCase().replaceAll("-", "_");
  const budget = positiveInt(process.env[key], GLOBAL_BUDGETS[scope] || 0);
  if (!budget || process.env[key] === "0") {
    return { allowed: true, used: 0, limit: 0, retryAfterMs: 0 };
  }
  // cost lets a batched write (interaction sends up to 20 events per request)
  // draw from the budget in proportion to the load it creates, matching the
  // per-identity limiter's cost accounting.
  return consumeRateLimit({
    scope: "global:" + scope, subject: "global", limit: budget, windowMs: 60_000,
    cost: Math.max(1, Math.floor(Number(cost) || 1)),
  });
}
