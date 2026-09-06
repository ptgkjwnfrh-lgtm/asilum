// lib/db/core/store.js — THE FALLBACK STORE, AND THE THREE THINGS EVERY
// MODULE HERE BORROWS FROM IT.
//
// `mem` is the whole in-memory database: what runs on preview deploys, in
// local dev, and in almost every test. It is NOT a stub. The rule this
// directory keeps is that the mem path MIRRORS the Postgres path exactly —
// a rule stated again at each branch — because a fallback that implements a
// weaker version of a law means the law is ungated everywhere it is cheap to
// run, while every one of those runs reports success.
//
// `mem`, `edgeKey` and the rest are exported for the sibling modules and are
// NOT re-exported by lib/db/index.js. They were private before the split and
// stay private; the barrel lists names one at a time so that keeps being true.
//
// purgeMemoryUserData is erasure over all of it, and it has to reach further
// than deleting rows: dropping a contributor from an edge or a popularity row
// must DECREMENT the count, or influence never falls back below what the
// remaining people actually corroborated.

import { createHash } from "node:crypto";

// ---- In-memory fallback ----------------------------------------------------
export const mem = {
  items: new Map(),      // itemId -> item (ingested)
  profiles: new Map(),
  interactions: [],
  edges: new Map(),      // "a|b" (a<b) -> { w, contributors, by:Set(identityHash) }
  popularity: new Map(), // itemId -> { eng, imp, engagers, viewers, by:Map(hash->{engaged,viewed}) }
  boards: new Map(),     // boardId -> { id, userId, name, items: [] }
  events: [],            // canonical user events (lib/events), capped ring
  operations: new Map(), // idempotency keys, capped below
  embeddings: new Map(), // "<space>:<owner_id>" -> embedding row (v1 seam)
};

export function purgeMemoryUserData(userId) {
  mem.profiles.delete(userId);
  mem.interactions = mem.interactions.filter((row) => row.userId !== userId);
  mem.events = mem.events.filter((row) => row.userId !== userId);
  for (const [id, board] of mem.boards) if (board.userId === userId) mem.boards.delete(id);
  for (const key of mem.operations.keys()) if (key.includes(`:${userId}:`)) mem.operations.delete(key);
  // The contributor ledger is the FIRST identity-linked row in the gamma
  // graph, so erasure now has to reach it — and dropping a contributor must
  // decrement the count, or influence never falls back below what the
  // remaining people actually corroborated.
  const hash = identityHash(userId);
  for (const [id, pop] of mem.popularity) {
    if (!pop.by || !pop.by.has(hash)) continue;
    pop.by.delete(hash);
    let engagers = 0, viewers = 0;
    for (const v of pop.by.values()) { if (v.engaged) engagers++; if (v.viewed) viewers++; }
    pop.engagers = engagers;
    pop.viewers = viewers;
  }
  for (const [key, edge] of mem.edges) {
    if (!edge.by || !edge.by.has(hash)) continue;
    const wasW = edge.by.get(hash) || 0;
    edge.by.delete(hash);
    edge.contributors = edge.by.size;
    edge.w = Math.max(0, edge.w - wasW);
    if (!edge.contributors && edge.w <= 0) mem.edges.delete(key);
  }
}

/** Pseudonymous contributor id — the unknown_query_votes.identity_hash
 * precedent. Still personal data, so purge deletes it above. */
export function identityHash(userId) {
  return createHash("sha256").update(String(userId || "")).digest("hex");
}

export function edgeKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

// ---- Per-user write lock -----------------------------------------------------
// Profile updates are read-modify-write; concurrent requests for the same user
// (a dwell batch racing a favorite) could drop an update. Serialize them
// per-user within this process. (With Postgres on multi-instance serverless,
// cross-instance races remain — acceptable for taste vectors, which converge.)
const userLocks = new Map();

export function withUserLock(userId, fn) {
  const prev = userLocks.get(userId) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const gate = run.catch(() => {}).finally(() => {
    if (userLocks.get(userId) === gate) userLocks.delete(userId);
  });
  userLocks.set(userId, gate);
  return run;
}
