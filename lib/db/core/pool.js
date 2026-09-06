// lib/db/core/pool.js — THE CONNECTION, AND WHAT IT REFUSES TO OPEN.
//
// getPool() returns null when DATABASE_URL is unset — that is the switch every
// other module in this directory reads to choose Postgres or the in-memory
// fallback, and it is why "no database" is a supported state rather than a
// crash. It returns a pool only after verifySchema() has proved three things:
// the connection is under the expected ROLE (production must be asilum_app,
// never the owner), every required table exists, and the migration version is
// at least REQUIRED_SCHEMA_VERSION. A half-migrated database is refused with a
// message naming what is missing, because the alternative is queries failing
// one table at a time, hours later, in whichever route touches it first.
//
// hasDecayColumns() is the other shape of the same caution: a probe for columns
// a LATER migration adds, cached once per process, so this code can be deployed
// before the migration runs and fall back to lifetime counts until it does.


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

// The switch every other module in this directory reads: null means "no
// database", which is a supported state, not an outage.
//
// AN ENDED POOL IS NOT A POOL. `pool` used to be returned forever once set,
// so anything that called .end() on it left every later caller holding a dead
// handle — "Cannot use a pool after calling end on the pool", with no path
// back short of restarting the process. It is now rebuilt.
//
// That is inert in the app, which never ends its pool, and it retires a real
// constraint in the integration suite. Those tests used to get one pool EACH
// by importing this layer under a distinct query string; that worked only
// while the pool state lived in the file they were suffixing, and it left an
// ordering rule ("none of them may end the pool", "do not move them below the
// board test") that CI had already caught someone breaking once. Rebuilding
// removes the rule instead of restating it.
export async function getPool() {
  if (pool && !pool.ended && !pool.ending) return pool;
  if (pool) pool = null;
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

// (r25) popularity.engagers_decayed / viewers_decayed / decayed_at arrive with
// schema v25. Detected once per process, exactly as v24's served_ids is, so
// this code is safe to deploy before the migration runs: until then scoring
// falls back to lifetime counts and REQUIRED_SCHEMA_VERSION stays where it is.
let decayColumns = null;
export async function hasDecayColumns(p) {
  if (decayColumns === null) {
    try {
      const r = await p.query(
        `SELECT count(*)::int n FROM information_schema.columns
          WHERE table_schema='public' AND table_name='popularity'
            AND column_name IN ('engagers_decayed','viewers_decayed','decayed_at')`
      );
      decayColumns = (r.rows[0]?.n || 0) === 3;
    } catch { decayColumns = false; }
  }
  return decayColumns;
}

/** Test seam: forget the detection so a battery can exercise both shapes. */
export function resetDecayColumnCache() { decayColumns = null; }
