// tests/helpers/dm-source.mjs — the mail desk's source, as one string.
//
// Several tests assert on the STORE'S TEXT rather than its behaviour, because
// what they are guarding is a shape the wire may carry, not a value a call
// returns (see the peerActivity oracle in tests/dm.test.js). Those tests used
// to read lib/db/dm.js directly.
//
// The store is now nine modules behind a barrel, so reading that one file
// returns a list of re-exports and every `assert.match` against it fails —
// loudly, which is right, but a test that has to be hand-repaired whenever a
// file moves eventually gets repaired by deletion. This reads the whole
// subsystem instead.
//
// It asserts a floor on what it found: a glob that matched nothing would make
// every `doesNotMatch` in every caller pass vacuously, which is the precise
// shape of the bug these tests exist to catch.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import path from "node:path";

export function dmStoreSource() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dir = path.join(root, "..", "lib", "db", "dm");
  const files = readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
  assert.ok(files.length >= 5,
    `expected the mail desk to be several modules, found ${files.length} in ${dir}`);
  const parts = [readFileSync(path.join(root, "..", "lib", "db", "dm.js"), "utf8")];
  for (const f of files) parts.push(readFileSync(path.join(dir, f), "utf8"));
  const src = parts.join("\n");
  assert.ok(src.length > 20_000,
    `the mail desk source read as ${src.length} chars — too small to be the store`);
  return src;
}

// The body of ONE exported function, for assertions that must not be satisfied
// by a match somewhere else in the file.
export function dmFunctionSource(name) {
  const src = dmStoreSource();
  const decl = new RegExp(`export (?:async )?function ${name}\\b`);
  const at = src.search(decl);
  assert.ok(at >= 0, `${name} must exist in the mail desk source`);
  const rest = src.slice(at);
  const end = rest.indexOf("\n}\n");
  assert.ok(end > 0, `could not find the end of ${name}`);
  return rest.slice(0, end + 2);
}
