#!/usr/bin/env node
// scripts/setup-wire-storage.mjs — create (idempotently) the public-read
// "wire" bucket for Wire images (lib/wire/media.js). Needs
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const { ensureWireBucket } = await import("../lib/wire/media.js");
try { console.log(JSON.stringify(await ensureWireBucket())); } catch (e) { console.error(e.message); process.exitCode = 1; }
