// tests/deploy-drift.test.js — the check that makes "merged" stop meaning "shipped".
//
// On 17 August main sat several merges ahead of production for most of a day and
// nothing said so — twice. The first time Vercel's daily build allowance ran out
// and reported a red check nobody was watching. The second time production
// deployments simply stopped firing while PR previews kept succeeding, and that
// reported NOTHING: no status, no failure. A merged PR reads as shipped either
// way, and the accessibility fixes in #233-#238 existed while no user had them.
//
// These tests do not call the network. They pin the two properties that make the
// script trustworthy: it must FAIL when it cannot read the API (a silent pass is
// the exact failure mode it was written about), and it must not cry drift over a
// docs-only gap, or it will be ignored within a week.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = readFileSync(ROOT + "scripts/check-deploy-drift.mjs", "utf8");
// The workflow is parked as a snippet, not a live workflow: the stored gh
// OAuth token has no `workflow` scope, so GitHub rejects any push that
// creates .github/workflows/*. The check itself is live (npm run
// deploy:check); only the automation waits on the owner.
const WORKFLOW = readFileSync(ROOT + "docs/deploy-drift-workflow.yml.txt", "utf8");
const PKG = JSON.parse(readFileSync(ROOT + "package.json", "utf8"));

test("the check is runnable the same way the other scheduled check is", () => {
  assert.equal(PKG.scripts["deploy:check"], "node scripts/check-deploy-drift.mjs");
});

test("an unreadable API fails the check rather than passing quietly", () => {
  // The whole point. A check that greens out when it cannot see is worse than no
  // check, because it manufactures confidence.
  assert.match(SCRIPT, /could not read deployments/);
  assert.match(SCRIPT, /must say so rather than pass quietly/);
  // and it must exit non-zero on that path
  assert.match(SCRIPT, /function fail\([\s\S]*?process\.exit\(1\)/);
});

test("it only counts a deployment that actually succeeded", () => {
  // A deployment record exists as soon as one is *attempted* — including the
  // rate-limited failures from that morning. Reading the record alone would have
  // called production current while it was hours behind.
  assert.match(SCRIPT, /statuses\.some\(\(s\) => s\.state === "success"\)/);
});

test("a docs-only gap does not cry wolf", () => {
  // If this fires on every docs merge it gets muted, and then it is worth
  // nothing on the day it matters.
  assert.match(SCRIPT, /!f\.startsWith\("docs\/"\) && !f\.startsWith\("tests\/"\)/);
  assert.match(SCRIPT, /docs\/tests only — nothing a user sees/);
});

test("the failure message names the merges and the files a user cannot see", () => {
  // A drift alert that only says "behind" sends someone digging. This one hands
  // over the merge list, the user-facing files, and the fix.
  assert.match(SCRIPT, /merge\(s\) and \$\{userFacing\.length\} user-facing file\(s\) are NOT live/);
  assert.match(SCRIPT, /redeploy main from the Vercel dashboard/);
  // and it names the specific silent mode that actually happened
  assert.match(SCRIPT, /previews succeed while/);

  // It must say WAIT before it says redeploy. The original message sent the
  // reader straight to the dashboard on a diagnosis that was never
  // demonstrated — production caught up unattended five times across 17 August
  // with nobody touching a setting. Asserted on ORDER, because the retraction
  // is worth nothing if a later edit leaves both sentences in the wrong one.
  assert.match(SCRIPT, /WAIT ONE MERGE/);
  assert.ok(
    SCRIPT.indexOf("WAIT ONE MERGE") < SCRIPT.indexOf("Only if it is STILL behind"),
    "the message must tell the reader to wait before it tells them to redeploy",
  );
});

test("the parked workflow can answer 'how far behind' and waits for the deploy", () => {
  // Asserted even though it is inert, so the snippet is correct on the day
  // someone activates it.
  assert.match(WORKFLOW, /NOT ACTIVE YET/);
  assert.match(WORKFLOW, /without `workflow` scope/);
  // fetch-depth: 0 — a shallow clone cannot compare two shas.
  assert.match(WORKFLOW, /fetch-depth: 0/);
  // A deployment takes minutes to report; checking instantly would flag every push.
  assert.match(WORKFLOW, /sleep 240/);
  assert.match(WORKFLOW, /deployments: read/);
  // Both triggers: after a merge, and on a schedule for the silent-stall case
  // that reports no status at all.
  assert.match(WORKFLOW, /branches: \[main\]/);
  assert.match(WORKFLOW, /cron:/);
});
