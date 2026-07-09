// lib/background-jobs/index.js
// Learning-job registry. There is NO job runner in this stack yet (no queue,
// no cron) — so these are contracts only, and every run() says so honestly.
// When infra arrives (Supabase cron / a worker), implement run() per job and
// wire a scheduler; the registry shape stays.

import { notImplemented } from "../ai/contract.js";

const job = (id, description, needs) => ({
  id, description, needs,
  run: async () => notImplemented("job:" + id, "no job runner in the stack; " + needs),
});

export const JOBS = [
  job("analyze-moodboard-images", "run lib/vision over new board uploads", "vision provider"),
  job("update-taste-profiles", "fold new events into long-term profiles", "user_events table"),
  job("ingest-products", "pull connector/designer feeds into the catalog", "configured connectors"),
  job("generate-product-embeddings", "embed catalog items", "embeddings provider"),
  job("refresh-recommendations", "precompute per-user candidate sets", "embeddings + taste-graph"),
  job("process-fit-analyses", "run queued fit pics through the analyzer", "vision provider"),
  job("sync-external-accounts", "refresh opt-in connector data", "configured connectors"),
  job("update-taste-clusters", "recluster user embeddings", "user embeddings"),
  job("recalc-user-similarity", "refresh nearest-neighbor tables", "user_similarity table"),
  job("tune-feed-ranking", "evaluate ranking factors against engagement", "user_events history"),
  job("refresh-product-similarity", "rebuild item-item neighbors beyond live edges", "product embeddings"),
];

export function jobsStatus() {
  return JOBS.map(({ id, description, needs }) => ({ id, description, needs, runnable: false }));
}
