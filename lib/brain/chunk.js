// lib/brain/chunk.js — the CHUNK: how one served page of the catalog is
// divided, and the CATALOG LANE that walks the listing in cursor order.
//
// Owner order, 6 Sep 2026: "procedurally generated catalog filling paired
// with cursor based marketplace pagination". A feed page is no longer "core
// with a discovery every fifth slot and two reaches" — it is a CHUNK cut to
// declared shares, and one of those shares is not taste at all:
//
//   catalog    25%   the listing itself, in listing order, continued by a
//                    cursor from wherever the previous chunk stopped. This
//                    share is FIXED — for a cold reader, a bored reader, a
//                    reader in safe mode, and a reader whose taste is so
//                    narrow that everything else on the page agrees with it.
//   core       45%   what the learned taste ranks highest (the six bridges)
//   discovery  20%   one hop out — "you'll probably like this"
//   reach      10%   deliberately far — "break your pattern"
//
// The discovery and reach shares are the ANTI-MONOCULTURE CLAUSE: together
// with the catalog lane they guarantee that at least 55% of every chunk was
// not chosen by "more of what you just did", so a feed that learns fast can
// never collapse into one aesthetic. Bored readers (skip fatigue) get more
// reach; safe mode keeps discovery small and drops reach — but never the lane.
//
// Everything here is pure and takes plain data, so the shares, the slot
// layout and the cursor can each be asserted on their own.

export const CATALOG_SHARE = 0.25;

/** Zone shares per reader state. Core is always the remainder. */
export const CHUNK_SHARES = Object.freeze({
  base: Object.freeze({ catalog: CATALOG_SHARE, discovery: 0.20, reach: 0.10 }),
  bored: Object.freeze({ catalog: CATALOG_SHARE, discovery: 0.20, reach: 0.15 }),
  safe: Object.freeze({ catalog: CATALOG_SHARE, discovery: 0.10, reach: 0 }),
});

export const CHUNK_MIN = 12;
export const CHUNK_MAX = 60;
export const CHUNK_DEFAULT = 60;
// A full cursor carries a lane position, up to CHUNK_MAX lane `skip` ids and
// up to TASTE_PASSED_MAX `passed` ids; with 40-char ids that is ~5.5 KB raw,
// well under any URL ceiling that matters (Vercel accepts 14 KB).
export const CURSOR_MAX_LEN = 8192;

/** BRAIN_CATALOG_LANE=0 restores the pre-chunk zoning without a deploy. */
export function catalogLaneEnabled() {
  return (process.env.BRAIN_CATALOG_LANE ?? "1") !== "0";
}

/** A requested chunk size, bounded; anything unreadable is the default. */
export function clampChunkLimit(value, fallback = CHUNK_DEFAULT) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(CHUNK_MIN, Math.min(CHUNK_MAX, n));
}

export function chunkShares({ epsilonActive = false, safeMode = false } = {}) {
  if (safeMode) return CHUNK_SHARES.safe;
  return epsilonActive ? CHUNK_SHARES.bored : CHUNK_SHARES.base;
}

/**
 * Slot counts for one chunk. The catalog quota never depends on taste; the
 * discovery and reach quotas exist only once there is a taste to be adjacent
 * to or far from (for a cold reader everything is already a reach — the same
 * rule the assembler has always applied).
 */
export function chunkQuotas(limit, { hasTaste = false, epsilonActive = false, safeMode = false, catalog = true } = {}) {
  const n = Math.max(1, Math.trunc(Number(limit)) || CHUNK_DEFAULT);
  const shares = chunkShares({ epsilonActive, safeMode });
  const quota = {
    catalog: catalog ? Math.round(n * shares.catalog) : 0,
    discovery: hasTaste ? Math.round(n * shares.discovery) : 0,
    reach: hasTaste ? Math.round(n * shares.reach) : 0,
  };
  quota.core = Math.max(0, n - quota.catalog - quota.discovery - quota.reach);
  return quota;
}

