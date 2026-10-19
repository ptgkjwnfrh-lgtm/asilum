#!/usr/bin/env node
// scripts/db-export-surface.mjs — the public surface of lib/db/production.js.
//
// A refactor of a 4,500-line store is only safe if NOTHING that other modules
// import stopped existing or changed kind. That is cheap to check and easy to
// get wrong by hand: this prints every export with its type, sorted, so a
// before/after diff is exact.
//
//   node scripts/db-export-surface.mjs > before.json
//   ...split...
//   node scripts/db-export-surface.mjs > after.json && diff before.json after.json
//
// It is NOT a behaviour test — the unit suite and the Postgres integration
// suite are that. This catches the one failure a split makes most easily: an
// export silently left behind in the file it moved out of.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const target = process.argv[2] || "lib/db/production.js";
const mod = await import(pathToFileURL(resolve(target)).href);
const surface = Object.keys(mod).sort().map((name) => {
  const v = mod[name];
  const kind = typeof v === "function"
    ? (v.constructor?.name === "AsyncFunction" ? "async fn" : "fn")
    : Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
  return `${kind.padEnd(9)} ${name}`;
});
console.log(JSON.stringify({ module: target, count: surface.length, surface }, null, 1));
