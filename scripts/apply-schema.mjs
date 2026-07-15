// scripts/apply-schema.mjs
// Apply a SQL file to the database behind DATABASE_URL (.env.local or env).
// Usage:
//   node scripts/apply-schema.mjs supabase/schema-v2.sql
//   node scripts/apply-schema.mjs --all [--verify-idempotent]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const applyAll = args.includes("--all");
const verifyIdempotent = args.includes("--verify-idempotent");

function versionedSchemaFiles() {
  const directory = path.join(root, "supabase");
  const rest = fs.readdirSync(directory)
    .map((name) => ({ name, match: name.match(/^schema-v(\d+)(?:-|\.sql)/) }))
    .filter(({ name, match }) => match && name !== "schema-v1-brain.sql" && Number(match[1]) >= 2)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]) || a.name.localeCompare(b.name))
    .map(({ name }) => path.join("supabase", name));
  return ["supabase/schema-v1-brain.sql", "supabase/schema.sql", ...rest];
}

const requestedFiles = args.filter((arg) => !arg.startsWith("--"));
const files = applyAll ? versionedSchemaFiles() : requestedFiles;
if (!files.length || (verifyIdempotent && !applyAll)) {
  console.error("usage: apply-schema.mjs <file.sql> [...] | --all [--verify-idempotent]");
  process.exit(1);
}

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

async function apply(file) {
  const fullPath = path.resolve(root, file);
  if (!fullPath.startsWith(root + path.sep) || !fullPath.endsWith(".sql")) {
    throw new Error(`invalid schema path: ${file}`);
  }
  const sql = fs.readFileSync(fullPath, "utf8");
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
  );
  console.log(`${file} applied. public tables: ${rows[0].n}`);
}

try {
  for (const file of files) await apply(file);
  if (verifyIdempotent) await apply(files.at(-1));
} finally {
  await pool.end();
}
