// lib/db/index.js
// Persistence layer. Uses Postgres (Neon/Supabase) when DATABASE_URL is set,
// otherwise falls back to an in-memory store so the app runs locally and in
// preview deploys before a database is connected.
//
// Stores: profiles (taste vectors), interactions (event log), edges (the
// Pinterest-style item-to-item co-engagement graph), popularity (TikTok-style
// engagement/impression counters), and boards (user moodboards).
//
// Secrets (DATABASE_URL) are provided via environment variables on the deploy
// platform. This file never hard-codes credentials.

import { randomUUID } from "node:crypto";

let pool = null;
let poolPromise = null;

// Certificate verification stays ON. Providers whose chain roots outside
// node's bundled trust store (Supabase signs with its own "Supabase Root
// 2021 CA" — checked in at supabase/prod-ca-2021.crt) need DATABASE_SSL_CA:
// either inline PEM or a path to a .crt, used as the exact trust anchor.
export async function databaseSslConfig() {
  if ((process.env.DATABASE_SSL_MODE || "").toLowerCase() === "disable") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_SSL_MODE=disable is forbidden in production");
    }
    return false;
  }
  const ca = (process.env.DATABASE_SSL_CA || "").trim();
  if (!ca) return { rejectUnauthorized: true };
  if (ca.includes("-----BEGIN")) {
    return { rejectUnauthorized: true, ca: ca.replace(/\\n/g, "\n") };
  }
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const path = ca.startsWith("/")
    ? ca
    : join(/* turbopackIgnore: true */ process.cwd(), ca);
  return { rejectUnauthorized: true, ca: readFileSync(path, "utf8") };
}

// Exported for lib/db/production.js (new-table CRUD lives there so this file
// stays the brain-table layer). Everything else should use the functions below.
export async function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    let candidate = null;
    try {
      // Interop: Next resolves pg's named exports; plain node (seed script,
      // harnesses) gets the CJS module on .default.
      const pgMod = await import("pg");
      const { Pool } = pgMod.default ?? pgMod;
      candidate = new Pool({
        connectionString: url,
        ssl: await databaseSslConfig(),
        connectionTimeoutMillis: 10_000,
        max: Math.max(1, Math.min(20, Number(process.env.DATABASE_POOL_MAX) || 5)),
        idleTimeoutMillis: 30_000,
      });
      await verifySchema(candidate);
      pool = candidate;
      return pool;
    } catch (e) {
      if (candidate) await candidate.end().catch(() => {});
      pool = null;
      throw new Error("Postgres is configured but unavailable", { cause: e });
    } finally {
      poolPromise = null;
    }
  })();
  return poolPromise;
}

const REQUIRED_TABLES = [
  "items", "profiles", "interactions", "edges", "popularity", "boards",
  "board_items", "user_events", "api_rate_limits", "processed_operations",
  "identity_adoptions", "app_schema_migrations",
];
const REQUIRED_SCHEMA_VERSION = 8;

async function verifySchema(target) {
  const { rows } = await target.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  const present = new Set(rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((name) => !present.has(name));
  if (missing.length) {
    throw new Error(`database migrations required; missing tables: ${missing.join(", ")}`);
  }
  const version = await target.query("SELECT max(version)::int AS version FROM app_schema_migrations");
  if ((version.rows[0]?.version || 0) < REQUIRED_SCHEMA_VERSION) {
    throw new Error(
      `database migrations required; expected schema v${REQUIRED_SCHEMA_VERSION}, found v${version.rows[0]?.version || 0}`
    );
  }
}

// ---- In-memory fallback ----------------------------------------------------
const mem = {
  items: new Map(),      // itemId -> item (ingested)
  profiles: new Map(),
  interactions: [],
  edges: new Map(),      // "a|b" (a<b) -> weight
  popularity: new Map(), // itemId -> { eng, imp }
  boards: new Map(),     // boardId -> { id, userId, name, items: [] }
  events: [],            // canonical user events (lib/events), capped ring
  operations: new Map(), // idempotency keys, capped below
};

function edgeKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

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

// ---- Items ------------------------------------------------------------------

// Live items ingested via /api/ingest; with none the feed route falls back to
// the seed catalog.
export async function listItems(limit = 200) {
  limit = Math.max(1, Math.min(5000, Number(limit) || 200));
  const p = await getPool();
  if (!p) return Array.from(mem.items.values()).slice(-limit);
  const { rows } = await p.query("SELECT * FROM items ORDER BY created_at DESC LIMIT $1", [limit]);
  // pg returns NUMERIC as string; the brain and price filters expect numbers.
  return rows.map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }));
}

