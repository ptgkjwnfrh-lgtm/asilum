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
import { createHash } from "node:crypto";
import { canonicalPair, edgeStrength, corroborationEnabled, CONTRIB_CAP, EDGE_FANOUT_CAP, MEM_EDGES_CAP } from "../brain/edges.js";
import { popularityDedupEnabled } from "../brain/popularity.js";

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
        statement_timeout: 15_000,
        query_timeout: 20_000,
        lock_timeout: 5_000,
        idle_in_transaction_session_timeout: 10_000,
        max: Math.max(1, Math.min(20, Number(process.env.DATABASE_POOL_MAX) || 5)),
        idleTimeoutMillis: 30_000,
      });
      await verifySchema(candidate);
      pool = candidate;
      return pool;
    } catch (e) {
      if (candidate) await candidate.end().catch(() => {});
      pool = null;
      const detail = String(e?.message || "");
      const safeDetail = /^(?:database migrations required|unsafe database role;)/.test(detail)
        ? `: ${detail}` : "";
      throw new Error(`Postgres initialization failed${safeDetail}`, { cause: e });
    } finally {
      poolPromise = null;
    }
  })();
  return poolPromise;
}

const REQUIRED_TABLES = [
  "ai_model_events", "api_rate_limits", "app_schema_migrations", "board_items",
  "boards", "edges", "editorial_posts", "identity_adoptions", "interactions",
  "interpretation_feedback", "unknown_queries", "unknown_query_votes",
  "items", "learned_facts", "moderation_tasks", "mood_board_analysis",
  "mood_board_uploads", "ontology_relationships", "ontology_tags", "popularity",
  "processed_operations", "product_ai_tags", "product_availability_checks",
  "product_images", "product_tags", "profiles", "purchase_tickets", "search_logs",
  "search_mappings", "source_connections", "source_sync_logs", "stylist_feedback",
  "stylist_outfits", "stylist_requests", "tag_reconciliations", "user_corrections",
  "user_events", "user_style_profiles",
  "user_measurements", "asterisk_memory_preferences", "user_follows", "wardrobe_items",
  "discover_rails", "user_rail_prefs",
  "profile_themes", "profile_rooms", "profile_modules",
  "brand_cases", "brand_case_events",
  "edge_contributors", "popularity_contributors",
];
const REQUIRED_SCHEMA_VERSION = 23;

