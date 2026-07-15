// Compile APPROVED culture-entity proposals (learned_facts) into
// lib/asterisk/culture.research.json — the ONLY way research reaches the
// culture catalog, and always as a reviewable git diff. Deterministic output
// (sorted by name) so re-runs produce byte-identical files.
// Usage: node scripts/compile-culture-research.mjs [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const { approvedCultureProposals } = await import("../lib/asterisk/research.js");
const { records, skipped } = await approvedCultureProposals();

for (const s of skipped) {
  process.stderr.write(`compile-culture-research: SKIPPED ${s.id}: ${s.reason}\n`);
}

records.sort((a, b) => a.name.localeCompare(b.name));
const out = JSON.stringify(records, null, 2) + "\n";
const target = path.join(root, "lib/asterisk/culture.research.json");

if (process.argv.includes("--dry-run")) {
  process.stdout.write(out);
} else {
  fs.writeFileSync(target, out);
  process.stdout.write(`compile-culture-research: ${records.length} approved records → lib/asterisk/culture.research.json`
    + (skipped.length ? ` (${skipped.length} skipped — see stderr)` : "") + "\n");
}