export async function getItem(id) {
  const p = await getPool();
  if (!p) return mem.items.get(id) || null;
  const { rows } = await p.query("SELECT * FROM items WHERE id=$1", [id]);
  if (!rows[0]) return null;
  return { ...rows[0], price: rows[0].price == null ? null : Number(rows[0].price) };
}

export async function upsertItems(items = []) {
  const rows = items.filter((it) => it && it.id).slice(0, 5000);
  const p = await getPool();
  if (!p) {
    for (const it of rows) mem.items.set(it.id, it);
    return rows.length;
  }
  if (!rows.length) return 0;
  const payload = rows.map((it) => ({
    ...it,
    tags: it.tags || {}, designers: it.designers || [], era: it.era || null,
    size: it.size || null, source: it.source || it.source_name || null,
    source_name: it.source_name || it.source || null,
    source_product_url: it.source_product_url || it.url || null,
    url: it.url || it.source_product_url || null,
    is_available: it.is_available !== false,
    availability_status: it.availability_status || "unknown",
  }));
  await p.query(
    `INSERT INTO items
       (id,title,brand,price,currency,tags,img,alt,source,designers,category,era,size,url,
        source_name,source_product_id,source_product_url,slug,description,subcategory,color,
        material,fit,silhouette,condition,decade,is_available,availability_status,last_synced_at,updated_at)
     SELECT id,title,brand,price,currency,COALESCE(tags,'{}'::jsonb),img,alt,source,
            COALESCE(designers,'[]'::jsonb),category,era,size,url,source_name,source_product_id,
            source_product_url,slug,description,subcategory,color,material,fit,silhouette,
            condition,decade,COALESCE(is_available,true),COALESCE(availability_status,'unknown'),now(),now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text,title text,brand text,price numeric,currency text,tags jsonb,img text,alt text,
       source text,designers jsonb,category text,era jsonb,size jsonb,url text,source_name text,
       source_product_id text,source_product_url text,slug text,description text,subcategory text,
       color text,material text,fit text,silhouette text,condition text,decade text,
       is_available boolean,availability_status text)
     ON CONFLICT (id) DO UPDATE SET
       title=EXCLUDED.title,brand=EXCLUDED.brand,price=EXCLUDED.price,currency=EXCLUDED.currency,
       tags=EXCLUDED.tags,img=EXCLUDED.img,alt=EXCLUDED.alt,source=EXCLUDED.source,
       designers=EXCLUDED.designers,category=EXCLUDED.category,era=EXCLUDED.era,size=EXCLUDED.size,
       url=EXCLUDED.url,source_name=EXCLUDED.source_name,source_product_id=EXCLUDED.source_product_id,
       source_product_url=EXCLUDED.source_product_url,slug=EXCLUDED.slug,description=EXCLUDED.description,
       subcategory=EXCLUDED.subcategory,color=EXCLUDED.color,material=EXCLUDED.material,fit=EXCLUDED.fit,
       silhouette=EXCLUDED.silhouette,condition=EXCLUDED.condition,decade=EXCLUDED.decade,
       is_available=EXCLUDED.is_available,availability_status=EXCLUDED.availability_status,
       last_synced_at=now(),updated_at=now()`,
    [JSON.stringify(payload)]
  );
  return rows.length;
}

// ---- Profiles ----------------------------------------------------------------

export async function getProfile(userId) {
  const p = await getPool();
  if (!p) return mem.profiles.get(userId) || {};
  const { rows } = await p.query("SELECT vec FROM profiles WHERE user_id=$1", [userId]);
  return rows[0]?.vec || {};
}

export async function saveProfile(userId, vec) {
  const p = await getPool();
  if (!p) { mem.profiles.set(userId, vec); return; }
  await p.query(
    `INSERT INTO profiles (user_id,vec,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (user_id) DO UPDATE SET vec=EXCLUDED.vec, updated_at=now()`,
    [userId, JSON.stringify(vec)]
  );
}

