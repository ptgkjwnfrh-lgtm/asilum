// scripts/seed-mappings.mjs
// Idempotent: (1) upserts the curated search mappings into search_mappings,
// (2) backfills the typed product_tags layer + production source fields for
// products already in the items table (the July seed catalog).
// Usage: node --experimental-default-type=module scripts/seed-mappings.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }

const { DEFAULT_MAPPINGS } = await import("../lib/search/mappings-seed.js");
const { upsertSearchMapping, addProductTags } = await import("../lib/db/production.js");
const { typedTagsFrom } = await import("../lib/ingest/adapters/normalize.js");

for (const m of DEFAULT_MAPPINGS) await upsertSearchMapping(m);
console.log(`search_mappings: ${DEFAULT_MAPPINGS.length} upserted`);

const pgMod = await import("pg");
const { Pool } = pgMod.default ?? pgMod;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Production fields for the seed catalog: it is honest demo inventory.
await pool.query(`
  UPDATE items SET
    source_name = COALESCE(source_name, 'seed'),
    source_product_id = COALESCE(source_product_id, id),
    availability_status = CASE WHEN availability_status='unknown' THEN 'available' ELSE availability_status END,
    decade = COALESCE(decade, era->>'decade')
  WHERE source_name IS NULL OR decade IS NULL OR availability_status='unknown'`);

const { rows } = await pool.query("SELECT id, title, brand, category, tags, condition, decade FROM items");
let tagged = 0;
for (const it of rows) {
  tagged += await addProductTags(it.id, typedTagsFrom(it));
  if (tagged % 500 < 10) process.stdout.write(`\r  tagged ${tagged}`);
}
const n = await pool.query("SELECT count(*)::int AS n FROM product_tags");
console.log(`\nproduct_tags rows: ${n.rows[0].n} (from ${rows.length} products)`);
await pool.end();
process.exit(0);
