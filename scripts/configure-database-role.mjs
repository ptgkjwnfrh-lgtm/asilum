// One-time local helper: activate the v11 asilum_app role with a strong secret.
// The owner URL and new password are read from the environment and never logged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

const adminUrl = process.env.DATABASE_ADMIN_URL || "";
const password = process.env.DATABASE_APP_PASSWORD || "";
if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is required for this one-time setup");
if (password.length < 32) throw new Error("DATABASE_APP_PASSWORD must be at least 32 characters");

const pgMod = await import("pg");
const { Pool } = pgMod.default ?? pgMod;
const { databaseSslConfig } = await import("../lib/db/index.js");
const pool = new Pool({
  connectionString: adminUrl,
  ssl: await databaseSslConfig(),
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  const role = await pool.query(
    `SELECT rolcanlogin, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
     FROM pg_roles WHERE rolname='asilum_app'`
  );
  if (!role.rowCount) {
    throw new Error("asilum_app does not exist; apply schema-v11-application-role.sql first");
  }

  await pool.query("SET password_encryption='scram-sha-256'");
  const formatted = await pool.query(
    "SELECT format('ALTER ROLE asilum_app LOGIN PASSWORD %L', $1::text) AS sql",
    [password]
  );
  await pool.query(formatted.rows[0].sql);

  const verified = await pool.query(
    `SELECT rolcanlogin, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
     FROM pg_roles WHERE rolname='asilum_app'`
  );
  const current = verified.rows[0];
  if (!current?.rolcanlogin || current.rolbypassrls || current.rolsuper ||
      current.rolcreatedb || current.rolcreaterole) {
    throw new Error("asilum_app role attributes did not verify");
  }
  console.log("asilum_app activated and verified; password was not printed");
  console.log("use asilum_app as the direct username, or asilum_app.<project-ref> with Supavisor");
} finally {
  await pool.end();
}
