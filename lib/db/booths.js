// lib/db/booths.js
// booth_visits — THE separate attribution channel (owner's words, §6/P2):
// a reader reached a booth via THE WIRE's hotlist. Append-only; the 15%
// commission is chargeable only on orders whose creation found a visit
// inside the attribution window. SERVER-ONLY.

import { getPool } from "./index.js";

const mem = { visits: [] }; // { userId, sourceName, at } — memory-mode mirror

const SLUG = /^[a-z0-9-]{2,40}$/;

export async function recordBoothVisit(userId, sourceName) {
  const user = String(userId || "").slice(0, 80);
  const source = String(sourceName || "").toLowerCase();
  if (!user || !SLUG.test(source)) return false;
  const p = await getPool();
  if (!p) {
    mem.visits.push({ userId: user, sourceName: source, at: Date.now() });
    if (mem.visits.length > 5000) mem.visits.splice(0, mem.visits.length - 5000);
    return true;
  }
  await p.query(
    `INSERT INTO booth_visits (user_id, source_name) VALUES ($1, $2)`,
    [user, source]
  );
  return true;
}

export async function hasRecentBoothVisit(userId, sourceName, windowDays) {
  const user = String(userId || "").slice(0, 80);
  const source = String(sourceName || "").toLowerCase();
  const days = Math.max(1, Math.min(90, Math.trunc(Number(windowDays)) || 7));
  if (!user || !SLUG.test(source)) return false;
  const p = await getPool();
  if (!p) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return mem.visits.some(
      (v) => v.userId === user && v.sourceName === source && v.at >= cutoff
    );
  }
  const r = await p.query(
    `SELECT 1 FROM booth_visits
     WHERE user_id=$1 AND source_name=$2 AND created_at >= now() - ($3 || ' days')::interval
     LIMIT 1`,
    [user, source, String(days)]
  );
  return r.rows.length > 0;
}