async function verifySchema(target) {
  const expectedRole = (process.env.DATABASE_EXPECTED_ROLE ||
    (process.env.NODE_ENV === "production" ? "asilum_app" : "")).trim();
  if (expectedRole) {
    const role = await target.query("SELECT current_user AS role");
    if (role.rows[0]?.role !== expectedRole) {
      throw new Error(
        `unsafe database role; expected ${expectedRole}, connected as ${role.rows[0]?.role || "unknown"}`
      );
    }
  }
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

// Indexed candidate retrieval for user-facing search. Text hits and mapped
// product tags are gathered in Postgres so ranking no longer needs to scan the
// newest 5,000 rows in application memory for every query.
//
// Release blocker 0A-5: the old single query mixed text and tag matches under
// ORDER BY text_rank DESC, so past the candidate cap every tag-only match
// (text_rank 0) was truncated by RECENCY, and the cap itself was silent. The
// two channels now retrieve independently — text/brand by rank, tag matches
// by summed evidence confidence — each relevance-preserving under its own
// bound, and the result reports `truncated` so no caller can mistake a capped
// candidate set for the whole catalog. Returns { rows, truncated }.
export async function searchItemCandidates(query, mappedTags = [], limit = 1200) {
  const q = String(query || "").trim().slice(0, 200);
  const tags = [...new Set(mappedTags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))].slice(0, 24);
  limit = Math.max(1, Math.min(2000, Number(limit) || 1200));
  const p = await getPool();
  if (!p) return { rows: Array.from(mem.items.values()).slice(-limit), truncated: false };
  const textLimit = Math.ceil(limit * 0.7);
  const tagLimit = Math.ceil(limit * 0.5);
  const textQuery = p.query(
    `WITH query AS (SELECT websearch_to_tsquery('simple', $1) AS value)
     SELECT i.*,
       ts_rank_cd(i.search_document, query.value, 32) AS text_rank
     FROM items AS i
     CROSS JOIN query
     WHERE i.moderation_status='visible'
       AND i.is_available=true
       AND (i.search_document @@ query.value OR lower(i.brand)=lower($1))
     ORDER BY text_rank DESC, i.created_at DESC
     LIMIT $2`,
    [q, textLimit + 1]
  );
  const tagQuery = tags.length ? p.query(
    `SELECT i.*, 0 AS text_rank
     FROM items AS i
     JOIN (
       SELECT product_id, sum(confidence) AS evidence
       FROM product_tags WHERE tag=ANY($1::text[])
       GROUP BY product_id
     ) AS pt ON pt.product_id=i.id
     WHERE i.moderation_status='visible'
       AND i.is_available=true
     ORDER BY pt.evidence DESC, i.created_at DESC
     LIMIT $2`,
    [tags, tagLimit + 1]
  ) : Promise.resolve({ rows: [] });
  const [textRes, tagRes] = await Promise.all([textQuery, tagQuery]);
  const truncated = textRes.rows.length > textLimit || tagRes.rows.length > tagLimit;
  const seen = new Map();
  for (const row of [...textRes.rows.slice(0, textLimit), ...tagRes.rows.slice(0, tagLimit)]) {
    if (!seen.has(row.id)) {
      seen.set(row.id, {
        ...row,
        price: row.price == null ? null : Number(row.price),
        _textRank: Number(row.text_rank) || 0,
      });
    }
  }
  return { rows: [...seen.values()], truncated };
}

export async function listItemBrands(limit = 5000) {
  limit = Math.max(1, Math.min(10_000, Number(limit) || 5000));
  const p = await getPool();
  if (!p) return [...new Set(Array.from(mem.items.values()).map((item) => item.brand).filter(Boolean))].slice(0, limit);
  const { rows } = await p.query(
    `SELECT brand FROM items
     WHERE brand IS NOT NULL AND moderation_status='visible'
     GROUP BY brand ORDER BY count(*) DESC, brand LIMIT $1`, [limit]
  );
  return rows.map((row) => row.brand);
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
    color_evidence: it.color_evidence || it.colorEvidence || {},
    url: it.url || it.source_product_url || null,
    is_available: it.is_available !== false,
    availability_status: it.availability_status || "unknown",
  }));
  await p.query(
    `INSERT INTO items
       (id,title,brand,price,currency,tags,img,alt,source,designers,category,era,size,url,
        source_name,source_product_id,source_product_url,slug,description,subcategory,color,
        material,fit,silhouette,condition,decade,color_evidence,is_available,availability_status,last_synced_at,updated_at)
     SELECT id,title,brand,price,currency,COALESCE(tags,'{}'::jsonb),img,alt,source,
            COALESCE(designers,'[]'::jsonb),category,era,size,url,source_name,source_product_id,
            source_product_url,slug,description,subcategory,color,material,fit,silhouette,
            condition,decade,COALESCE(color_evidence,'{}'::jsonb),COALESCE(is_available,true),COALESCE(availability_status,'unknown'),now(),now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text,title text,brand text,price numeric,currency text,tags jsonb,img text,alt text,
       source text,designers jsonb,category text,era jsonb,size jsonb,url text,source_name text,
       source_product_id text,source_product_url text,slug text,description text,subcategory text,
       color text,material text,fit text,silhouette text,condition text,decade text,color_evidence jsonb,
       is_available boolean,availability_status text)
     ON CONFLICT (id) DO UPDATE SET
       title=EXCLUDED.title,brand=EXCLUDED.brand,price=EXCLUDED.price,currency=EXCLUDED.currency,
       tags=EXCLUDED.tags,img=EXCLUDED.img,alt=EXCLUDED.alt,source=EXCLUDED.source,
       designers=EXCLUDED.designers,category=EXCLUDED.category,era=EXCLUDED.era,size=EXCLUDED.size,
       url=EXCLUDED.url,source_name=EXCLUDED.source_name,source_product_id=EXCLUDED.source_product_id,
       source_product_url=EXCLUDED.source_product_url,slug=EXCLUDED.slug,description=EXCLUDED.description,
       subcategory=EXCLUDED.subcategory,color=EXCLUDED.color,material=EXCLUDED.material,fit=EXCLUDED.fit,
       silhouette=EXCLUDED.silhouette,condition=EXCLUDED.condition,decade=EXCLUDED.decade,
       color_evidence=EXCLUDED.color_evidence,
       is_available=EXCLUDED.is_available,availability_status=EXCLUDED.availability_status,
       last_synced_at=now(),updated_at=now()`,
    [JSON.stringify(payload)]
  );
  return rows.length;
}

