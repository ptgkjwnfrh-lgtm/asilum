// scripts/apply-schema.mjs
// Apply a SQL file to the database behind DATABASE_URL (.env.local or env).
// Usage: node --experimental-default-type=module scripts/apply-schema.mjs supabase/schema-v2.sql
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) { console.error("usage: apply-schema.mjs <file.sql>"); process.exit(1); }

const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }

const pgMod = await import("pg");
const { Pool } = pgMod.default ?? pgMod;
const { databaseSslConfig } = await import("../lib/db/index.js");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: await databaseSslConfig() });
const sql = fs.readFileSync(path.join(root, file), "utf8");
await pool.query(sql);
const { rows } = await pool.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
);
console.log(`${file} applied. public tables: ${rows[0].n}`);
await pool.end();