/**
 * Spread `count` slots evenly across `limit` positions, skipping any already
 * taken (bumping forward to the next free one). The same law the old reach
 * slots used — floor(k·limit/(count+1)) — so a zone is never a block at the
 * top or the bottom of the page.
 */
export function spreadSlots(limit, count, taken = new Set()) {
  const out = [];
  for (let k = 1; k <= count; k++) {
    let slot = Math.floor((k * limit) / (count + 1));
    let tries = 0;
    while (taken.has(slot) && tries < limit) { slot = (slot + 1) % limit; tries++; }
    if (taken.has(slot)) break; // every position is spoken for
    taken.add(slot);
    out.push(slot);
  }
  return out;
}

/** One zone name per slot for the chunk. Catalog is placed first, then reach, then discovery; the rest is core. */
export function chunkLayout(limit, quotas) {
  const n = Math.max(1, Math.trunc(Number(limit)) || CHUNK_DEFAULT);
  const layout = new Array(n).fill("core");
  const taken = new Set();
  for (const zone of ["catalog", "reach", "discovery"]) {
    for (const slot of spreadSlots(n, quotas[zone] || 0, taken)) layout[slot] = zone;
  }
  return layout;
}

// ---- The catalog lane --------------------------------------------------------

function listedAt(item) {
  const raw = item && (item.created_at ?? item.createdAt ?? item.listed_at);
  if (raw == null) return 0;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/** The listing key of an item: newest first, then id — the order the items table itself is read in. */
export function listingKey(item) {
  return { t: listedAt(item), id: String(item && item.id != null ? item.id : "") };
}

/** Total order over listing keys: newer first, then id ascending (stable, plan-independent). */
export function compareKeys(a, b) {
  if (a.t !== b.t) return b.t - a.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A copy of the pool in listing order. */
export function listingOrder(pool) {
  return (pool || []).slice().sort((x, y) => compareKeys(listingKey(x), listingKey(y)));
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString("utf8");

/**
 * Cursor = "resume AT this key" (inclusive), so a chunk that had to leave an
 * item behind (brand cap) can hand the next chunk exactly that item. When it
 * does, the ids the chunk took AFTER that item ride along in `skip`, so the
 * resumed walk never re-serves them — the lane is self-contained and needs no
 * rotation memory, which an anonymous reader does not have. An exhausted lane
 * encodes `end`. Opaque to the client; forgeable only into another valid
 * position — a cursor can never name a taste, a person or a filter, so there
 * is nothing to protect beyond its shape.
 */
export const TASTE_OFFSET_MAX = 5000;

/**
 * The TASTE offsets ride in the same cursor: how many candidates of each taste
 * lane (core / discovery / reach) earlier chunks already consumed, so a reader
 * whose consent keeps NO rotation memory on the server (D4: GENERAL) still
 * scrolls forward instead of being served the same core slate again. Client-
 * carried, like the lane position — the server remembers nothing. Readers
 * with rotation memory ignore them (the seen penalty already rotates).
 */
export const TASTE_PASSED_MAX = 60;

export function normalizeTaste(t) {
  const n = (v) => {
    const x = Math.trunc(Number(v));
    return Number.isFinite(x) && x > 0 ? Math.min(TASTE_OFFSET_MAX, x) : 0;
  };
  // `passed`: candidates the pointers walked past for the brand cap only —
  // not served, so not consumed; the next chunk retries them first. Bounded;
  // the oldest fall off and count as consumed until the ranking wraps.
  const passed = Array.isArray(t && t.passed)
    ? t.passed.filter((x) => typeof x === "string" && x).slice(-TASTE_PASSED_MAX) : [];
  return { core: n(t && t.core), discovery: n(t && t.discovery), reach: n(t && t.reach), passed };
}

const tasteField = (taste) => {
  const t = normalizeTaste(taste);
  if (!(t.core || t.discovery || t.reach || t.passed.length)) return null;
  const out = { c: t.core, d: t.discovery, r: t.reach };
  if (t.passed.length) out.p = t.passed;
  return out;
};

export function encodeCursor(pos) {
  if (!pos) return null;
  const taste = tasteField(pos.taste);
  if (pos.end) return b64(JSON.stringify({ v: 1, end: true, ...(taste ? { taste } : {}) }));
  const out = { v: 1, t: Number(pos.t) || 0, id: String(pos.id) };
  const skip = Array.isArray(pos.skip) ? pos.skip.map(String).filter(Boolean).slice(0, CHUNK_MAX) : [];
  if (skip.length) out.skip = skip;
  if (taste) out.taste = taste;
  return b64(JSON.stringify(out));
}

export function decodeCursor(raw) {
  if (typeof raw !== "string" || !raw || raw.length > CURSOR_MAX_LEN) return null;
  try {
    const obj = JSON.parse(unb64(raw));
    if (!obj || obj.v !== 1) return null;
    const taste = normalizeTaste(obj.taste && typeof obj.taste === "object"
      ? { core: obj.taste.c, discovery: obj.taste.d, reach: obj.taste.r, passed: obj.taste.p } : null);
    if (obj.end === true) return { end: true, taste };
    if (typeof obj.id !== "string" || !obj.id) return null;
    const t = Number(obj.t);
    const skip = Array.isArray(obj.skip)
      ? obj.skip.filter((x) => typeof x === "string" && x).slice(0, CHUNK_MAX) : [];
    return { t: Number.isFinite(t) ? t : 0, id: obj.id, skip, taste };
  } catch {
    return null;
  }
}

/** Index of the first item at or after the cursor; 0 for no cursor; length once exhausted. */
export function cursorIndex(ordered, cursor) {
  if (!cursor) return 0;
  if (cursor.end) return ordered.length;
  for (let i = 0; i < ordered.length; i++) {
    if (compareKeys(cursor, listingKey(ordered[i])) <= 0) return i;
  }
  return ordered.length;
}

/**
 * Walk the listing from the cursor and collect up to `n` items.
 *
 *   exclude(item)  — ids this chunk already holds, or the reader was already
 *                    served (rotation memory): PASSED, the cursor moves on.
 *   defer(item)    — an item the chunk cannot hold right now (the brand cap):
 *                    NOT passed. The next chunk resumes at the first deferred
 *                    item, carrying the ids taken after it as `skip`, so a
 *                    listing is never silently dropped by a per-page
 *                    diversity rule and never served twice either.
 *
 * Returns { items, next, nextCursor, exhausted } — `next` is the raw resume
 * position (so a caller can add taste offsets before encoding), `nextCursor`
 * the same position encoded on its own.
 */
export function catalogLane(ordered, cursor, n, { exclude = () => false, defer = () => false } = {}) {
  const items = [];
  const want = Math.max(0, Math.trunc(Number(n)) || 0);
  const carried = new Set(cursor && Array.isArray(cursor.skip) ? cursor.skip : []);
  let i = cursorIndex(ordered, cursor);
  let firstDeferred = null;
  const takenAfterDeferral = [];
  while (i < ordered.length && items.length < want) {
    const it = ordered[i];
    i++;
    if (carried.has(String(it.id)) || exclude(it)) continue;
    if (defer(it)) { if (!firstDeferred) firstDeferred = it; continue; }
    items.push(it);
    if (firstDeferred) takenAfterDeferral.push(String(it.id));
  }
  if (firstDeferred) {
    const next = { ...listingKey(firstDeferred), skip: takenAfterDeferral };
    return { items, next, nextCursor: encodeCursor(next), exhausted: false };
  }
  const resumeAt = i < ordered.length ? ordered[i] : null;
  const next = resumeAt ? listingKey(resumeAt) : { end: true };
  return { items, next, nextCursor: encodeCursor(next), exhausted: !resumeAt };
}
