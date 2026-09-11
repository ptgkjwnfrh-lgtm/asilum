#!/usr/bin/env node
// scripts/audit-descriptors.mjs — how many of the stream's descriptors are
// one word for one thing?
//
// WHY THIS EXISTS. ADR-008 §Consequences: "A 'dagger collar' and a 'dagger
// lapel' are two streams until the vocabulary reconciles them — the tag
// audit is the next instrument." This is that instrument. It reads a set of
// descriptors the identification step actually wrote and reports, against
// lib/asterisk/descriptors.js:
//   KNOWN     the term (or a synonym / plural of it) is a glossary concept;
//   FOLDED    the term was a non-canonical spelling and collapses onto one;
//   UNKNOWN   the glossary has no opinion — the term passes through as is.
// The instrument asserts nothing about whether an UNKNOWN term is wrong: a
// "bull head graphic" is a real thing on a real jacket. It exists to show
// the fold rate and to list the UNKNOWN terms a reviewer should read.
//
//   node scripts/audit-descriptors.mjs --file descriptors.json
//        # a JSON array of strings, or of {tag, weight, kind}, or of listings
//        # each carrying a `descriptors` array in the stream's own shape
//   node scripts/audit-descriptors.mjs --text first-light.txt
//        # lines of "term 0.83 · term 0.83 · …" (the first-light report)
//   node scripts/audit-descriptors.mjs
//        # the glossary's own self-audit: families, kinds, term counts
//
// GATE (declared): every FOLDED term folds onto a concept whose kind maps
// to a product_tags facet; no term is claimed twice. Both are also tests.
process.env.DATABASE_URL = "";
import fs from "node:fs";

const { DESCRIPTOR_CONCEPTS, lookupDescriptor, normalizeTerm, reconcileDescriptors } = await import("../lib/asterisk/descriptors.js");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : null; };

let terms = [];
if (opt("file")) {
  const data = JSON.parse(fs.readFileSync(opt("file"), "utf8"));
  const rows = Array.isArray(data) ? data : data.descriptors || [];
  for (const r of rows) {
    if (typeof r === "string") terms.push({ tag: r, weight: 1, kind: "detail" });
    else if (r && Array.isArray(r.descriptors)) terms.push(...r.descriptors);
    else if (r && r.tag) terms.push(r);
  }
} else if (opt("text")) {
  // only a "↳" line whose EVERY part is "term 0.83" is a descriptor line —
  // the taste table and the seller-tag readings share the separator
  for (const line of fs.readFileSync(opt("text"), "utf8").split("\n")) {
    if (!line.includes("↳") || !line.includes(" · ")) continue;
    const parts = line.replace(/^.*?↳\s*/, "").split(" · ").map((p) => p.trim().match(/^(.+?)\s+(\d\.\d+)$/));
    if (parts.some((m) => !m) || parts.some((m) => /^[A-Z-]+$/.test(m[1]))) continue;
    for (const m of parts) terms.push({ tag: m[1], weight: Number(m[2]), kind: "detail" });
  }
}

if (!terms.length) {
  const fam = {}, kinds = {};
  let syn = 0;
  for (const c of DESCRIPTOR_CONCEPTS) { fam[c.family] = (fam[c.family] || 0) + 1; kinds[c.kind] = (kinds[c.kind] || 0) + 1; syn += c.synonyms.length; }
  console.log(`descriptor glossary · ${DESCRIPTOR_CONCEPTS.length} concepts · ${syn} synonyms`);
  console.log("  kinds:", Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("  families:", Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · "));
  process.exit(0);
}

let known = 0, folded = 0, unknown = 0;
const unknowns = new Map(), folds = new Map();
for (const d of terms) {
  const t = normalizeTerm(d.tag);
  if (!t) continue;
  const c = lookupDescriptor(t);
  if (!c) { unknown++; unknowns.set(t, (unknowns.get(t) || 0) + 1); continue; }
  known++;
  if (c.canonical !== t) { folded++; folds.set(`${t} → ${c.canonical}`, (folds.get(`${t} → ${c.canonical}`) || 0) + 1); }
}
const before = new Set(terms.map((d) => normalizeTerm(d.tag)).filter(Boolean)).size;
const after = reconcileDescriptors(terms).descriptors.length;
console.log(`descriptors read ${terms.length} · distinct ${before} → after reconciliation ${after}`);
console.log(`  KNOWN ${known} (${Math.round((known / (known + unknown)) * 100)}%) · of which FOLDED ${folded} · UNKNOWN ${unknown}`);
if (folds.size) { console.log("\n  folded:"); for (const [k, n] of [...folds].sort((a, b) => b[1] - a[1])) console.log(`    ${n}× ${k}`); }
if (unknowns.size) { console.log("\n  unknown to the glossary (pass through unchanged):"); for (const [k, n] of [...unknowns].sort((a, b) => b[1] - a[1])) console.log(`    ${n}× ${k}`); }
