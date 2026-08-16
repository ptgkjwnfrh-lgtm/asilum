#!/usr/bin/env node
// scripts/measure-disciples.mjs — declared-criteria measurement for r10: the
// fan-tribe study (11 curated culture records from the owner-supplied
// fan-portrait image series) + the Passport influenced-assumption clause.
//
//   set -a; source .env.local; set +a
//   SEARCH_SEMANTIC_RERANK=0 SEARCH_SEMANTIC_TIEBREAK=0 EMBEDDINGS_PROVIDER= \
//     node scripts/measure-disciples.mjs baseline|after
//
// Arms: "baseline" runs on main (pre-study code) via git worktree; "after"
// runs on the feature branch. Same DB (keyed path), same script.
//
// Criteria (DECLARED HERE, before the run):
//   RECOGNITION — 366 deterministic query variants per term (formula below;
//     exactly 366, sliced from a fixed template grid — no randomness). A
//     variant is RECOGNIZED when orchestrateInterpretation resolves the
//     term's own entity (exact/ambiguous/composed/recovered). improve =
//     the 11 new terms go from ~0% recognized (baseline) to ≥90% (after);
//     hold = the 7 pre-existing terms' recognition rate does not drop.
//   RETRIEVAL — every 6th variant (i % 6 === 0 → 61/term; declared stride,
//     not a silent cap — full 366 would multiply prod pooler load ×6 for no
//     added signal class) runs searchProducts on the keyed DB path with all
//     embedding tiers OFF (declared: this work changes no semantic tier;
//     literal + mapping + culture + assumption are the layers under test).
//     Metrics: result count; top-12 tag alignment (share of top 12 carrying
//     ≥1 EXPECTED tag, weight > 0); fall-off rank (first rank whose item
//     carries no expected tag). improve = mean top-12 alignment for the 11
//     new terms rises vs baseline; gaps = variants with 0 results or
//     alignment < 25%.
//   PASSPORT (after arm only) — bare-name queries for all 18 terms run
//     through resolveSearchAssumption + applyPassportAssumption for two
//     probe Passports with OPPOSING tastes (gorp-utility vs glam-statement)
//     plus anonymous. improve = for terms whose reading overlaps a probe's
//     taste, assumption applies and top-12 alignment to the reading's tags
//     is ≥ anonymous alignment; differential = the two probes must not
//     produce identical applied-slate top-12s for at least 6 terms
//     (influence must be personal, not constant). hold = anonymous slates
//     are byte-identical to the assumption-disabled slates (the clause must
//     be inert for anonymous users).
//   Cross-arm comparison is cluster-level per harness law 3; r7 per-process
//     determinism means ranks compare within one process run only.
//
// Probe rows: two profiles rows (profiles + derived user_style_profiles) are
// created for the passport arm and ARE DELETED AUTOMATICALLY in a finally at
// the end of the after arm (before-state = both uids absent, verified).
// (Aug 8) That used to say "MUST be deleted" while the cleanup step was a
// console.log asking a human — against the KEYED database, so each run left
// two synthetic Passports where listTasteVectors(500) and the taste-graph
// neighbour scan could read them. A note is not a cleanup step.
//
// AMENDMENT HISTORY (declared, chronological):
//   1 (8/4) — the passport phase measures assumption-over-anonymous-slate;
//     for single-reading entities the cultural fallback already ranks by the
//     same tags, so the route assumption is a no-op there BY DESIGN. Added an
//     end-to-end addendum: guided searchProducts(brain:true) vs anonymous.
//   2 (8/4) — amendment 1's first run showed 18/18 divergence with 0/36
//     personalized engagements: BOTH were artifacts of two real defects the
//     battery surfaced — (a) with the Mood Board Brain on, the personal
//     nudge alone admits items, so guided unmatched queries returned
//     query-independent taste noise and the fallback never engaged;
//     (b) cultural-read tie clusters had no deterministic key and reshuffled
//     between requests. Both fixed (queryGrounded gate + id tie-break);
//     re-measured: determinism 3/3, personalized engagements 34/36,
//     probe-vs-probe divergence 3/18, anon-vs-guided 7/18.
//   VERDICT NOTE — the declared "differential ≥ 6 terms" criterion measured
//     5/18 at the route layer (3/18 engine layer). NOT met as declared; the
//     cause is structural, not a defect: 16/18 records carry a single
//     reading, so opposing tastes correctly converge on the same rack.
//     Differential influence expresses through reading SELECTION and needs
//     multi-reading records to be visible. Reported, not silently amended.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts } from "../lib/search/index.js";
import { orchestrateInterpretation } from "../lib/asterisk/orchestrator.js";
import { saveProfile } from "../lib/db/index.js";

