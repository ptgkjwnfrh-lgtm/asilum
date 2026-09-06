// lib/db/dm/core.js — WHAT EVERY MAIL-DESK MODULE STANDS ON.
//
// Four things, and each is a rule rather than a convenience:
//
//   accountId()    coerces to the BARE auth uuid and throws otherwise. DMs key
//                  on it (ADR-002); a device id must never reach these tables.
//   pool()         throws MessagingUnavailable instead of returning null.
//                  See the doctrine in lib/db/dm.js — mem mode refuses here, it
//                  does not approximate.
//   orderPair()    the ordered pair the CHECK constraint requires, so a
//                  conversation has ONE representation whoever opened it.
//   pairLockKey()  the per-pair advisory lock every read-then-write takes.
//
// MessageRefused carries the SQLSTATE a v40 trigger raised, so a caller can
// tell WHICH law refused rather than seeing a generic failure.

import { getPool } from "../index.js";

export const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MessagingUnavailable extends Error {
  constructor() {
    super("direct messages require Postgres — mem mode does not reimplement the laws");
    this.name = "MessagingUnavailable";
    this.code = "DM_UNAVAILABLE";
  }
}

/** A refusal raised by one of the v40 triggers, carrying its SQLSTATE. */
export class MessageRefused extends Error {
  constructor(code, detail) {
    super(detail || "message refused");
    this.name = "MessageRefused";
    this.code = code;
  }
}

export function accountId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!ACCOUNT_UUID.test(raw)) {
    throw new Error("direct messages key on the bare auth uuid (ADR-002)");
  }
  return raw;
}

export async function pool() {
  const p = await getPool();
  if (!p) throw new MessagingUnavailable();
  return p;
}

/** The ordered pair, as the CHECK requires. */
export function orderPair(a, b) {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

// A per-pair advisory lock. Every write that must read-then-write inside one
// transaction takes it, so two concurrent sends cannot both decide they are
// the first knock. Derived from the ordered pair, so both sides hash to the
// same key regardless of who is sending.
// EXPORTED so the store tests can hold the very lock the store takes. There is
// no other way to prove a writer waits for it: a test that only fails on an
// unlucky schedule is not a regression test, and one that reimplements the key
// is testing its own arithmetic.
export function pairLockKey(lo, hi) {
  let h = 0n;
  for (const ch of lo + hi) h = (h * 131n + BigInt(ch.charCodeAt(0))) % 9223372036854775783n;
  return h.toString();
}
