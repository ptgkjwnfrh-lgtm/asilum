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
const HTTP_VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const EXPORT_ARROW = /^export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(async\s*)?(\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/;

const big = [], headerless = [], undocumented = [];
let fnCount = 0;

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  if (lines.length > BIG) big.push({ file, lines: lines.length });

  // A header is a comment near the top of the file. Two things may legally sit
  // ABOVE it, and both have caused this check to lie:
  //
  //   "use client"        — the first pass scored every interactive component
  //                         as headerless, reporting 76% coverage when it was
  //                         really 87.5%.
  //   #!/usr/bin/env node — the second pass then scored all 30 measurement
  //                         harnesses as headerless, when every one of them
  //                         opens with a thorough header on the NEXT line.
  //
  // Both times the instrument was wrong and the code was fine. An audit that
  // over-reports is not the safe direction to err in: it sends someone to
  // "fix" files that need nothing, and the noise hides the real gaps.
  let hasHeader = false;
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^#!/.test(t)) continue;
    if (/^["']use (client|server)["'];?$/.test(t)) continue;
    if (/^(\/\/|\/\*)/.test(t)) hasHeader = true;
    break;
  }
  if (!hasHeader) headerless.push({ file });

  // A route handler is named for its HTTP verb, so the file header is often
  // the right place for its contract — "POST /api/reset { user }" at the top
  // of a single-handler file explains it better than a comment repeating the
  // verb two lines above the function. Requiring a per-function comment there
  // would measure ceremony rather than clarity, and would be satisfied by
  // adding noise. So a verb export counts as labelled when the header names
  // that verb; a file with several handlers cannot do that for all of them,
  // which is exactly where per-handler labels DO earn their place.
  const headerText = lines.slice(0, 40).filter((l) => /^\s*(\/\/|\*|\/\*)/.test(l)).join(" ");
  const isRoute = /app\/api\/.*route\.(js|jsx)$/.test(file);

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(EXPORT_FN) || lines[i].match(EXPORT_ARROW);
    if (!m) continue;
    fnCount++;
    const name = m[2] || m[1];
    // walk back past blank lines; a comment directly above counts as a label
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    let labelled = j >= 0 && /^\s*(\/\/|\*|\*\/|\/\*)/.test(lines[j]);
    if (!labelled && isRoute && HTTP_VERBS.has(name)) {
      labelled = new RegExp(`\\b${name}\\b`).test(headerText);
    }
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
