#!/usr/bin/env node
// scripts/comment-attachment.mjs — did the split move code without its comment?
//
// A file split is verified by tests and by the export surface. Neither can see
// the failure this catches: a function moves to a new module and the comment
// block that explained it stays behind, now heading whatever declaration
// happened to follow it. The code is correct and the file lies.
//
//   git show HEAD~1:lib/db/production.js > /tmp/before.js
//   node scripts/comment-attachment.mjs /tmp/before.js lib/db/production.js lib/db/production/*.js
//
// It pairs every top-level declaration with the contiguous `//` block directly
// above it, before and after, and reports any that lost or changed one.
import { readFileSync } from "node:fs";

const blocks = (text) => {
  const lines = text.split("\n");
  const out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (!m) continue;
    let j = i - 1;
    const buf = [];
    while (j >= 0 && /^\s*\/\//.test(lines[j])) { buf.unshift(lines[j].trim()); j--; }
    out.set(m[1], buf.join("\n"));
  }
  return out;
};

const [, , baseline, ...current] = process.argv;
if (!baseline || !current.length) {
  console.error("usage: comment-attachment.mjs <before.js> <after.js...>");
  process.exit(2);
}
const before = blocks(readFileSync(baseline, "utf8"));
const after = new Map();
for (const f of current)
  for (const [k, v] of blocks(readFileSync(f, "utf8"))) if (!after.has(k) || v) after.set(k, v);

let bad = 0;
for (const [name, cmt] of before) {
  if (!cmt) continue; // it had no header to lose
  if (!after.has(name)) { console.log(`GONE      ${name}`); bad++; continue; }
  if (after.get(name) !== cmt) {
    console.log(`DETACHED  ${name}\n  was: ${cmt.split("\n")[0]}\n  now: ${(after.get(name) || "(no comment)").split("\n")[0]}`);
    bad++;
  }
}
console.log(bad ? `\n${bad} declaration(s) lost or changed their header.` : "every commented declaration kept its header.");
process.exit(bad ? 1 : 0);