// Cross-instance-safe profile read/modify/write. Use this for mutations that
// are not already part of a larger transaction.
export async function mutateProfile(userId, mutator) {
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      const next = await mutator(mem.profiles.get(userId) || {});
      mem.profiles.set(userId, next || {});
      return next || {};
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    await client.query(
      "INSERT INTO profiles (user_id,vec) VALUES ($1,'{}'::jsonb) ON CONFLICT (user_id) DO NOTHING", [userId]
    );
    const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const next = (await mutator(current.rows[0]?.vec || {})) || {};
    const serialized = JSON.stringify(next);
    if (serialized.length > 256 * 1024) throw new RangeError("profile exceeds 256 KiB");
    await client.query("UPDATE profiles SET vec=$2,updated_at=now() WHERE user_id=$1", [userId, serialized]);
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// All stored profiles, for cross-user similarity (lib/taste-graph). Capped —
// callers must report the cap so a partial scan never reads as a full one.
export async function listProfiles(limit = 500) {
  const p = await getPool();
  if (!p) {
    return Array.from(mem.profiles.entries()).slice(0, limit)
      .map(([userId, vec]) => ({ userId, vec }));
  }
  const { rows } = await p.query(
    "SELECT user_id, vec FROM profiles ORDER BY updated_at DESC LIMIT $1", [limit]
  );
  return rows.map((r) => ({ userId: r.user_id, vec: r.vec }));
}

// ---- Interaction log ----------------------------------------------------------

export async function recordInteraction(userId, itemId, action, dwellMs = null) {
  const p = await getPool();
  if (!p) { mem.interactions.push({ userId, itemId, action, dwellMs, at: Date.now() }); return; }
  await p.query(
    "INSERT INTO interactions (user_id,item_id,action,dwell_ms) VALUES ($1,$2,$3,$4)",
    [userId, itemId, action, dwellMs]
  );
}

const MEM_OPERATIONS_CAP = 5000;
const validOperationId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9-]{8,80}$/.test(value) ? value : null;

function rememberOperation(scope, userId, operationId) {
  if (!operationId) return true;
  const key = `${scope}:${userId}:${operationId}`;
  if (mem.operations.has(key)) return false;
  mem.operations.set(key, Date.now());
  if (mem.operations.size > MEM_OPERATIONS_CAP) {
    const oldest = mem.operations.keys().next().value;
    mem.operations.delete(oldest);
  }
  return true;
}

