// tests/vault-access.test.js — the vault's access law, enforced in code.
// The owner ruled (20 Aug 2026) that buyer personal information lives apart
// and is reached ONLY via SETTINGS and the first purchase. In this codebase
// that means exactly the modules below may import lib/vault.js; any other
// import is a policy violation, not a style nit.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname);

const ALLOWED = new Set([
  "lib/orders.js",                  // the first-purchase path: §6 settle + card save
  "app/api/ticket-fee/route.js",    // the first-purchase identity intake
  "app/api/purchase-info/route.js", // SETTINGS — the only editor afterwards
  "app/api/privacy/route.js",       // erasure ONLY — the right to be forgotten
                                    // spans every store (deleteBuyerProfile)
]);

function walk(dir, out = []) {
  let names = [];
  try { names = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const name of names) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) {
      if (name !== "node_modules" && name !== ".next") walk(rel, out);
    } else if (/\.(js|jsx|mjs)$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

test("the buyer vault has exactly two doors (plus the engine's settle path)", () => {
  const offenders = [];
  for (const rel of [...walk("app"), ...walk("lib"), ...walk("scripts")]) {
    if (rel === "lib/vault.js") continue;
    const src = readFileSync(join(ROOT, rel), "utf8");
    const importsVault =
      /from\s+["'][^"']*\/vault\.js["']/.test(src) ||
      /require\(\s*["'][^"']*\/vault\.js["']\s*\)/.test(src);
    if (importsVault && !ALLOWED.has(rel)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    "unlawful vault import — buyer PII is reached via SETTINGS and first purchase only");
});
