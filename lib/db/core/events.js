// lib/db/core/events.js — THE CANONICAL HISTORY, AND MOVING IT TO AN ACCOUNT.
//
// A durable log of lib/events records: write-only today, the brain's training
// history later. normalizeEvent is shared with callers that persist an event
// inside their OWN transaction, which is why it and EVENT_INSERT_SQL are
// exported separately from recordEvent — an event must never exist apart from
// the thing that caused it.
//
// ADOPTION IS THE HARD HALF (ADR-002). A person browses as a device (`u-`),
// signs in, and becomes an account (`sb-`); everything keyed by the old id has
// to move without duplicating and without being lost. The mem ring is bounded
// PER USER rather than globally, because one user's flood evicting another
// user's history made mem-mode reads diverge from Postgres — and mem mode is
// what the gates and most tests run on.

import { getPool } from "./pool.js";
import { identityHash, mem } from "./store.js";

// ---- Canonical event history (Alpha Learning Brain training data) --------------
// Durable log of lib/events records. This is the brain's future training
// history — write-only today, read by learning jobs later.

// (audit #18) The in-memory event fallback is bounded PER USER, not just
// globally. A single global ring let one user's flood evict ANOTHER user's
// history, so listEvents(user) in mem returned fewer rows than the unbounded
// pg table would — and the 1000-bot gate runs in mem mode, where
// crossUserCandidates reads exactly this ring, so the discovery boost diverged
// from production. Each user keeps their most-recent MEM_EVENTS_PER_USER (>=
// the listEvents limit cap, so a read up to that limit matches pg). The global
// cap is only a dev-memory backstop, sized so the multi-user stress harness
// never reaches it.
const MEM_EVENTS_PER_USER = 1000; // == the listEvents() limit ceiling
const MEM_EVENTS_CAP = 100_000;   // global dev-memory backstop

// Validate + normalize an event record. Shared by recordEvent and callers
// that persist an event inside their own transaction (lib/db/production.js).
export function normalizeEvent(evt) {
  if (!evt || typeof evt.userId !== "string" || typeof evt.type !== "string") {
    throw new TypeError("event userId and type are required");
  }
  if (!evt.userId || evt.userId.length > 80 || evt.type.length > 80) {
    throw new TypeError("invalid event identity or type");
  }
  const payloadJson = JSON.stringify(evt.payload || {});
  if (payloadJson.length > 8192) throw new RangeError("event payload exceeds 8 KiB");
  return { userId: evt.userId, type: evt.type, payload: evt.payload || {}, payloadJson, at: evt.at || Date.now() };
}

export const EVENT_INSERT_SQL =
  "INSERT INTO user_events (user_id,type,payload,at) VALUES ($1,$2,$3,to_timestamp($4/1000.0))";

// Push a normalized event into the in-memory ring (fallback-store path).
export function memRecordEvent(n) {
  mem.events.push({ userId: n.userId, type: n.type, payload: n.payload, at: n.at, v: 1 });
  // Per-user cap: keep this user's most recent MEM_EVENTS_PER_USER, dropping
  // only their own oldest — never another user's (audit #18). Walk newest→
  // oldest; splicing at the current index is safe because lower indices are
  // untouched.
  let mine = 0;
  for (let i = mem.events.length - 1; i >= 0; i--) {
    if (mem.events[i].userId !== n.userId) continue;
    if (++mine > MEM_EVENTS_PER_USER) mem.events.splice(i, 1);
  }
  // Global dev-memory backstop (many distinct users over a long session).
  if (mem.events.length > MEM_EVENTS_CAP) mem.events.splice(0, mem.events.length - MEM_EVENTS_CAP);
}

export function memAdoptEvents(fromUserId, toUserId, type = null) {
  let moved = 0;
  for (const event of mem.events) {
    if (event.userId === fromUserId && (!type || event.type === type)) {
      event.userId = toUserId;
      moved++;
    }
  }
  return moved;
}

// Evidence mass for adoption's profile merge. production.js maintains its own
// `mem` object, so the interaction ring is only reachable through here. Must be
// read BEFORE adoptMemoryCoreData moves the rows, or both sides count as one.
export function countMemInteractions(userId) {
  let n = 0;
  for (const interaction of mem.interactions) if (interaction.userId === userId) n++;
  return n;
}

export function adoptMemoryCoreData(fromUserId, toUserId) {
  let moved = 0;
  for (const interaction of mem.interactions) {
    if (interaction.userId === fromUserId) {
      interaction.userId = toUserId;
      moved++;
    }
  }
  moved += memAdoptEvents(fromUserId, toUserId);
  // WHAT WAS WRONG (Aug 7, Round A). This DELETED the device's operation keys
  // while Postgres REKEYS them to the account and only then deletes the
  // originals. The two backends therefore disagreed about the one thing this
  // table exists for: whether a replayed interaction batch is safe.
  //
  // MEASURED. Commit an operation on the device, sign in, then replay the SAME
  // operationId under the account -- Postgres answers duplicate:true and
  // applies nothing; mem answered duplicate:false and applied it a second
  // time, double-counting eng/imp and writing a second interaction and event
  // row. (engagers stayed correct only because the v22/v23 ledgers dedupe
  // downstream -- a different mechanism catching part of the damage.)
  //
  // Postgres is the correct one: the retry is the same human doing the same
  // thing, and adoption is exactly when a client is most likely to retry --
  // shell.js re-issues writes around the sign-in swap. mem mode is what
  // preview deploys, local dev, and nearly every test run on, so this is the
  // half that was actually being exercised.
  //
  // Split rather than `.includes(':'+id+':')` because the rekey needs the uid
  // SEGMENT, not just a hit — but to be accurate about the old line: with the
  // key at scope:userId:opId and no part able to contain a colon, the
  // substring test was NOT a latent bug, and a test written to catch one
  // passes against it. The delete-vs-rekey behaviour above is the whole defect.
  for (const key of [...mem.operations.keys()]) {
    const parts = key.split(":");
    if (parts.length < 3 || parts[1] !== fromUserId) continue;
    const rekeyed = [parts[0], toUserId, ...parts.slice(2)].join(":");
    if (!mem.operations.has(rekeyed)) mem.operations.set(rekeyed, mem.operations.get(key));
    mem.operations.delete(key);
    moved++;
  }
  return moved;
}

