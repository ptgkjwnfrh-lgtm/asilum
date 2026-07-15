// scripts/setup-wardrobe-storage.mjs — create the PRIVATE "wardrobe" Storage
// bucket (idempotent). Run once per environment before enabling
// WARDROBE_UPLOADS_ENABLED:
//   node scripts/setup-wardrobe-storage.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the
// environment or .env.local. Exits non-zero on any failure.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { ensureWardrobeBucket, WARDROBE_BUCKET, storageConfigured } =
  await import("../lib/wardrobe/photos.js");

if (!storageConfigured()) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const result = await ensureWardrobeBucket();
console.log(result.existed
  ? `bucket "${WARDROBE_BUCKET}" already exists — private, 2MB, JPEG-only policy verified`
  : `bucket "${WARDROBE_BUCKET}" created — private, 2MB, JPEG-only policy verified`);
