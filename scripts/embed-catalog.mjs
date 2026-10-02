#!/usr/bin/env node
// scripts/embed-catalog.mjs — backfill text-v1 embeddings for the catalog
// (asterisk-boost r4). Requires EMBEDDINGS_PROVIDER + EMBEDDINGS_API_KEY in
// the environment (plus DATABASE_URL to write to Supabase; without it the
// vectors land in the in-memory store and die with the process — the script
// warns and continues so the pipeline can still be smoke-tested).
//
//   EMBEDDINGS_PROVIDER=voyage EMBEDDINGS_API_KEY=... \
//     ~/.local/node-v20.18.1-darwin-arm64/bin/node scripts/embed-catalog.mjs
//
// Idempotent: items already embedded under the current provider are skipped;
// pass --force to re-embed everything (e.g. after a model change).

import { embeddingsConfigured, embedTexts, itemEmbedText, TEXT_SPACE } from "../lib/embeddings/index.js";
import { providerInfo } from "../lib/embeddings/provider.js";
import { listItems, listEmbeddings, saveEmbeddings, getPool } from "../lib/db/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const force = process.argv.includes("--force");
// THE FREE TIER IS THE DEFAULT SHAPE (20 Sep 2026). Voyage without a payment
// method allows 3 requests and 10K tokens per minute; a batch of 64 listings
// is ~10K tokens on its own, so every batch was 429 and the run died on the
// first one. EMBED_BATCH_SIZE (default 16, ≈2.5K tokens) and
// EMBED_MIN_INTERVAL_MS (default 21 s, under 3 RPM) pace the run inside the
// tier; a paid key sets EMBED_BATCH_SIZE=64 EMBED_MIN_INTERVAL_MS=300.
const BATCH = Math.max(1, Math.min(96, Number(process.env.EMBED_BATCH_SIZE) || 16));
const INTERVAL_MS = Math.max(0, Number(process.env.EMBED_MIN_INTERVAL_MS) || 21_000);

if (!embeddingsConfigured()) {
  console.error("EMBEDDINGS_PROVIDER / EMBEDDINGS_API_KEY not set — nothing to do.");
  process.exit(1);
}
const info = providerInfo();
console.error(`provider: ${info.name}/${info.model} → space ${TEXT_SPACE}`);
if (!(await getPool())) {
  console.error("WARNING: no DATABASE_URL — writing to the in-memory store (smoke test only).");
}

let items = await listItems(5000);
if (!items.length) items = CATALOG; // empty store → embed the seed catalog
const existing = force
  ? new Set()
  : new Set(
      (await listEmbeddings(TEXT_SPACE, "product"))
        .filter((r) => r.provider === `${info.name}/${info.model}`)
        .map((r) => r.owner_id)
    );
const todo = items.filter((it) => it && it.id && !existing.has(it.id));
console.error(`catalog ${items.length} items · already embedded ${existing.size} · to embed ${todo.length}`);

let done = 0;
console.error(`batch ${BATCH} · at least ${INTERVAL_MS} ms between calls`);
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const startedAt = Date.now();
  // unpaid Voyage tier = 3 RPM / 10K TPM — on 429, wait out the window and
  // retry the same batch instead of dying (up to 10 tries per batch)
  let res;
  for (let attempt = 0; attempt < 10; attempt++) {
    res = await embedTexts(batch.map(itemEmbedText), { feature: "catalog.embed" });
    if (res.ok || !/429/.test(res.hint || "")) break;
    console.error(`batch ${Math.floor(i / BATCH) + 1}: rate-limited, waiting 25s (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 25_000));
  }
  if (!res.ok) {
    console.error(`batch ${Math.floor(i / BATCH) + 1} failed: ${res.hint || "provider error"} — stopping.`);
    process.exit(2);
  }
  await saveEmbeddings(batch.map((it, j) => ({
    ownerId: it.id,
    ownerKind: "product",
    space: TEXT_SPACE,
    provider: `${info.name}/${info.model}`,
    vector: res.data.vectors[j],
  })));
  done += batch.length;
  console.error(`embedded ${done}/${todo.length}`);
  const wait = INTERVAL_MS - (Date.now() - startedAt);
  if (wait > 0 && done < todo.length) await new Promise((r) => setTimeout(r, wait)); // stay under the tier's RPM
}
console.error(`done — ${done} embedded, ${existing.size} skipped.`);