// ---- Embeddings (v1 seam, asterisk-boost r4) ---------------------------------
// Rows live in the schema-alpha `embeddings` table (jsonb vector — pgvector
// upgrade is a later, deliberate migration). id = "<space>:<owner_id>".

export async function saveEmbeddings(rows = []) {
  const clean = rows
    .filter((r) => r && r.ownerId && r.space && Array.isArray(r.vector))
    .map((r) => ({
      id: `${r.space}:${r.ownerId}`,
      owner_id: r.ownerId,
      owner_kind: r.ownerKind || "product",
      space: r.space,
      provider: r.provider || null,
      vector: r.vector,
    }));
  if (!clean.length) return 0;
  const p = await getPool();
  if (!p) {
    for (const r of clean) mem.embeddings.set(r.id, r);
    return clean.length;
  }
  await p.query(
    `INSERT INTO embeddings (id, owner_id, owner_kind, space, provider, vector, updated_at)
     SELECT id, owner_id, owner_kind, space, provider, vector, now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text, owner_id text, owner_kind text, space text, provider text, vector jsonb)
     ON CONFLICT (id) DO UPDATE SET
       provider=EXCLUDED.provider, vector=EXCLUDED.vector, updated_at=now()`,
    [JSON.stringify(clean)]
  );
  return clean.length;
}