// Atomic learning commit for interaction batches. `reduce` is pure and returns
// { profile, edgePairs, popularity }; all durable writes share one transaction.
export async function commitInteractionBatch({ userId, operationId, events, reduce }) {
  const op = validOperationId(operationId);
  const canonical = events.map((event) => normalizeEvent(event.canonicalEvent));
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      if (!rememberOperation("interaction", userId, op)) {
        return { duplicate: true, profile: mem.profiles.get(userId) || {} };
      }
      const derived = reduce(mem.profiles.get(userId) || {});
      mem.profiles.set(userId, derived.profile);
      for (const n of canonical) memRecordEvent(n);
      for (const event of events) {
        mem.interactions.push({ userId, itemId: event.itemId, action: event.action, dwellMs: event.dwellMs, at: Date.now() });
      }
      await Promise.all([bumpEdges(derived.edgePairs), bumpPopularity(derived.popularity)]);
      return { duplicate: false, profile: derived.profile };
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    if (op) {
      const inserted = await client.query(
        `INSERT INTO processed_operations (scope,user_id,operation_id) VALUES ('interaction',$1,$2)
         ON CONFLICT DO NOTHING RETURNING operation_id`, [userId, op]
      );
      if (!inserted.rowCount) {
        const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1", [userId]);
        await client.query("COMMIT");
        return { duplicate: true, profile: current.rows[0]?.vec || {} };
      }
    }
    await client.query(
      "INSERT INTO profiles (user_id,vec) VALUES ($1,'{}'::jsonb) ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
    const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const derived = reduce(current.rows[0]?.vec || {});
    await client.query("UPDATE profiles SET vec=$2,updated_at=now() WHERE user_id=$1", [userId, JSON.stringify(derived.profile)]);
    await client.query(
      `INSERT INTO interactions (user_id,item_id,action,dwell_ms)
       SELECT $1,item_id,action,dwell_ms
       FROM jsonb_to_recordset($2::jsonb) AS x(item_id text,action text,dwell_ms integer)`,
      [userId, JSON.stringify(events.map((event) => ({
        item_id: event.itemId, action: event.action, dwell_ms: event.dwellMs,
      })))]
    );
    await client.query(
      `INSERT INTO user_events (user_id,type,payload,at)
       SELECT user_id,type,payload,to_timestamp(at/1000.0)
       FROM jsonb_to_recordset($1::jsonb) AS x(user_id text,type text,payload jsonb,at double precision)`,
      [JSON.stringify(canonical.map((n) => ({ user_id: n.userId, type: n.type, payload: n.payload, at: n.at })))]
    );
    await writeEdges(client, derived.edgePairs);
    await writePopularity(client, derived.popularity);
    await client.query("COMMIT");
    return { duplicate: false, profile: derived.profile };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function writeEdges(target, pairs = []) {
  const clean = pairs.filter(({ a, b }) => a && b && a !== b).map(({ a, b, w = 1 }) => ({
    a: a < b ? a : b, b: a < b ? b : a, w: Number(w) || 0,
  }));
  if (!clean.length) return;
  await target.query(
    `WITH input AS (
       SELECT a,b,sum(w)::real AS w FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text,w real) GROUP BY a,b
     ) INSERT INTO edges (a,b,w) SELECT a,b,w FROM input
     ON CONFLICT (a,b) DO UPDATE SET w=edges.w+EXCLUDED.w`, [JSON.stringify(clean)]
  );
}

async function writePopularity(target, entries = []) {
  const clean = entries.filter(({ id }) => id).map(({ id, eng = 0, imp = 0 }) => ({
    id, eng: Number(eng) || 0, imp: Number(imp) || 0,
  }));
  if (!clean.length) return;
  await target.query(
    `WITH input AS (
       SELECT id,sum(eng)::real AS eng,sum(imp)::real AS imp
       FROM jsonb_to_recordset($1::jsonb) AS x(id text,eng real,imp real) GROUP BY id
     ) INSERT INTO popularity (item_id,eng,imp,updated_at) SELECT id,eng,imp,now() FROM input
     ON CONFLICT (item_id) DO UPDATE SET eng=popularity.eng+EXCLUDED.eng,
       imp=popularity.imp+EXCLUDED.imp,updated_at=now()`, [JSON.stringify(clean)]
  );
}

// Per-user event history (newest first) — powers the orders/tickets view.
export async function getInteractions(userId, { action = null, limit = 50 } = {}) {
  const p = await getPool();
  if (!p) {
    return mem.interactions
      .filter((i) => i.userId === userId && (!action || i.action === action))
      .slice(-limit)
      .reverse()
      .map((i) => ({ itemId: i.itemId, action: i.action, at: i.at }));
  }
  const { rows } = await p.query(
    `SELECT item_id, action, created_at FROM interactions
     WHERE user_id=$1 AND ($2::text IS NULL OR action=$2)
     ORDER BY created_at DESC LIMIT $3`,
    [userId, action, limit]
  );
  return rows.map((r) => ({ itemId: r.item_id, action: r.action, at: new Date(r.created_at).getTime() }));
}

// ---- Canonical event history (Alpha Learning Brain training data) --------------
// Durable log of lib/events records. This is the brain's future training
// history — write-only today, read by learning jobs later.

const MEM_EVENTS_CAP = 5000; // in-memory fallback stays bounded

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

export async function recordEvent(evt) {
  const n = normalizeEvent(evt);
  const p = await getPool();
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
  const p = await getPool();
  if (!p) return mem.events.filter((e) => e.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT user_id, type, payload, at FROM user_events WHERE user_id=$1 ORDER BY at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map((r) => ({ userId: r.user_id, type: r.type, payload: r.payload, at: new Date(r.at).getTime() }));
}

// ---- Co-engagement graph (Pinterest-style taste graph) -------------------------
// Edges connect items the same person engaged with close together in a session,
// or saved to the same board (board co-membership — the strongest signal).

export async function bumpEdges(pairs = []) {
  if (!pairs.length) return;
  const p = await getPool();
  if (!p) {
    for (const { a, b, w = 1 } of pairs) {
      if (!a || !b || a === b) continue;
      const k = edgeKey(a, b);
      mem.edges.set(k, (mem.edges.get(k) || 0) + w);
    }
    return;
  }
  await writeEdges(p, pairs);
}

// Neighborhood lookup: for each requested id, its neighbors and edge weights.
// Returns { id: { neighborId: weight } }.
export async function getEdges(ids = []) {
  const out = {};
  if (!ids.length) return out;
  const want = new Set(ids);
  const add = (a, b, w) => {
    if (want.has(a)) { (out[a] = out[a] || {})[b] = (out[a][b] || 0) + w; }
    if (want.has(b)) { (out[b] = out[b] || {})[a] = (out[b][a] || 0) + w; }
  };
  const p = await getPool();
  if (!p) {
    for (const [k, w] of mem.edges) {
      const i = k.indexOf("|");
      add(k.slice(0, i), k.slice(i + 1), w);
    }
    return out;
  }
  const { rows } = await p.query(
    "SELECT a,b,w FROM edges WHERE a = ANY($1) OR b = ANY($1)",
    [ids]
  );
  for (const r of rows) add(r.a, r.b, Number(r.w));
  return out;
}

// ---- Popularity counters (TikTok-style engagement/exposure) --------------------

export async function bumpPopularity(entries = []) {
  if (!entries.length) return;
  const p = await getPool();
  if (!p) {
    for (const { id, eng = 0, imp = 0 } of entries) {
      if (!id) continue;
      const cur = mem.popularity.get(id) || { eng: 0, imp: 0 };
      cur.eng += eng; cur.imp += imp;
      mem.popularity.set(id, cur);
    }
    return;
  }
  await writePopularity(p, entries);
}

// Returns { itemId: { eng, imp } } for the most-engaged items.
export async function getPopularity(limit = 5000) {
  const p = await getPool();
  const out = {};
  if (!p) {
    for (const [id, v] of mem.popularity) out[id] = v;
    return out;
  }
  const { rows } = await p.query(
    "SELECT item_id,eng,imp FROM popularity ORDER BY eng DESC LIMIT $1",
    [limit]
  );
  for (const r of rows) out[r.item_id] = { eng: Number(r.eng), imp: Number(r.imp) };
  return out;
}

// ---- Boards (Pinterest-style moodboards; shareable by id) ----------------------

function newBoardId() {
  return "b-" + randomUUID();
}

export async function createBoard(userId, name) {
  const board = { id: newBoardId(), userId, name, items: [], isDefault: false };
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      board.isDefault = !Array.from(mem.boards.values()).some((entry) => entry.userId === userId && entry.isDefault);
      mem.boards.set(board.id, board);
      return board;
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    const current = await client.query(
      "SELECT 1 FROM boards WHERE user_id=$1 AND is_default=true LIMIT 1", [userId]);
    board.isDefault = !current.rowCount;
    await client.query(
      "INSERT INTO boards (id,user_id,name,is_default) VALUES ($1,$2,$3,$4)",
      [board.id, userId, name, board.isDefault]
    );
    await client.query("COMMIT");
    return board;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getBoards(userId) {
  const p = await getPool();
  if (!p) {
    return Array.from(mem.boards.values()).filter((b) => b.userId === userId);
  }
  const { rows } = await p.query(
    `SELECT b.id,b.user_id,b.name,b.is_default,
       COALESCE(jsonb_agg(bi.item ORDER BY bi.created_at) FILTER (WHERE bi.item_id IS NOT NULL),'[]'::jsonb) AS items
     FROM boards b LEFT JOIN board_items bi ON bi.board_id=b.id
     WHERE b.user_id=$1 GROUP BY b.id,b.user_id,b.name,b.is_default,b.created_at
     ORDER BY b.is_default DESC,b.created_at`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, name: r.name,
    isDefault: r.is_default === true, items: r.items || [],
  }));
}

export async function getBoard(boardId) {
  const p = await getPool();
  if (!p) return mem.boards.get(boardId) || null;
  return boardFromTarget(p, boardId);
}

async function boardFromTarget(target, boardId) {
  const { rows } = await target.query(
    `SELECT b.id,b.user_id,b.name,b.is_default,
       COALESCE(jsonb_agg(bi.item ORDER BY bi.created_at) FILTER (WHERE bi.item_id IS NOT NULL),'[]'::jsonb) AS items
     FROM boards b LEFT JOIN board_items bi ON bi.board_id=b.id
     WHERE b.id=$1 GROUP BY b.id,b.user_id,b.name,b.is_default`, [boardId]
  );
  return rows[0]
    ? { id: rows[0].id, userId: rows[0].user_id, name: rows[0].name,
        isDefault: rows[0].is_default === true, items: rows[0].items || [] }
    : null;
}

// Adds an item to a board (idempotent). Returns the updated board.
export async function addBoardItem(boardId, item) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board) return null;
    if (!board.items.some((x) => x.id === item.id)) board.items.push(item);
    return board;
  }
  await p.query(
    `INSERT INTO board_items (board_id,item_id,item) VALUES ($1,$2,$3)
     ON CONFLICT (board_id,item_id) DO NOTHING`,
    [boardId, item.id, JSON.stringify(item)]
  );
  return getBoard(boardId);
}

