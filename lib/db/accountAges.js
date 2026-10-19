// lib/db/accountAges.js
// account_ages (schema v39). SERVER-ONLY.
//
// Stores the self-declared birth date behind OWNER DECISION #2 (13+). The
// arithmetic lives in lib/age.js and is shared with the client; this file only
// remembers and recalls.
//
// Keyed on the BARE auth uuid per ADR-002, and enforced here rather than at the
// route — the same rule account_kinds learned the hard way in v38, where a row
// written under a device identity was read back under an account identity and
// silently answered with the default.

import { getPool } from "./index.js";
import { checkAge, normalizeBirthDate } from "../age.js";

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mem = { ages: new Map() }; // accountId -> { birthDate, assertedAt }

function cleanId(accountId) {
  const raw = String(accountId || "").trim().toLowerCase();
  return ACCOUNT_UUID.test(raw) ? raw : "";
}

/** The stored birth date as "YYYY-MM-DD", or null when none is recorded. */
export async function readBirthDate(accountId) {
  const id = cleanId(accountId);
  if (!id) return null;
  const p = await getPool();
  if (!p) return mem.ages.get(id)?.birthDate || null;
  const r = await p.query(`SELECT birth_date FROM account_ages WHERE account_id=$1`, [id]);
  if (!r.rows.length) return null;
  const value = r.rows[0].birth_date;
  // pg returns DATE as a Date; render it back in UTC so the string never
  // shifts a day under a non-UTC server timezone.
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Record or correct an assertion. REFUSES an under-age date rather than
 * storing it — a row that fails the gate has no legitimate use, and keeping
 * one would mean holding a known minor's birth date for nothing.
 * Returns { ok, age, reason }.
 */
export async function recordBirthDate(accountId, birthDate, asOf = new Date()) {
  const id = cleanId(accountId);
  if (!id) throw new Error("account ages key on the bare auth uuid (ADR-002)");
  const verdict = checkAge(birthDate, asOf);
  if (!verdict.ok) return verdict;

  const date = normalizeBirthDate(birthDate);
  const p = await getPool();
  if (!p) {
    mem.ages.set(id, { birthDate: date, assertedAt: Date.now() });
    return verdict;
  }
  await p.query(
    `INSERT INTO account_ages (account_id, birth_date) VALUES ($1,$2)
     ON CONFLICT (account_id) DO UPDATE SET birth_date=EXCLUDED.birth_date, updated_at=now()`,
    [id, date]
  );
  return verdict;
}

/**
 * Does this account currently clear the gate? Re-computed from the stored
 * date on every call, so a birthday moves it without anyone writing a row.
 * `null` means no assertion exists — which is NOT the same as failing, and
 * callers must not conflate them.
 */
export async function meetsMinimumAge(accountId, asOf = new Date()) {
  const date = await readBirthDate(accountId);
  if (!date) return null;
  return checkAge(date, asOf).ok;
}

export function __resetAccountAgesForTests() { mem.ages.clear(); }