export async function listEmbeddings(space, ownerKind = "product", limit = 5000) {
  const p = await getPool();
  if (!p) {
    return [...mem.embeddings.values()]
      .filter((r) => r.space === space && r.owner_kind === ownerKind)
      .slice(0, limit);
  }
  const { rows } = await p.query(
    `SELECT id, owner_id, owner_kind, space, provider, vector
     FROM embeddings WHERE space=$1 AND owner_kind=$2 LIMIT $3`,
    [space, ownerKind, limit]
  );
  return rows;
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
  limit = Math.max(1, Math.min(1000, Math.trunc(Number(limit)) || 500));
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
      await Promise.all([bumpEdges(derived.edgePairs, userId), bumpPopularity(derived.popularity, userId)]);
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
    await writeEdges(client, derived.edgePairs, userId);
    await writePopularity(client, derived.popularity, userId);
    await client.query("COMMIT");
    return { duplicate: false, profile: derived.profile };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function writeEdges(target, pairs = [], userId = null) {
  // One canonical row per pair, and within ONE request a contributor's
  // strongest action for that pair wins (max, not sum) — repetition inside a
  // batch was the cheapest half of the forgery.
  const best = new Map();
  for (const { a, b, w = 1 } of pairs) {
    if (!a || !b || a === b) continue;
    const key = canonicalPair(a, b);
    const weight = Number(w) || 0;
    if (weight <= 0) continue;
    const k = key.a + "|" + key.b;
    const prev = best.get(k);
    if (!prev || weight > prev.w) best.set(k, { a: key.a, b: key.b, w: weight });
  }
  const clean = [...best.values()];
  if (!clean.length) return;

  if (!corroborationEnabled() || !userId) {
    // Legacy path (BRAIN_EDGE_CORROBORATION=0), byte-for-byte the old rule.
    await target.query(
      `WITH input AS (
         SELECT a,b,sum(w)::real AS w FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text,w real) GROUP BY a,b
       ) INSERT INTO edges (a,b,w) SELECT a,b,w FROM input
       ON CONFLICT (a,b) DO UPDATE SET w=edges.w+EXCLUDED.w`, [JSON.stringify(clean)]
    );
    return;
  }

  const hash = identityHash(userId);
  // `edges` is a MATERIALIZED VIEW of the ledger: w is the sum of each
  // contributor's best weight for the pair, contributors is the distinct
  // count. TWO statements, deliberately: CTEs in a single statement read a
  // snapshot taken at statement start, so a recompute fused onto the insert
  // cannot see the row it just wrote and lags by exactly one contributor
  // (CI caught this: three distinct people scored 2). Splitting them inside
  // the transaction makes the write visible to the recompute.
  //
  // Recompute rather than delta-arithmetic because a repeat contributor
  // RAISING their best (favorite → bag) must move w by the difference, and
  // ON CONFLICT cannot see the pre-update value in RETURNING. It is
  // idempotent, and it HEALS the historical rows: a poisoned w is replaced by
  // the honest ledger sum the first time the pair is touched again.
  //
  // CONTRIB_CAP bounds storage: past the cap the curve is flat, so a new
  // identity's row would buy no ranking and cost a row. Existing contributors
  // may always update their own.
  const runBoth = async (q) => {
    await q(
      `WITH input AS (
         SELECT a,b,max(w)::real AS w
         FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text,w real) GROUP BY a,b
       ), allowed AS (
         SELECT i.* FROM input i
         LEFT JOIN edges e ON e.a = i.a AND e.b = i.b
         WHERE COALESCE(e.contributors, 0) < $3::int
            OR EXISTS (SELECT 1 FROM edge_contributors c
                       WHERE c.a = i.a AND c.b = i.b AND c.identity_hash = $2)
       )
       INSERT INTO edge_contributors (a,b,identity_hash,w)
       SELECT a,b,$2,w FROM allowed
       ON CONFLICT (a,b,identity_hash)
         DO UPDATE SET w = GREATEST(edge_contributors.w, EXCLUDED.w)`,
      [JSON.stringify(clean), hash, CONTRIB_CAP]
    );
    await q(
      `WITH touched AS (
         SELECT DISTINCT a,b FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text)
       ), agg AS (
         SELECT t.a, t.b,
                COALESCE(sum(c.w),0)::real AS w,
                count(c.identity_hash)::int AS contributors
         FROM touched t LEFT JOIN edge_contributors c ON c.a = t.a AND c.b = t.b
         GROUP BY t.a, t.b
       )
       INSERT INTO edges (a,b,w,contributors)
       SELECT a, b, w, LEAST($2::int, contributors) FROM agg WHERE contributors > 0
       ON CONFLICT (a,b) DO UPDATE
         SET w = EXCLUDED.w, contributors = EXCLUDED.contributors`,
      [JSON.stringify(clean.map(({ a, b }) => ({ a, b }))), CONTRIB_CAP]
    );
  };

  // A pooled CLIENT also has .connect() — calling it throws "Client has
  // already been connected". Only a Pool hands out clients, and only a
  // pooled client has .release(), so that is the discriminating test.
  const isPool = typeof target.connect === "function" && typeof target.release !== "function";
  if (isPool) {
    // Standalone caller (a pool): the two statements need their own
    // transaction or a crash between them leaves the view stale.
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      await runBoth((text, params) => client.query(text, params));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  await runBoth((text, params) => target.query(text, params));
}

async function writePopularity(target, entries = [], userId = null) {
  const clean = entries.filter(({ id }) => id).map(({ id, eng = 0, imp = 0 }) => ({
    id, eng: Number(eng) || 0, imp: Number(imp) || 0,
  }));
  if (!clean.length) return;

  const runRaw = (q) => q(
    `WITH input AS (
       SELECT id,sum(eng)::real AS eng,sum(imp)::real AS imp
       FROM jsonb_to_recordset($1::jsonb) AS x(id text,eng real,imp real) GROUP BY id
     ) INSERT INTO popularity (item_id,eng,imp,updated_at) SELECT id,eng,imp,now() FROM input
     ON CONFLICT (item_id) DO UPDATE SET eng=popularity.eng+EXCLUDED.eng,
       imp=popularity.imp+EXCLUDED.imp,updated_at=now()`, [JSON.stringify(clean)]
  );

  if (!popularityDedupEnabled() || !userId) {
    await runRaw((text, params) => target.query(text, params));
    return;
  }

  // eng/imp stay as diagnostics (and as an abuse fingerprint: a 120:1
  // eng-to-engagers ratio is a signature). engagers/viewers are what ranking
  // reads, and the ledger's primary key is what makes repetition worthless.
  //
  // TWO statements, then the recompute — the v22 lesson: CTEs in a single
  // statement read a snapshot from statement start, so a recompute fused onto
  // the ledger insert cannot see the row it just wrote.
  const hash = identityHash(userId);
  const ledger = clean.map(({ id, eng, imp }) => ({
    id, engaged: eng > 0, viewed: imp > 0,
  })).filter((r) => r.engaged || r.viewed);

  const run = async (q) => {
    await runRaw(q);
    if (!ledger.length) return;
    await q(
      `WITH input AS (
         SELECT id, bool_or(engaged) AS engaged, bool_or(viewed) AS viewed
         FROM jsonb_to_recordset($1::jsonb) AS x(id text, engaged boolean, viewed boolean)
         GROUP BY id
       )
       INSERT INTO popularity_contributors (item_id, identity_hash, engaged, viewed)
       SELECT id, $2, engaged, viewed FROM input
       ON CONFLICT (item_id, identity_hash) DO UPDATE SET
         engaged = popularity_contributors.engaged OR EXCLUDED.engaged,
         viewed  = popularity_contributors.viewed  OR EXCLUDED.viewed`,
      [JSON.stringify(ledger), hash]
    );
    await q(
      `WITH touched AS (
         SELECT DISTINCT id FROM jsonb_to_recordset($1::jsonb) AS x(id text)
       ), agg AS (
         SELECT t.id,
                count(*) FILTER (WHERE c.engaged) ::int AS engagers,
                count(*) FILTER (WHERE c.viewed)  ::int AS viewers
         FROM touched t LEFT JOIN popularity_contributors c ON c.item_id = t.id
         GROUP BY t.id
       )
       UPDATE popularity p SET engagers = agg.engagers, viewers = agg.viewers
       FROM agg WHERE p.item_id = agg.id`,
      [JSON.stringify(ledger.map(({ id }) => ({ id })))]
    );
  };

  // A pooled CLIENT also exposes .connect() — only a Pool lacks .release().
  const isPool = typeof target.connect === "function" && typeof target.release !== "function";
  if (isPool) {
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      await run((text, params) => client.query(text, params));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  await run((text, params) => target.query(text, params));
}

// Per-user event history (newest first) — powers the orders/tickets view.
export async function getInteractions(userId, { action = null, limit = 50 } = {}) {
  limit = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 50));
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

export function adoptMemoryCoreData(fromUserId, toUserId) {
  let moved = 0;
  for (const interaction of mem.interactions) {
    if (interaction.userId === fromUserId) {
      interaction.userId = toUserId;
      moved++;
    }
  }
  moved += memAdoptEvents(fromUserId, toUserId);
  for (const key of [...mem.operations.keys()]) {
    if (key.includes(`:${fromUserId}:`)) mem.operations.delete(key);
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

// ---- Co-engagement graph (Pinterest-style taste graph) -------------------------
// Edges connect items the same person engaged with close together in a session,
// or saved to the same board (board co-membership — the strongest signal).

export async function bumpEdges(pairs = [], userId = null) {
  if (!pairs.length) return;
  const p = await getPool();
  if (!p) {
    // The mem path is what preview deploys, local dev and most tests run on.
    // If the ledger existed only on Postgres, every one of those would run the
    // ungated rule while reporting success — so it mirrors exactly.
    const hash = userId ? identityHash(userId) : null;
    const best = new Map();
    for (const { a, b, w = 1 } of pairs) {
      if (!a || !b || a === b) continue;
      const weight = Number(w) || 0;
      if (weight <= 0) continue;
      const k = edgeKey(a, b);
      if (!best.has(k) || weight > best.get(k)) best.set(k, weight);
    }
    for (const [k, weight] of best) {
      const edge = mem.edges.get(k) || { w: 0, contributors: 0, by: new Map() };
      if (!corroborationEnabled() || !hash) {
        edge.w += weight;
      } else {
        const known = edge.by.has(hash);
        if (!known && edge.by.size >= CONTRIB_CAP) { mem.edges.set(k, edge); continue; }
        const prior = edge.by.get(hash) || 0;
        if (weight > prior) edge.by.set(hash, weight);
        edge.w = [...edge.by.values()].reduce((t, v) => t + v, 0);
        edge.contributors = edge.by.size;
      }
      mem.edges.set(k, edge);
    }
    // Bounded like mem.events/mem.operations: evict the least-corroborated
    // first, oldest-inserted breaking ties (Map preserves insertion order).
    if (mem.edges.size > MEM_EDGES_CAP) {
      const ranked = [...mem.edges.entries()].sort(
        (x, y) => (x[1].contributors || 0) - (y[1].contributors || 0) || (x[1].w || 0) - (y[1].w || 0));
      for (const [k] of ranked.slice(0, mem.edges.size - MEM_EDGES_CAP)) mem.edges.delete(k);
    }
    return;
  }
  await writeEdges(p, pairs, userId);
}

// Neighborhood lookup: for each requested id, its neighbors and edge weights.
// Returns { id: { neighborId: weight } }.
// Returns { anchorId: { neighborId: strength } } where STRENGTH is the
// distinct-contributor count (lib/brain/edges.js explains why), or the legacy
// summed weight when BRAIN_EDGE_CORROBORATION=0.
//
// Bounded PER ANCHOR, not globally: a global LIMIT would let one hot anchor
// consume the budget and starve the other 99 requested ids, which would be a
// new correctness bug rather than a fix. gammaScore takes a max over anchors,
// so per-anchor top-K is near-lossless. Ordering is corroboration first, then
// weight, then id — deterministic, so the same state returns the same map.
export async function getEdges(ids = []) {
  const out = {};
  ids = [...new Set(ids.map(String).filter(Boolean))].slice(0, 100);
  if (!ids.length) return out;
  const want = new Set(ids);
  const rank = (row) => [-(row.contributors || 0), -(row.w || 0), row.a, row.b];
  const cmp = (x, y) => {
    const rx = rank(x), ry = rank(y);
    for (let i = 0; i < rx.length; i++) { if (rx[i] < ry[i]) return -1; if (rx[i] > ry[i]) return 1; }
    return 0;
  };
  const collect = (rows) => {
    const perAnchor = new Map();
    for (const r of rows) {
      for (const anchor of [r.a, r.b]) {
        if (!want.has(anchor)) continue;
        if (!perAnchor.has(anchor)) perAnchor.set(anchor, []);
        perAnchor.get(anchor).push(r);
      }
    }
    for (const [anchor, rows2] of perAnchor) {
      rows2.sort(cmp);
      const bucket = (out[anchor] = out[anchor] || {});
      for (const r of rows2.slice(0, EDGE_FANOUT_CAP)) {
        const other = r.a === anchor ? r.b : r.a;
        const strength = edgeStrength(r);
        if (strength > 0) bucket[other] = strength;
      }
    }
  };
  const p = await getPool();
  if (!p) {
    const rows = [];
    for (const [k, edge] of mem.edges) {
      const i = k.indexOf("|");
      const a = k.slice(0, i), b = k.slice(i + 1);
      if (!want.has(a) && !want.has(b)) continue;
      rows.push({ a, b, w: edge.w || 0, contributors: edge.contributors || 0 });
    }
    collect(rows);
    return out;
  }
  // LATERAL per anchor so each requested id gets its own top-K budget.
  const { rows } = await p.query(
    `SELECT DISTINCT e.a, e.b, e.w, e.contributors
     FROM unnest($1::text[]) AS anchor(id)
     CROSS JOIN LATERAL (
       SELECT a,b,w,contributors FROM edges
       WHERE a = anchor.id OR b = anchor.id
       ORDER BY contributors DESC, w DESC, a ASC, b ASC
       LIMIT $2
     ) e`,
    [ids, EDGE_FANOUT_CAP]
  );
  collect(rows.map((r) => ({ a: r.a, b: r.b, w: Number(r.w), contributors: Number(r.contributors) })));
  return out;
}

// ---- Popularity counters (TikTok-style engagement/exposure) --------------------

export async function bumpPopularity(entries = [], userId = null) {
  if (!entries.length) return;
  const p = await getPool();
  if (!p) {
    // Mirrors the Postgres path exactly. If the ledger existed on only one
    // path, preview deploys, local dev and most tests would run the ungated
    // rule while reporting success.
    const hash = userId ? identityHash(userId) : null;
    for (const { id, eng = 0, imp = 0 } of entries) {
      if (!id) continue;
      const cur = mem.popularity.get(id) || { eng: 0, imp: 0, engagers: 0, viewers: 0, by: new Map() };
      cur.eng += Number(eng) || 0;   // diagnostic: raw events, never deduped
      cur.imp += Number(imp) || 0;
      if (popularityDedupEnabled() && hash) {
        const prior = cur.by.get(hash) || { engaged: false, viewed: false };
        const next = {
          engaged: prior.engaged || (Number(eng) || 0) > 0,
          viewed: prior.viewed || (Number(imp) || 0) > 0,
        };
        cur.by.set(hash, next);
        let engagers = 0, viewers = 0;
        for (const v of cur.by.values()) { if (v.engaged) engagers++; if (v.viewed) viewers++; }
        cur.engagers = engagers;
        cur.viewers = viewers;
      }
      mem.popularity.set(id, cur);
    }
    return;
  }
  await writePopularity(p, entries, userId);
}

// Returns { itemId: { eng, imp } } for the most-engaged items.
export async function getPopularity(limit = 5000) {
  limit = Math.max(1, Math.min(10000, Math.trunc(Number(limit)) || 5000));
  const p = await getPool();
  const out = {};
  if (!p) {
    // COPIES, not live references: these objects are the scoring input, and
    // handing out the stored object let a concurrent write change a count
    // between the scoring of item 3 and item 40 within one assembly — a
    // non-deterministic ranking, on the path most tests run.
    const rows = [...mem.popularity.entries()]
      .sort((x, y) => (y[1].engagers || 0) - (x[1].engagers || 0) || (y[1].eng || 0) - (x[1].eng || 0))
      .slice(0, limit);
    for (const [id, v] of rows) {
      out[id] = { eng: v.eng || 0, imp: v.imp || 0, engagers: v.engagers || 0, viewers: v.viewers || 0 };
    }
    return out;
  }
  const { rows } = await p.query(
    "SELECT item_id,eng,imp,engagers,viewers FROM popularity ORDER BY engagers DESC, eng DESC LIMIT $1",
    [limit]
  );
  for (const r of rows) {
    out[r.item_id] = {
      eng: Number(r.eng), imp: Number(r.imp),
      engagers: Number(r.engagers), viewers: Number(r.viewers),
    };
  }
  return out;
}

// ---- Boards (Pinterest-style moodboards; shareable by id) ----------------------

function newBoardId() {
  return "b-" + randomUUID();
}

export const MAX_BOARDS_PER_USER = 50;
export const MAX_ITEMS_PER_BOARD = 500;

function capacityError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

export async function createBoard(userId, name) {
  const board = { id: newBoardId(), userId, name, items: [], isDefault: false };
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      const existing = Array.from(mem.boards.values()).filter((entry) => entry.userId === userId);
      if (existing.length >= MAX_BOARDS_PER_USER) {
        throw capacityError("BOARD_LIMIT", `board limit is ${MAX_BOARDS_PER_USER}`);
      }
      board.isDefault = !Array.from(mem.boards.values()).some((entry) => entry.userId === userId && entry.isDefault);
      mem.boards.set(board.id, board);
      return board;
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    const boardCount = await client.query("SELECT count(*)::int AS n FROM boards WHERE user_id=$1", [userId]);
    if ((boardCount.rows[0]?.n || 0) >= MAX_BOARDS_PER_USER) {
      throw capacityError("BOARD_LIMIT", `board limit is ${MAX_BOARDS_PER_USER}`);
    }
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
      if (board.items.length >= MAX_ITEMS_PER_BOARD) {
        throw capacityError("BOARD_ITEM_LIMIT", `board item limit is ${MAX_ITEMS_PER_BOARD}`);
      }
      const event = normalizeEvent(typeof canonicalEvent === "function"
        ? canonicalEvent(board.id) : canonicalEvent);
      const priorItems = board.items.slice(-priorLimit);
      const derived = reduce(mem.profiles.get(userId) || {}, priorItems);
      board.items.push(item);
      mem.profiles.set(userId, derived.profile);
      memRecordEvent(event);
      mem.interactions.push({ userId, itemId: item.id, action: "save", dwellMs: null, at: Date.now() });
      await Promise.all([bumpEdges(derived.edgePairs, userId), bumpPopularity(derived.popularity, userId)]);
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
    const existingItem = await client.query(
      "SELECT 1 FROM board_items WHERE board_id=$1 AND item_id=$2", [resolvedBoardId, item.id]
    );
    if (existingItem.rowCount) {
      await client.query("COMMIT");
      return { board: await boardFromTarget(client, resolvedBoardId), inserted: false };
    }
    const boardSize = await client.query(
      "SELECT count(*)::int AS n FROM board_items WHERE board_id=$1", [resolvedBoardId]
    );
    if ((boardSize.rows[0]?.n || 0) >= MAX_ITEMS_PER_BOARD) {
      throw capacityError("BOARD_ITEM_LIMIT", `board item limit is ${MAX_ITEMS_PER_BOARD}`);
    }
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
    await writeEdges(client, derived.edgePairs, userId);
    await writePopularity(client, derived.popularity, userId);
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
    // Ranked by PEOPLE, not events — otherwise a forged leaderboard stays
    // published on /hotlist after ranking itself is fixed. eng/imp ride along
    // as diagnostics: an eng-to-engagers ratio of 120:1 is an abuse signature.
    const top = Array.from(mem.popularity.entries())
      .map(([id, v]) => ({ id, eng: v.eng, imp: v.imp, engagers: v.engagers || 0, viewers: v.viewers || 0 }))
      .sort((a, b) => b.engagers - a.engagers || b.eng - a.eng)
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
    p.query("SELECT item_id, eng, imp, engagers, viewers FROM popularity ORDER BY engagers DESC, eng DESC LIMIT 10"),
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
    topItems: top.rows.map((r) => ({ id: r.item_id, eng: Number(r.eng), imp: Number(r.imp), engagers: Number(r.engagers), viewers: Number(r.viewers) })),
  };
}
