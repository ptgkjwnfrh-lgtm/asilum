#!/usr/bin/env node
// scripts/publish-ebay-feed.mjs — publish ONE staged feed directory into the
// catalog (lib/ingest/ebayFeedPublish.js), or plan the daily catch-up.
//
//   npm run ebay:publish -- --dir /durable/ebay/ebay-feed-XXXX [--limit 5000] [--dry]
//   npm run ebay:publish -- --plan --since 2026-10-01T04:00:00.000Z [--published 2026-10-02,2026-10-03]
//
// Reads .env.local the way the other operator scripts do (npm does not).
// Writes nothing on --dry and nothing without the four feed gates.
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
    dir: { type: "string" }, limit: { type: "string" }, dry: { type: "boolean" },
    plan: { type: "boolean" }, since: { type: "string" }, published: { type: "string" },
  }});
  const { publishStagedFeed, catchUpPlan } = await import("../lib/ingest/ebayFeedPublish.js");
  if (values.plan) {
    if (!values.since) throw new Error("--plan needs --since <bootstrap generation time, ISO>");
    const published = new Set(String(values.published || "").split(",").map((s) => s.trim()).filter(Boolean));
    console.log(JSON.stringify(catchUpPlan({ bootstrapObservedAt: values.since, published }), null, 2));
  } else {
    if (!values.dir) throw new Error("--dir <staged feed directory> required");
    const limit = values.limit ? Math.max(1, parseInt(values.limit, 10) || 1) : Infinity;
    const report = await publishStagedFeed({ directory: values.dir, limit, dryRun: !!values.dry });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === "failed" ? 1 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