// Atomic board save + derived learning. The unique board/item key makes retries
// harmless, while the transaction prevents a saved item without its event.
export async function commitBoardSave({ userId, boardId = null, defaultName = "moodboard", item,
  canonicalEvent, reduce, priorLimit = 10 }) {
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      let board = boardId ? mem.boards.get(boardId) : null;
      if (boardId && (!board || board.userId !== userId)) return { board: null, inserted: false };
      if (!board) {
        board = Array.from(mem.boards.values()).find((entry) => entry.userId === userId && entry.isDefault) ||
          Array.from(mem.boards.values()).find((entry) => entry.userId === userId);
      }
      if (!board) {
        board = { id: newBoardId(), userId, name: defaultName, items: [], isDefault: true };
        mem.boards.set(board.id, board);
      } else if (!board.isDefault && !Array.from(mem.boards.values()).some((entry) =>
        entry.userId === userId && entry.isDefault)) {
        board.isDefault = true;
      }
      if (board.items.some((entry) => entry.id === item.id)) return { board, inserted: false };
      const event = normalizeEvent(typeof canonicalEvent === "function"
        ? canonicalEvent(board.id) : canonicalEvent);
      const priorItems = board.items.slice(-priorLimit);
      const derived = reduce(mem.profiles.get(userId) || {}, priorItems);
      board.items.push(item);
      mem.profiles.set(userId, derived.profile);
      memRecordEvent(event);
      mem.interactions.push({ userId, itemId: item.id, action: "save", dwellMs: null, at: Date.now() });
      await Promise.all([bumpEdges(derived.edgePairs), bumpPopularity(derived.popularity)]);
      return { board, inserted: true };
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    let resolvedBoardId = boardId;
    if (resolvedBoardId) {
      const owner = await client.query(
        "SELECT id FROM boards WHERE id=$1 AND user_id=$2 FOR UPDATE", [resolvedBoardId, userId]);
      if (!owner.rowCount) {
        await client.query("ROLLBACK");
        return { board: null, inserted: false };
      }
    } else {
      let target = await client.query(
        `SELECT id FROM boards WHERE user_id=$1 AND is_default=true
         ORDER BY created_at,id LIMIT 1 FOR UPDATE`, [userId]);
      if (!target.rowCount) {
        target = await client.query(
          "SELECT id FROM boards WHERE user_id=$1 ORDER BY created_at,id LIMIT 1 FOR UPDATE", [userId]);
        if (target.rowCount) {
          await client.query("UPDATE boards SET is_default=true WHERE id=$1", [target.rows[0].id]);
        } else {
          resolvedBoardId = newBoardId();
          await client.query(
            "INSERT INTO boards (id,user_id,name,is_default) VALUES ($1,$2,$3,true)",
            [resolvedBoardId, userId, defaultName]
          );
        }
      }
      if (!resolvedBoardId) resolvedBoardId = target.rows[0].id;
    }
    const event = normalizeEvent(typeof canonicalEvent === "function"
      ? canonicalEvent(resolvedBoardId) : canonicalEvent);
    const prior = await client.query(
      "SELECT item FROM board_items WHERE board_id=$1 ORDER BY created_at DESC LIMIT $2", [resolvedBoardId, priorLimit]
    );
    const inserted = await client.query(
      `INSERT INTO board_items (board_id,item_id,item) VALUES ($1,$2,$3)
       ON CONFLICT (board_id,item_id) DO NOTHING RETURNING item_id`,
      [resolvedBoardId, item.id, JSON.stringify(item)]
    );
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { board: await boardFromTarget(client, resolvedBoardId), inserted: false };
    }
    await client.query(
      "INSERT INTO profiles (user_id,vec) VALUES ($1,'{}'::jsonb) ON CONFLICT (user_id) DO NOTHING", [userId]
    );
    const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const derived = reduce(current.rows[0]?.vec || {}, prior.rows.map((row) => row.item));
    await client.query("UPDATE profiles SET vec=$2,updated_at=now() WHERE user_id=$1", [userId, JSON.stringify(derived.profile)]);
    await client.query(EVENT_INSERT_SQL, [event.userId, event.type, event.payloadJson, event.at]);
    await client.query(
      "INSERT INTO interactions (user_id,item_id,action,dwell_ms) VALUES ($1,$2,'save',NULL)", [userId, item.id]
    );
    await writeEdges(client, derived.edgePairs);
    await writePopularity(client, derived.popularity);
    await client.query("COMMIT");
    return { board: await boardFromTarget(client, resolvedBoardId), inserted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function removeBoardItem(boardId, itemId, userId = null) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board || (userId && board.userId !== userId)) return null;
    board.items = board.items.filter((x) => x.id !== itemId);
    return board;
  }
  const removed = await p.query(
    `DELETE FROM board_items AS item USING boards AS board
     WHERE item.board_id=board.id AND item.board_id=$1 AND item.item_id=$2
       AND ($3::text IS NULL OR board.user_id=$3)`,
    [boardId, itemId, userId]
  );
  if (!removed.rowCount && userId) {
    const owner = await p.query("SELECT 1 FROM boards WHERE id=$1 AND user_id=$2", [boardId, userId]);
    if (!owner.rowCount) return null;
  }
  return getBoard(boardId);
}

