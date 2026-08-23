// lib/db/accountKinds.js
// account_kinds + account_kind_events (schema v37). SERVER-ONLY.
//
// The current kind is a single row; how it got there is an append-only ledger.
// Reads are on the hot path — the shell asks on every hard entry — so the read
// is one indexed primary-key lookup and nothing else.
//
// A READ THAT FAILS MUST NOT SILENTLY SAY "passport". A database hiccup that
// downgrades a business to the default kind would strip its analytics, its
// storefront and its nav in one request, and look exactly like a person who
// never chose. So the low-level reader THROWS and the callers decide; only
// "no row" means unchosen.

import { getPool } from "./index.js";
import { DEFAULT_KIND, isAccountKind, normalizeKind } from "../accounts.js";

// memory-mode mirror: accountId -> { kind, chosenAt, updatedAt }
// `seq` is a monotonic counter, NOT a timestamp. Two events in the same
// millisecond — a signup immediately corrected, or any test — sorted by
// Date.now() tie and come back in an arbitrary order, so the newest entry was
// not reliably first. An audit trail whose order is a coin flip is not one.
const mem = { kinds: new Map(), events: [], seq: 0 };

function cleanId(accountId) {
  return String(accountId || "").slice(0, 80);
}

/**
 * The stored kind, or null when this account has never chosen.
 * Throws if the store cannot be read — see the header.
 */
export async function readAccountKind(accountId) {
  const id = cleanId(accountId);
  if (!id) return null;
  const p = await getPool();
  if (!p) {
    const row = mem.kinds.get(id);
    return row ? row.kind : null;
  }
  const r = await p.query(`SELECT kind FROM account_kinds WHERE account_id=$1`, [id]);
  return r.rows.length ? normalizeKind(r.rows[0].kind) : null;
}

/**
 * The kind to treat this account as: the stored one, or the default when it
 * has never chosen. Still throws on a store failure — a caller that wants to
 * degrade must say so, rather than inheriting a downgrade by accident.
 */
export async function accountKind(accountId) {
  return (await readAccountKind(accountId)) || DEFAULT_KIND;
}

/**
 * Record a kind. Writes the current row and appends to the ledger in ONE
 * transaction — a ledger that can disagree with the row it explains is worse
 * than no ledger, because it is trusted.
 * Returns { kind, changed }.
 */
export async function setAccountKind(accountId, kind, { actor = "signup", note = "" } = {}) {
  const id = cleanId(accountId);
  if (!id) throw new Error("account id required");
  if (!isAccountKind(kind)) throw new Error(`unknown account kind: ${kind}`);
  if (!["signup", "admin", "migration"].includes(actor)) {
    throw new Error(`unknown actor: ${actor}`);
  }
  const trimmedNote = String(note || "").slice(0, 300) || null;

  const p = await getPool();
  if (!p) {
    const previous = mem.kinds.get(id)?.kind || null;
    if (previous === kind) return { kind, changed: false };
    const now = Date.now();
    mem.kinds.set(id, { kind, chosenAt: previous ? mem.kinds.get(id).chosenAt : now, updatedAt: now });
    mem.events.push({ accountId: id, fromKind: previous, toKind: kind, actor, note: trimmedNote, at: now, seq: ++mem.seq });
    return { kind, changed: true };
  }

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      `SELECT kind FROM account_kinds WHERE account_id=$1 FOR UPDATE`, [id]);
    const previous = before.rows.length ? before.rows[0].kind : null;
    if (previous === kind) {
      await client.query("COMMIT");
      return { kind, changed: false };
    }
    await client.query(
      `INSERT INTO account_kinds (account_id, kind) VALUES ($1,$2)
       ON CONFLICT (account_id) DO UPDATE SET kind=EXCLUDED.kind, updated_at=now()`,
      [id, kind]
    );
    await client.query(
      `INSERT INTO account_kind_events (account_id, from_kind, to_kind, actor, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, previous, kind, actor, trimmedNote]
    );
    await client.query("COMMIT");
    return { kind, changed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The ledger for one account, newest first. For the admin terminal. */
export async function accountKindHistory(accountId, limit = 50) {
  const id = cleanId(accountId);
  const n = Math.max(1, Math.min(200, Math.trunc(Number(limit)) || 50));
  if (!id) return [];
  const p = await getPool();
  if (!p) {
    return mem.events.filter((e) => e.accountId === id)
      .sort((a, b) => b.seq - a.seq).slice(0, n);
  }
  const r = await p.query(
    `SELECT from_kind, to_kind, actor, note, created_at
     FROM account_kind_events WHERE account_id=$1
     ORDER BY created_at DESC LIMIT $2`, [id, n]);
  return r.rows.map((row) => ({
    fromKind: row.from_kind, toKind: row.to_kind, actor: row.actor,
    note: row.note, at: row.created_at,
  }));
}

/**
 * Counts per kind, for the admin terminal's roster split.
 * Accounts that never chose have no row, so they are counted separately
 * rather than folded into `passport` — "defaulted" and "chose passport" are
 * different facts and the desk should be able to tell them apart.
 */
export async function accountKindCounts() {
  const p = await getPool();
  if (!p) {
    const counts = { passport: 0, business: 0 };
    for (const row of mem.kinds.values()) counts[row.kind] = (counts[row.kind] || 0) + 1;
    return counts;
  }
  const r = await p.query(`SELECT kind, count(*)::int AS n FROM account_kinds GROUP BY kind`);
  const counts = { passport: 0, business: 0 };
  for (const row of r.rows) counts[row.kind] = row.n;
  return counts;
}

/** Test seam: memory mode only. */
export function __resetAccountKindsForTests() {
  mem.kinds.clear();
  mem.events.length = 0;
  mem.seq = 0;
}
