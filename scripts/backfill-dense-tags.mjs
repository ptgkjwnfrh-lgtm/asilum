// Backfill dense per-piece tags (lib/tagging/dense.js) into product_tags.
// Idempotent: rows upsert on (product_id, tag, tag_type) with max-confidence
// wins, so a rerun converges. Usage: node scripts/backfill-dense-tags.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const { listItems } = await import(join(ROOT, "lib/db/index.js"));
const { addProductTags } = await import(join(ROOT, "lib/db/production.js"));
const { denseTagsForItem } = await import(join(ROOT, "lib/tagging/dense.js"));

const items = await listItems(5000);
if (!items.length) { console.error("no items — is DATABASE_URL set?"); process.exit(1); }

let written = 0, min = Infinity, max = 0;
for (let i = 0; i < items.length; i++) {
  const rows = denseTagsForItem(items[i]);
  await addProductTags(items[i].id, rows.map((r) => ({
    tag: r.tag, tagType: r.tagType, confidence: r.confidence, source: r.source,
  })));
  written += rows.length;
  min = Math.min(min, rows.length);
  max = Math.max(max, rows.length);
  if ((i + 1) % 100 === 0) { console.log(`${i + 1}/${items.length}…`); await new Promise((r) => setTimeout(r, 150)); }
}
console.log(`backfill-dense-tags: ${items.length} items, ${written} rows upserted (per-item min ${min} / avg ${(written / items.length).toFixed(1)} / max ${max})`);
process.exit(0);
