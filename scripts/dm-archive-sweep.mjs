#!/usr/bin/env node
// scripts/dm-archive-sweep.mjs — stamp archived_at on DM images past six
// calendar months (lib/db/dm/attachments.js archiveSweep). Nothing is
// deleted and nothing changes storage tier. Reads .env.local for DATABASE_URL.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const { archiveSweep } = await import("../lib/db/dm.js");
try { console.log(JSON.stringify({ archived: await archiveSweep() })); } catch (e) { console.error(e.message); process.exitCode = 1; }
