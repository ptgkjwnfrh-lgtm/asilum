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

let pool = null;

async function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await ensureSchema();
    return pool;
  } catch (e) {
    console.warn("[db] Postgres unavailable, using memory store:", e.message);
    return null;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  title TEXT, brand TEXT, price NUMERIC, currency TEXT,
  tags JSONB, img TEXT, alt TEXT, source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE items ADD COLUMN IF NOT EXISTS designers JSONB;
ALTER TABLE items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS era JSONB;
ALTER TABLE items ADD COLUMN IF NOT EXISTS size JSONB;
ALTER TABLE items ADD COLUMN IF NOT EXISTS url TEXT;
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  vec JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT, item_id TEXT, action TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS dwell_ms INTEGER;
CREATE TABLE IF NOT EXISTS edges (
  a TEXT NOT NULL, b TEXT NOT NULL,
  w REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS edges_b ON edges (b);
CREATE TABLE IF NOT EXISTS popularity (
  item_id TEXT PRIMARY KEY,
  eng REAL NOT NULL DEFAULT 0,
  imp REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_items (
  board_id TEXT NOT NULL, item_id TEXT NOT NULL, item JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (board_id, item_id)
);
CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_events_user_at ON user_events (user_id, at DESC);`;

async function ensureSchema() {
  if (!pool) return;
  await pool.query(SCHEMA);
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
  const p = await getPool();
  if (!p) return Array.from(mem.items.values()).slice(-limit);
  const { rows } = await p.query("SELECT * FROM items ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows;
}

export async function upsertItems(items = []) {
  const p = await getPool();
  if (!p) {
    for (const it of items) mem.items.set(it.id, it);
    return items.length;
  }
  for (const it of items) {
    await p.query(
      `INSERT INTO items (id,title,brand,price,currency,tags,img,alt,source,designers,category,era,size,url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, brand=EXCLUDED.brand, price=EXCLUDED.price,
         currency=EXCLUDED.currency, tags=EXCLUDED.tags, img=EXCLUDED.img,
         alt=EXCLUDED.alt, designers=EXCLUDED.designers, category=EXCLUDED.category,
         era=EXCLUDED.era, size=EXCLUDED.size, url=EXCLUDED.url`,
      [it.id, it.title, it.brand, it.price, it.currency,
       JSON.stringify(it.tags || {}), it.img, it.alt, it.source,
       JSON.stringify(it.designers || []), it.category || null,
       JSON.stringify(it.era || null), JSON.stringify(it.size || null), it.url || null]
    );
  }
  return items.length;
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

export async function recordEvent(evt) {
  if (!evt || typeof evt.userId !== "string" || typeof evt.type !== "string") {
    throw new TypeError("event userId and type are required");
  }
  if (!evt.userId || evt.userId.length > 80 || evt.type.length > 80) {
    throw new TypeError("invalid event identity or type");
  }
  const userId = evt.userId;
  const payload = JSON.stringify(evt.payload || {});
  if (payload.length > 8192) throw new RangeError("event payload exceeds 8 KiB");
  const normalized = { ...evt, userId, payload: evt.payload || {} };
  const p = await getPool();
  if (!p) {
    mem.events.push(normalized);
    if (mem.events.length > MEM_EVENTS_CAP) mem.events.splice(0, mem.events.length - MEM_EVENTS_CAP);
    return;
  }
  await p.query(
    "INSERT INTO user_events (user_id,type,payload,at) VALUES ($1,$2,$3,to_timestamp($4/1000.0))",
    [userId, evt.type, payload, evt.at || Date.now()]
  );
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
  for (const { a, b, w = 1 } of pairs) {
    if (!a || !b || a === b) continue;
    const [x, y] = a < b ? [a, b] : [b, a];
    await p.query(
      `INSERT INTO edges (a,b,w) VALUES ($1,$2,$3)
       ON CONFLICT (a,b) DO UPDATE SET w = edges.w + EXCLUDED.w`,
      [x, y, w]
    );
  }
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
  for (const { id, eng = 0, imp = 0 } of entries) {
    if (!id) continue;
    await p.query(
      `INSERT INTO popularity (item_id,eng,imp,updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (item_id) DO UPDATE SET
         eng = popularity.eng + EXCLUDED.eng,
         imp = popularity.imp + EXCLUDED.imp,
         updated_at = now()`,
      [id, eng, imp]
    );
  }
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
  return "b" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function createBoard(userId, name) {
  const board = { id: newBoardId(), userId, name, items: [] };
  const p = await getPool();
  if (!p) { mem.boards.set(board.id, board); return board; }
  await p.query("INSERT INTO boards (id,user_id,name) VALUES ($1,$2,$3)", [board.id, userId, name]);
  return board;
}

export async function getBoards(userId) {
  const p = await getPool();
  if (!p) {
    return Array.from(mem.boards.values()).filter((b) => b.userId === userId);
  }
  const { rows } = await p.query(
    "SELECT id,user_id,name FROM boards WHERE user_id=$1 ORDER BY created_at",
    [userId]
  );
  const boards = [];
  for (const r of rows) {
    boards.push({ id: r.id, userId: r.user_id, name: r.name, items: await boardItems(p, r.id) });
  }
  return boards;
}

export async function getBoard(boardId) {
  const p = await getPool();
  if (!p) return mem.boards.get(boardId) || null;
  const { rows } = await p.query("SELECT id,user_id,name FROM boards WHERE id=$1", [boardId]);
  if (!rows[0]) return null;
  return { id: rows[0].id, userId: rows[0].user_id, name: rows[0].name, items: await boardItems(p, boardId) };
}

async function boardItems(p, boardId) {
  const { rows } = await p.query(
    "SELECT item FROM board_items WHERE board_id=$1 ORDER BY created_at",
    [boardId]
  );
  return rows.map((r) => r.item);
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

export async function removeBoardItem(boardId, itemId) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board) return null;
    board.items = board.items.filter((x) => x.id !== itemId);
    return board;
  }
  await p.query("DELETE FROM board_items WHERE board_id=$1 AND item_id=$2", [boardId, itemId]);
  return getBoard(boardId);
}

export async function renameBoard(boardId, name) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board) return null;
    board.name = name;
    return board;
  }
  await p.query("UPDATE boards SET name=$2 WHERE id=$1", [boardId, name]);
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
