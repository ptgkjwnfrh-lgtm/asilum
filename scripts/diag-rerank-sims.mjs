#!/usr/bin/env node
// scripts/diag-rerank-sims.mjs — one-off diagnostic for r5 tuning: what do
// voyage sims actually look like for the failing storm/hike probes, target
// class vs the jacket-titled items that outrank them? Uses the embedText
// memo so each query is one provider call.
import { embedText, cosine, TEXT_SPACE } from "../lib/embeddings/index.js";
import { listEmbeddings } from "../lib/db/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const stored = await listEmbeddings(TEXT_SPACE, "product");
const vecById = new Map(stored.map((r) => [r.owner_id, r.vector]));
const items = new Map(CATALOG.map((it) => [it.id, it]));
const isTarget = (t) => /GORE-TEX shell|hardshell parka|anorak/i.test(t);

for (const q of ["survives a storm", "waterproof for hiking"]) {
  const qe = await embedText(q);
  if (!qe.ok) { console.error(`embed failed: ${qe.hint}`); process.exit(1); }
  const rows = [];
  for (const [id, vec] of vecById) {
    const it = items.get(id);
    if (!it || it.category !== "outerwear") continue;
    rows.push({ id, title: it.title, sim: cosine(qe.data.vector, vec), target: isTarget(it.title) });
  }
  rows.sort((a, b) => b.sim - a.sim);
  const t = rows.filter((r) => r.target), n = rows.filter((r) => !r.target);
  const stats = (xs) => `n=${xs.length} max=${xs[0]?.sim.toFixed(3)} p50=${xs[Math.floor(xs.length / 2)]?.sim.toFixed(3)}`;
  console.log(`\n=== "${q}" (outerwear only)`);
  console.log(`  targets    ${stats(t)}`);
  console.log(`  non-target ${stats(n)}`);
  console.log("  semantic top 10:");
  rows.slice(0, 10).forEach((r, i) =>
    console.log(`   ${String(i + 1).padStart(2)} ${r.target ? "→" : " "} ${r.sim.toFixed(3)} ${r.title.slice(0, 50)}`));
  await new Promise((r) => setTimeout(r, 21_000));
}
