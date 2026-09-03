// scripts/audit-navigability.mjs — measure how findable this codebase is.
//
// The handover question is not "is the code good", it is "can a person who has
// never seen this find the thing they need and know what it does when they get
// there". That is measurable, so it is measured rather than asserted:
//
//   * files large enough that a newcomer cannot hold them in their head
//   * files that never say what they are
//   * exported functions that never say what they are for
//
//   npm run audit:nav          # summary
//   npm run audit:nav -- --list  # every offending location
//
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const BIG = 1200;
const list = process.argv.includes("--list");
const files = execSync(
  `find app lib scripts -type f \\( -name '*.js' -o -name '*.jsx' -o -name '*.mjs' \\) -not -path '*/node_modules/*' | sort`,
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

// An exported function, either declaration or arrow form.
const EXPORT_FN = /^export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)/;
const EXPORT_ARROW = /^export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(async\s*)?(\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/;

const big = [], headerless = [], undocumented = [];
let fnCount = 0;

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  if (lines.length > BIG) big.push({ file, lines: lines.length });

  // A header is a comment near the top; "use client" may precede it.
  let hasHeader = false;
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^["']use (client|server)["'];?$/.test(t)) continue;
    if (/^(\/\/|\/\*)/.test(t)) hasHeader = true;
    break;
  }
  if (!hasHeader) headerless.push({ file });

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(EXPORT_FN) || lines[i].match(EXPORT_ARROW);
    if (!m) continue;
    fnCount++;
    const name = m[2] || m[1];
    // walk back past blank lines; a comment directly above counts as a label
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    const labelled = j >= 0 && /^\s*(\/\/|\*|\*\/|\/\*)/.test(lines[j]);
    if (!labelled) undocumented.push({ file, line: i + 1, name });
  }
}

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`ASILUM navigability audit — ${files.length} source files\n`);
console.log(`  oversized (>${BIG} lines)   ${String(big.length).padStart(4)}`);
console.log(`  files with no header      ${String(headerless.length).padStart(4)}   (${pct(files.length - headerless.length, files.length)} documented)`);
console.log(`  exported functions        ${String(fnCount).padStart(4)}`);
console.log(`  ...with no label          ${String(undocumented.length).padStart(4)}   (${pct(fnCount - undocumented.length, fnCount)} labelled)`);

if (big.length) {
  console.log("\noversized files:");
  for (const b of big.sort((a, z) => z.lines - a.lines)) console.log(`  ${String(b.lines).padStart(5)}  ${b.file}`);
}
if (list) {
  console.log("\nfiles with no header:");
  for (const h of headerless) console.log(`  ${h.file}`);
  console.log("\nunlabelled exports:");
  for (const u of undocumented) console.log(`  ${u.file}:${u.line}  ${u.name}`);
} else {
  console.log("\n  (run with --list for every location)");
}

// Per-directory concentration, so the work can be sequenced by area.
const byDir = new Map();
for (const u of undocumented) {
  const d = u.file.split("/").slice(0, 2).join("/");
  byDir.set(d, (byDir.get(d) || 0) + 1);
}
console.log("\nunlabelled exports by area:");
for (const [d, n] of [...byDir.entries()].sort((a, z) => z[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)}  ${d}`);
}
