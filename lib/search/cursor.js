// lib/search/cursor.js — stable search pagination (docs/v2/CONTRACTS.md).
//
// THE DEFECT. `/api/discover` paged with a bare `offset` into a list that is
// re-ranked on every request. Personalisation, a taste write between two
// pages, or a stock change re-orders the list, and page two skips what moved
// up and repeats what moved down. The client cannot see either happen.
//
// THE LAW. A cursor is bound to everything that decides the order — the
// query text, the filters, the sort, the eligibility context (who is being
// personalised for, demo or live pool) and the ranking version — plus a
// SNAPSHOT of the ranked identity list: a hash of the ordered ids the first
// page was cut from. Page N is served from the same ordered list only if that
// hash still matches; otherwise the route answers `stale_cursor` (409) and
// the client restarts from page one. It never silently re-ranks midway.
//
// The cursor is signed with the device secret so a client cannot mint a
// cursor for a context it did not receive. Pure module, no next/server.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Bump when ranking semantics change so old cursors expire honestly. */
export const SEARCH_RANKING_VERSION = "2026-09-19.1";
export const CURSOR_MAX_OFFSET = 10_000;

function secret() {
  const value = process.env.DEVICE_COOKIE_SECRET || "";
  if (value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-search-cursor-secret-not-for-production";
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (text) => Buffer.from(String(text), "base64url");

/** The ordered identity of a ranked list: order matters, nothing else. */
export function snapshotOf(ids = []) {
  const h = createHash("sha256");
  h.update(SEARCH_RANKING_VERSION);
  for (const id of ids) h.update("\n" + String(id));
  return h.digest("hex").slice(0, 24);
}

/** Everything that decides the order, reduced to one string. */
export function bindingOf(context = {}) {
  const keys = Object.keys(context).sort();
  const h = createHash("sha256");
  h.update(SEARCH_RANKING_VERSION);
  for (const key of keys) h.update(`\n${key}=${JSON.stringify(context[key] ?? null)}`);
  return h.digest("hex").slice(0, 24);
}

export function encodeCursor({ offset, snapshotId, binding }) {
  const key = secret();
  if (!key) return null;
  const payload = b64u(JSON.stringify({ v: 1, o: Math.max(0, Math.floor(offset)), s: snapshotId, b: binding }));
  const mac = createHmac("sha256", key).update(payload).digest("base64url").slice(0, 27);
  return `${payload}.${mac}`;
}

/**
 * `{ ok: true, offset, snapshotId, binding }` or `{ ok: false, reason }`.
 * `reason` ∈ malformed | signature | context | snapshot | range. Only
 * `snapshot` means "the list changed under you"; the rest mean the cursor
 * was never valid for this request.
 */
export function decodeCursor(cursor, { binding, snapshotId } = {}) {
  const key = secret();
  if (!key) return { ok: false, reason: "malformed" };
  const text = String(cursor || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1 || text.length > 512) return { ok: false, reason: "malformed" };
  const payload = text.slice(0, dot);
  const mac = text.slice(dot + 1);
  const want = createHmac("sha256", key).update(payload).digest("base64url").slice(0, 27);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) {
    return { ok: false, reason: "signature" };
  }
  let parsed;
  try { parsed = JSON.parse(unb64u(payload).toString("utf8")); } catch { return { ok: false, reason: "malformed" }; }
  if (!parsed || parsed.v !== 1 || !Number.isInteger(parsed.o) || parsed.o < 0 || parsed.o > CURSOR_MAX_OFFSET) {
    return { ok: false, reason: "range" };
  }
  if (binding !== undefined && parsed.b !== binding) return { ok: false, reason: "context" };
  if (snapshotId !== undefined && parsed.s !== snapshotId) return { ok: false, reason: "snapshot" };
  return { ok: true, offset: parsed.o, snapshotId: parsed.s, binding: parsed.b };
}
