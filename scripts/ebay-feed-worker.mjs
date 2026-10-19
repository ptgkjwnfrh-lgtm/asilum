#!/usr/bin/env node
// scripts/ebay-feed-worker.mjs — the eBay feed worker (lib/ingest/ebayFeedWorker.js):
// bootstrap → daily catch-up → hourly snapshots, from a state file on
// durable storage. Run it on a host with disk and time, never a web request.
//
//   npm run ebay:worker -- --output /durable/ebay --category 11450 [--marketplace EBAY_US] [--once | --loop --interval 60] [--dry] [--status]
//
// --dry prints the plan and writes nothing. --status prints the state file
// and the publisher's checkpoints. Without --loop it runs one tick (cron
// shape). Reads .env.local like the other operator scripts.
import { parseArgs } from "node:util";
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

try {
  const { values } = parseArgs({ options: {
    output: { type: "string" }, category: { type: "string" }, marketplace: { type: "string", default: "EBAY_US" },
    once: { type: "boolean" }, loop: { type: "boolean" }, interval: { type: "string", default: "60" },
    dry: { type: "boolean" }, status: { type: "boolean" },
  }});
  if (!values.output || !values.category) throw new Error("--output <durable dir> and --category <L1 id> are required");
  const { readState, writeState, runTick, planTick } = await import("../lib/ingest/ebayFeedWorker.js");
  const { stageEbayFeed, feedReadiness } = await import("../lib/ingest/ebayFeed.js");
  const { publishStagedFeed } = await import("../lib/ingest/ebayFeedPublish.js");
  const defaults = { categoryId: values.category, marketplace: values.marketplace };
  const state = await readState(values.output, defaults);

  if (values.status) {
    console.log(JSON.stringify({ readiness: feedReadiness(), state, plan: planTick(state) }, null, 2));
    process.exit(0);
  }
  const deps = {
    outputDir: values.output,
    stage: (o) => stageEbayFeed(o),
    publish: (o) => publishStagedFeed(o),
    save: (s) => writeState(values.output, s),
    log: (m) => console.error(`[ebay-feed-worker ${new Date().toISOString()}] ${m}`),
    dryRun: !!values.dry,
  };
  const tick = async () => {
    const gate = feedReadiness();
    if (!gate.ready) throw new Error(`eBay Feed unavailable: ${gate.missing.join(", ")}`);
    const { plan, done } = await runTick(state, deps);
    console.log(JSON.stringify({ at: new Date().toISOString(), dry: !!values.dry, plan, done }, null, 2));
  };
  if (values.loop) {
    const minutes = Math.max(5, parseInt(values.interval, 10) || 60);
    for (;;) {
      try { await tick(); } catch (e) { console.error(e.message); }
      await new Promise((r) => setTimeout(r, minutes * 60_000));
    }
  } else {
    await tick();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