export async function renameBoard(boardId, name, userId = null) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board || (userId && board.userId !== userId)) return null;
    board.name = name;
    return board;
  }
  const renamed = await p.query(
    "UPDATE boards SET name=$2 WHERE id=$1 AND ($3::text IS NULL OR user_id=$3)",
    [boardId, name, userId]
  );
  if (!renamed.rowCount) return null;
  return getBoard(boardId);
}

// ---- Aggregates for the stats dashboard ---------------------------------------

export async function getStats() {
  const p = await getPool();
  if (!p) {
    const actions = {};
    for (const i of mem.interactions) actions[i.action] = (actions[i.action] || 0) + 1;
    const top = Array.from(mem.popularity.entries())
      .map(([id, v]) => ({ id, eng: v.eng, imp: v.imp }))
      .sort((a, b) => b.eng - a.eng)
      .slice(0, 10);
    return {
      persistent: false,
      interactions: mem.interactions.length,
      actions,
      users: mem.profiles.size,
      boards: mem.boards.size,
      edges: mem.edges.size,
      topItems: top,
    };
  }
  const [acts, users, boards, edges, top] = await Promise.all([
    p.query("SELECT action, COUNT(*)::int AS n FROM interactions GROUP BY action"),
    p.query("SELECT COUNT(*)::int AS n FROM profiles"),
    p.query("SELECT COUNT(*)::int AS n FROM boards"),
    p.query("SELECT COUNT(*)::int AS n FROM edges"),
    p.query("SELECT item_id, eng, imp FROM popularity ORDER BY eng DESC LIMIT 10"),
  ]);
  const actions = {};
  let total = 0;
  for (const r of acts.rows) { actions[r.action] = r.n; total += r.n; }
  return {
    persistent: true,
    interactions: total,
    actions,
    users: users.rows[0].n,
    boards: boards.rows[0].n,
    edges: edges.rows[0].n,
    topItems: top.rows.map((r) => ({ id: r.item_id, eng: Number(r.eng), imp: Number(r.imp) })),
  };
}
