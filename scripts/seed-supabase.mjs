// scripts/seed-supabase.mjs
// One-time production seeding: applies supabase/schema.sql (MVP tables + RLS)
// and upserts the synthetic seed catalog into the items table, reusing the
// same lib/db upsert path the app itself writes through.
//
// Usage: node --experimental-default-type=module scripts/seed-supabase.mjs
// Reads DATABASE_URL from .env.local (or the environment). Never prints it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader — the app relies on Next.js for this; plain node
// scripts don't get it, and we don't want a dotenv dependency for one file.
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (in .env.local or the environment).");
  process.exit(1);
}

const CATALOG = JSON.parse(
  fs.readFileSync(path.join(root, "lib/ingest/catalog.json"), "utf8")
);

// Importing lib/db creates the brain tables (items, profiles, interactions,
// edges, popularity, boards, board_items, user_events) on first query.
const db = await import("../lib/db/index.js");

console.log(`Seeding ${CATALOG.length} catalog items into the items table…`);
const t0 = Date.now();
const BATCH = 50;
for (let i = 0; i < CATALOG.length; i += BATCH) {
  await db.upsertItems(CATALOG.slice(i, i + BATCH));
  process.stdout.write(`\r  ${Math.min(i + BATCH, CATALOG.length)}/${CATALOG.length}`);
}
console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// MVP tables (user_profiles, designers, saved_items, articles, product_sources).
// create policy has no IF NOT EXISTS: a re-run rolls back on 42710, which is
// fine — everything in schema.sql already exists by then.
const pgMod = await import("pg");
const { Pool } = pgMod.default ?? pgMod;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const schemaSql = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
try {
  await pool.query(schemaSql);
  console.log("supabase/schema.sql applied (MVP tables + RLS).");
} catch (e) {
  if (e.code === "42710") {
    console.log("MVP tables already present (policies exist) — schema apply skipped.");
  } else {
    throw e;
  }
}

const { rows } = await pool.query("SELECT count(*)::int AS n FROM items");
console.log(`items table now holds ${rows[0].n} rows.`);
const sample = await db.listItems(3);
console.log(
  "sample read-back:",
  sample.map((it) => `${it.id} ${it.title} $${it.price} (${typeof it.price})`)
);
await pool.end();
process.exit(0);
