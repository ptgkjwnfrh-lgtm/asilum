#!/usr/bin/env node
// scripts/setup-dm-storage.mjs — create (idempotently) the PRIVATE "dm"
// bucket for DM images (lib/dm/media.js). Needs NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY in .env.local. Creating the bucket does not
// enable the pipeline: that is DM_MEDIA_ENABLED=1, gated by OWNER-DECISIONS #3.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const { ensureDmBucket } = await import("../lib/dm/media.js");
try { console.log(JSON.stringify(await ensureDmBucket())); } catch (e) { console.error(e.message); process.exitCode = 1; }