// WHAT WAS WRONG (Aug 7, Round A). Adoption moved every table keyed by
// `user_id` and NO table keyed by `identity_hash` — and identityHash is just
// sha256 of that same uid. The corroboration ledgers are the identity_hash
// tables, so signing in left the device's rows behind under the device's hash.
//
// Two consequences, both measured on the real adoption path:
//
//   1. ONE HUMAN COUNTED TWICE. v22 exists precisely so a single identity
//      cannot lift a pair: gamma scores DISTINCT contributors and
//      GAMMA_CONTRIB_HALF=2 puts one contributor at 0.333, below the ~0.509
//      r18 vector floor, so a solo actor can never beat the no-edge baseline.
//      After adoption the account had no ledger row, so the same person
//      re-engaging the same pair registered as a SECOND distinct contributor:
//      0.333 -> 0.500. The step v22 priced at "recruit another human" cost a
//      click on SIGN IN. Same for v23: engagers went to 2 for one person.
//   2. ERASURE WAS INCOMPLETE. v22 states outright that account deletion
//      erases the ledger. purgePersonalizationData deletes by the ACCOUNT's
//      hash, so everything corroborated before sign-in survived deletion
//      permanently — a written privacy commitment the code did not meet.
//
// Moving the rows fixes both at once, and is the same operation purge already
// performs, minus the delete: rekey to the account, merge on collision, then
// recompute the materialized aggregates the ledger backs.
// Mem-mode counters for the §6 export. production.js keeps its OWN `mem`, so
// the operation keys and the corroboration ledgers are only reachable through
// here — the same reason countMemInteractions and adoptMemoryLedgers live here.
export function countMemOperations(userId) {
  let n = 0;
  for (const key of mem.operations.keys()) {
    const parts = key.split(":");
    if (parts.length >= 3 && parts[1] === userId) n++;
  }
  return n;
}

export function countMemLedgers(userId) {
  const hash = identityHash(userId);
  let edges = 0, popularity = 0;
  for (const [, pop] of mem.popularity) if (pop.by?.has(hash)) popularity++;
  for (const [, edge] of mem.edges) if (edge.by?.has(hash)) edges++;
  return { edges, popularity };
}

export function adoptMemoryLedgers(fromUserId, toUserId) {
  const from = identityHash(fromUserId), to = identityHash(toUserId);
  if (from === to) return 0;
  const earliest = (x, y) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));
  let moved = 0;

  for (const [, pop] of mem.popularity) {
    if (!pop.by || !pop.by.has(from)) continue;
    const src = pop.by.get(from), dst = pop.by.get(to);
    // OR the flags, keep the EARLIEST first-seen: decay is measured from it,
    // and letting sign-in reset the stamp would hand one identity a way to
    // make an item permanently fresh, which is the inverse of the property
    // the ledger exists to hold.
    pop.by.set(to, dst ? {
      engaged: dst.engaged || src.engaged,
      viewed: dst.viewed || src.viewed,
      engagedAt: earliest(dst.engagedAt, src.engagedAt),
      viewedAt: earliest(dst.viewedAt, src.viewedAt),
    } : src);
    pop.by.delete(from);
    let engagers = 0, viewers = 0;
    for (const v of pop.by.values()) { if (v.engaged) engagers++; if (v.viewed) viewers++; }
    pop.engagers = engagers;
    pop.viewers = viewers;
    moved++;
  }

  for (const [key, edge] of mem.edges) {
    if (!edge.by || !edge.by.has(from)) continue;
    // GREATEST, not sum: the ledger stores each contributor's BEST weight so
    // the action hierarchy survives while repetition buys nothing. Summing
    // here would let one person's two identities out-weigh one bag.
    edge.by.set(to, Math.max(edge.by.get(from) || 0, edge.by.get(to) || 0));
    edge.by.delete(from);
    edge.contributors = edge.by.size;
    edge.w = [...edge.by.values()].reduce((t, v) => t + v, 0);
    if (!edge.contributors && edge.w <= 0) mem.edges.delete(key);
    moved++;
  }
  return moved;
}

export async function recordEvent(evt, queryTarget = null) {
  const n = normalizeEvent(evt);
  const p = queryTarget || await getPool();
  if (!p) { memRecordEvent(n); return; }
  await p.query(EVENT_INSERT_SQL, [n.userId, n.type, n.payloadJson, n.at]);
}

export async function countEvents() {
  const p = await getPool();
  if (!p) return mem.events.length;
  const { rows } = await p.query("SELECT count(*)::int AS n FROM user_events");
  return rows[0]?.n || 0;
}

export async function listEvents(userId, limit = 100) {
  limit = Math.max(1, Math.min(1000, Math.trunc(Number(limit)) || 100));
  const p = await getPool();
  if (!p) return mem.events.filter((e) => e.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT user_id, type, payload, at FROM user_events WHERE user_id=$1 ORDER BY at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map((r) => ({ userId: r.user_id, type: r.type, payload: r.payload, at: new Date(r.at).getTime() }));
}