const ARM = process.argv[2];
if (!["baseline", "after"].includes(ARM)) { console.error("usage: measure-disciples.mjs baseline|after"); process.exit(1); }

// Expected tags per term — mirrors the culture records (hardcoded so the
// baseline arm, which lacks the 11 new records, measures against the same
// target). "new" terms come from the image study; "held" terms pre-existed.
const TERMS = [
  { term: "marilyn manson", kind: "new", tags: ["STATEMENT", "SEDUCTIVE", "AVANT-GARDE", "INDEPENDENT"] },
  { term: "the casualties", kind: "new", tags: ["STATEMENT", "INDEPENDENT", "STREETWEAR", "UTILITARIAN"] },
  { term: "p diddy", kind: "new", tags: ["STATEMENT", "SEDUCTIVE", "STREETWEAR"] },
  { term: "arctic monkeys", kind: "new", tags: ["INDEPENDENT", "MINIMAL", "STREETWEAR"] },
  { term: "oasis", kind: "new", tags: ["STREETWEAR", "UTILITARIAN", "ARCHIVAL", "INDEPENDENT"] },
  { term: "klaxons", kind: "new", tags: ["STATEMENT", "AVANT-GARDE", "STREETWEAR"] },
  { term: "merle haggard", kind: "new", tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"] },
  { term: "jimmy buffett", kind: "new", tags: ["STATEMENT", "INDEPENDENT"] },
  { term: "m.i.a", kind: "new", tags: ["STATEMENT", "STREETWEAR", "AVANT-GARDE", "INDEPENDENT"] },
  { term: "rod stewart", kind: "new", tags: ["ARCHIVAL", "STATEMENT", "INDEPENDENT"] },
  { term: "gossip", kind: "new", tags: ["INDEPENDENT", "STATEMENT", "ARCHIVAL"] },
  { term: "50 cent", kind: "held", tags: ["STREETWEAR", "STATEMENT", "UTILITARIAN"] },
  { term: "bjork", kind: "held", tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"] },
  { term: "katy perry", kind: "held", tags: ["STATEMENT", "SEDUCTIVE", "AVANT-GARDE"] },
  { term: "lady gaga", kind: "held", tags: ["AVANT-GARDE", "STATEMENT"] },
  { term: "dolly parton", kind: "held", tags: ["STATEMENT", "SEDUCTIVE", "ARCHIVAL"] },
  { term: "madonna", kind: "held", tags: ["SEDUCTIVE", "STATEMENT", "INDEPENDENT"] },
  { term: "spice girls", kind: "held", tags: ["STATEMENT", "STREETWEAR", "SEDUCTIVE"] },
];

// ---- variant generation: fixed grid, first 366 in enumeration order --------
const GARMENTS = ["jacket", "coat", "boots", "dress", "jeans", "tee", "hoodie", "sweater", "skirt", "vest", "sneakers", "shirt"];
const STYLE_T = ["{n} style", "{n} outfit", "{n} look", "{n} aesthetic", "dress like {n}", "{n} fan style", "what {n} fans wear", "{n} concert outfit", "{n} era", "like {n}"];
const CONTEXT_T = ["{n} summer outfit", "{n} winter outfit", "{n} night out", "{n} festival outfit", "{n} streetwear", "{n} vintage", "{n} on a budget", "cheap {n} look", "90s {n}", "2000s {n}"];
const FOR_T = ["{g} like {n}", "{g} for a {n} concert", "{n} inspired {g}"];
const MODS1 = ["black", "white", "vintage", "leather", "oversized", "distressed", "baggy", "slim", "studded", "neon", "plaid", "denim", "cropped", "longline", "chunky"];
const MODS2 = ["ripped", "faded", "waxed", "quilted", "boxy", "tailored", "minimal", "utility", "gothic", "punk"];

function variantsFor(term) {
  const v = [term];
  for (const t of STYLE_T) v.push(t.replace("{n}", term));
  for (const g of GARMENTS) v.push(`${term} ${g}`);
  for (const t of FOR_T) for (const g of GARMENTS) v.push(t.replace("{n}", term).replace("{g}", g));
  for (const m of MODS1) for (const g of GARMENTS) v.push(`${m} ${term} ${g}`);
  for (const t of CONTEXT_T) v.push(t.replace("{n}", term));
  for (const m of MODS2) for (const g of GARMENTS) v.push(`${m} ${term} ${g}`);
  // 1 + 10 + 12 + 36 + 180 + 10 + 120 = 369 → exactly 366
  return v.slice(0, 366);
}

const upTags = (item) => Object.entries(item.tags || {}).filter(([, w]) => w > 0).map(([t]) => t.toUpperCase());
const aligned = (item, tags) => upTags(item).some((t) => tags.includes(t));

function retrievalMetrics(results, tags) {
  const top12 = results.slice(0, 12);
  const alignment = top12.length ? top12.filter((r) => aligned(r, tags)).length / top12.length : 0;
  let fallOff = null;
  for (let i = 0; i < results.length; i++) if (!aligned(results[i], tags)) { fallOff = i + 1; break; }
  return { total: results.length, alignment: +alignment.toFixed(3), fallOff };
}

const report = { arm: ARM, criteria: "see header", terms: {}, passport: null };

for (const { term, kind, tags } of TERMS) {
  const variants = variantsFor(term);
  const rec = { kind, recognition: { recognized: 0, byMethod: {}, misses: [] }, retrieval: [] };
  for (let i = 0; i < variants.length; i++) {
    const q = variants[i];
    const interp = await orchestrateInterpretation(q, null);
    const hit = interp?.entity?.name === term
      || (interp?.alternatives || []).some((a) => a?.name === term);
    if (hit) {
      rec.recognition.recognized++;
      rec.recognition.byMethod[interp.method] = (rec.recognition.byMethod[interp.method] || 0) + 1;
    } else if (rec.recognition.misses.length < 8) {
      rec.recognition.misses.push({ q, method: interp?.method || "none" });
    }
    if (i % 6 === 0) {
      const res = await searchProducts(q, { limit: 48 });
      rec.retrieval.push({ q, ...retrievalMetrics(res.results, tags) });
    }
  }
  rec.recognition.rate = +(rec.recognition.recognized / variants.length).toFixed(3);
  const rs = rec.retrieval;
  rec.retrievalSummary = {
    n: rs.length,
    zeroResults: rs.filter((r) => r.total === 0).length,
    weak: rs.filter((r) => r.alignment < 0.25).length,
    meanAlignment: +(rs.reduce((s, r) => s + r.alignment, 0) / rs.length).toFixed(3),
    meanFallOff: +(rs.filter((r) => r.fallOff).reduce((s, r) => s + r.fallOff, 0) / Math.max(1, rs.filter((r) => r.fallOff).length)).toFixed(1),
  };
  report.terms[term] = rec;
  console.log(`${ARM} ${term.padEnd(16)} recog ${String(rec.recognition.recognized).padStart(3)}/366  align ${rec.retrievalSummary.meanAlignment}  zero ${rec.retrievalSummary.zeroResults}  weak ${rec.retrievalSummary.weak}`);
}

// ---- passport arm (after only) ---------------------------------------------
if (ARM === "after") {
  const { resolveSearchAssumption, applyPassportAssumption } = await import("../lib/search/passportAssumption.js");
  const PROBES = [
    { uid: "u-probe-disciples-gorp", vec: { long: { GORP: 3, UTILITARIAN: 2.5, MINIMAL: 1.5, ARCHIVAL: 1 }, session: {}, _meta: {} } },
    { uid: "u-probe-disciples-glam", vec: { long: { SEDUCTIVE: 3, STATEMENT: 2.5, "AVANT-GARDE": 1.5 }, session: {}, _meta: {} } },
  ];
  for (const p of PROBES) await saveProfile(p.uid, p.vec);
  // try/finally so the cleanup at the bottom runs even when a measurement
  // above throws — which is precisely the run a human would forget to tidy.
  try {
  const pass = { perTerm: {}, differentialTerms: 0, anonymousInert: true };
  for (const { term, tags } of TERMS) {
    const res = await searchProducts(term, { limit: 48 });
    const anonResolved = await resolveSearchAssumption(term, null);
    const anonApplied = applyPassportAssumption(res.results, anonResolved);
    if (anonApplied.assumption.applied || anonApplied.items !== res.results) pass.anonymousInert = false;
    const anonMetrics = retrievalMetrics(res.results, tags);
    const row = { anonymous: { ...anonMetrics, applied: false }, probes: {} };
    const topSlates = [];
    for (const p of PROBES) {
      const resolved = await resolveSearchAssumption(term, p.uid);
      const { items, assumption } = applyPassportAssumption(res.results, resolved);
      const m = retrievalMetrics(items, assumption.applied ? assumption.tags : tags);
      row.probes[p.uid] = { applied: assumption.applied, reason: assumption.reason, affinity: assumption.tasteAffinity, ...m };
      topSlates.push(items.slice(0, 12).map((i) => i.id).join(","));
    }
    if (topSlates[0] !== topSlates[1]) pass.differentialTerms++;
    pass.perTerm[term] = row;
    const g = row.probes[PROBES[0].uid], s = row.probes[PROBES[1].uid];
    console.log(`passport ${term.padEnd(16)} anon ${anonMetrics.alignment}  gorp ${g.applied ? "APPLIED" : g.reason} ${g.alignment}  glam ${s.applied ? "APPLIED" : s.reason} ${s.alignment}`);
  }
  report.passport = pass;
  console.log(`passport differential terms: ${pass.differentialTerms}/18  anonymous inert: ${pass.anonymousInert}`);

  // WHAT WAS WRONG (Aug 8, codebase audit). The header promises these probe
  // rows "MUST be deleted after (cleanup step at the end of the after arm)",
  // and the cleanup step was this console.log — a message asking a human to
  // remember. This script runs against the KEYED database, so every run of the
  // after arm left two synthetic Passports in production, where they are
  // visible to listTasteVectors(500) and therefore to the taste-graph neighbour
  // scan: a measurement probe silently becoming other people's recommendation
  // input. (Checked at the time of the fix: production had 0 stranded rows, so
  // the arm had not been run against it or someone cleaned up by hand.)
  //
  // The cleanup now happens, in a finally, so it also runs when a measurement
  // above throws — which is exactly when a human would forget.
  } finally {
    const { purgePersonalizationData } = await import("../lib/db/production.js");
    const leftovers = [];
    for (const p of PROBES) {
      try { await purgePersonalizationData(p.uid); } catch { leftovers.push(p.uid); }
    }
    if (leftovers.length) {
      console.log(`CLEANUP FAILED for ${leftovers.join(", ")} — DELETE THESE BY HAND before trusting any later measurement.`);
    } else {
      console.log(`cleanup: purged ${PROBES.length} probe Passports (profiles + derived rows).`);
    }
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, `.disciples-${ARM}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`wrote ${out}`);
