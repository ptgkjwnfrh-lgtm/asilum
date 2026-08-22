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
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // Everything a Vercel deploy cannot carry. `supabase/` migrations are applied
  // to Postgres by hand and `scripts/` is operator tooling — neither is in the
  // bundle, so drift in them is not drift a reader can experience. Staging
  // schema-v30 was the first time this check cried wolf.
  for (const dir of ["docs/", "tests/", "supabase/", "scripts/"]) {
    assert.ok(SCRIPT.includes(`"${dir}"`), `${dir} must be excluded from user-facing drift`);
  }
  assert.match(SCRIPT, /NOT_SHIPPED\.some\(/);

  // The dangerous direction. Widening the exclusion list is how this check gets
  // quietly switched off: adding "app/" would make every user-facing change
  // invisible and every run green. The first version of this test asserted only
  // that the four safe directories were PRESENT, which that mutation survives.
  const list = /const NOT_SHIPPED = \[([^\]]*)\]/.exec(SCRIPT);
  assert.ok(list, "NOT_SHIPPED must be a literal list this test can read");
  const excluded = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(excluded, ["docs/", "scripts/", "supabase/", "tests/"],
    "nothing may be added to the not-shipped list without changing this test — " +
    "excluding app/ or lib/ would make the check green forever");
  assert.match(SCRIPT, /docs\/tests\/migrations only — nothing a user sees/);
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

test("the environment rename cannot silence the check (20 Aug: the vq9p deletion)", () => {
  // Vercel's environment label is not stable: "Production – asilum" while two
  // projects build the repo, plain "Production" once one does. Deleting vq9p
  // renamed it mid-day and a check pinned to the old name read e72bed6 as live
  // for eleven hours of false alarms — while production was in fact CURRENT.
  // Both names must be queried, and the merged lists re-sorted so a stale
  // environment's newest record cannot outrank the current environment's.
  assert.ok(SCRIPT.includes('"Production,Production – asilum"'),
    "both environment names ride the default list");
  assert.match(SCRIPT, /for \(const environment of ENVIRONMENTS\)/);
  assert.match(SCRIPT, /deployments\.sort\(/,
    "merged lists must be re-sorted by created_at or the newest success is a lie");
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

// ---------------------------------------------------------------------------
// The 21 August wait-race, reproduced rather than described.
//
// The last red drift run that day was not drift. Its head was 90c5cb1 — the
// merge of #336 — and while it slept its 240 seconds waiting for Vercel to
// report, #337 merged and deployed as f938914. The run woke to find production
// serving a commit that did not exist when it checked out, could not resolve
// the range, and reported "shallow clone?" — with fetch-depth already 0.
//
// These tests build the situation out of real git objects and a stubbed `gh`,
// because a source-text assertion cannot tell a fix from a reworded message.

const SCRIPT_PATH = ROOT + "scripts/check-deploy-drift.mjs";

// `gh api <path>` — the only two calls the script makes.
const FAKE_GH = `#!/bin/sh
case "$2" in
  *statuses*) echo '[{"state":"success"}]' ;;
  *) printf '[{"id":1,"sha":"%s","environment":"Production","created_at":"2026-08-21T19:38:00Z"}]' "$DRIFT_FAKE_SHA" ;;
esac
`;

/** A world with an `origin` and a working clone, plus a `gh` that lies on cue. */
function world() {
  const dir = mkdtempSync(join(tmpdir(), "drift-"));
  const sh = (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  const bin = join(dir, "bin");
  execFileSync("mkdir", ["-p", bin]);
  writeFileSync(join(bin, "gh"), FAKE_GH);
  chmodSync(join(bin, "gh"), 0o755);

  const origin = join(dir, "origin.git");
  sh(dir, "init", "--quiet", "--bare", "-b", "main", origin);

  const work = join(dir, "work");
  sh(dir, "init", "--quiet", "-b", "main", work);
  sh(work, "config", "user.email", "drift@test");
  sh(work, "config", "user.name", "drift test");
  sh(work, "remote", "add", "origin", origin);

  const commit = (message) => {
    writeFileSync(join(work, "app-file.js"), message);
    sh(work, "add", "-A");
    sh(work, "commit", "--quiet", "-m", message);
    return sh(work, "rev-parse", "HEAD");
  };

  const run = (cwd, deployedSha) => {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          DRIFT_FAKE_SHA: deployedSha,
          DRIFT_ENVIRONMENT: "Production",
        },
      });
      return { code: 0, stdout, stderr: "" };
    } catch (error) {
      return { code: error.status, stdout: error.stdout || "", stderr: error.stderr || "" };
    }
  };

  return { dir, work, origin, sh, commit, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("production one merge ahead of this checkout is NOT drift (the #336 race)", () => {
  // The exact 21 August shape: the run holds the older commit, production is
  // already serving the newer one. Everything this run tested is live.
  const w = world();
  try {
    const older = w.commit("the run's own checkout");
    const newer = w.commit("merged and deployed during the 240s sleep");
    w.sh(w.work, "push", "--quiet", "origin", "main");
    // main moves back to what this run actually checked out; `newer` stays a
    // reachable object, exactly as it is on a runner that fetched depth 0.
    w.sh(w.work, "reset", "--hard", "--quiet", older);

    const r = w.run(w.work, newer);
    assert.equal(r.code, 0, `must pass, got exit ${r.code}\n${r.stderr}`);
    assert.match(r.stdout, /production is AHEAD of this run/);
    // and it must NOT reach for the old misdiagnosis
    assert.doesNotMatch(r.stdout + r.stderr, /shallow clone/);
    assert.doesNotMatch(r.stdout + r.stderr, /DEPLOY DRIFT/);
  } finally { w.cleanup(); }
});

test("a deployed commit missing from the checkout is fetched, not blamed on the clone", () => {
  // The harder half of the race: the newer commit is not in this checkout at
  // all. fetch-depth 0 does not help — the commit did not exist when checkout
  // ran. The script must go and get it before it judges anything.
  const w = world();
  try {
    const older = w.commit("the run's own checkout");
    w.sh(w.work, "push", "--quiet", "origin", "main");

    // A second clone stops at `older` — this is the runner's checkout.
    const runner = join(w.dir, "runner");
    w.sh(w.dir, "clone", "--quiet", w.origin, runner);
    w.sh(runner, "config", "user.email", "drift@test");
    w.sh(runner, "config", "user.name", "drift test");

    // Only now does the newer commit exist, and only on origin.
    const newer = w.commit("merged and deployed during the 240s sleep");
    w.sh(w.work, "push", "--quiet", "origin", "main");
    assert.throws(
      () => w.sh(runner, "cat-file", "-e", `${newer}^{commit}`),
      "the runner must genuinely not have the commit yet, or this proves nothing",
    );

    const r = w.run(runner, newer);
    assert.equal(r.code, 0, `must fetch and pass, got exit ${r.code}\n${r.stderr}`);
    assert.match(r.stdout, /production is AHEAD of this run/);
    assert.doesNotMatch(r.stdout + r.stderr, /shallow clone/);
    assert.equal(older, w.sh(runner, "rev-parse", "main"),
      "fetching the deployed sha must not move the tip this run is judging");
  } finally { w.cleanup(); }
});

test("real drift still fails — the race fix must not become an escape hatch", () => {
  // The mutation that would make this whole check worthless: treating every
  // unresolved comparison as "ahead, therefore fine". Production genuinely
  // behind on a user-facing file must still go red, with the merge list.
  const w = world();
  try {
    const deployed = w.commit("what production is serving");
    w.commit("a user-facing change that never shipped");
    w.sh(w.work, "push", "--quiet", "origin", "main");

    const r = w.run(w.work, deployed);
    assert.equal(r.code, 1, "production behind on app code must fail");
    assert.match(r.stderr, /DEPLOY DRIFT/);
    assert.match(r.stderr, /production is serving/);
    assert.doesNotMatch(r.stdout, /AHEAD/);
  } finally { w.cleanup(); }
});

test("a deployed commit origin has never heard of is still a hard failure", () => {
  // Force-pushed or deleted out from under production. The fetch cannot save
  // this one, and it must not be quietly waved through as a race.
  const w = world();
  try {
    w.commit("the only commit anyone has");
    w.sh(w.work, "push", "--quiet", "origin", "main");

    const r = w.run(w.work, "0".repeat(40));
    assert.equal(r.code, 1, "an unfetchable deployed sha must fail");
    assert.match(r.stderr, /cannot be fetched from origin at all/);
    assert.match(r.stderr, /force-pushed or deleted commit/);
  } finally { w.cleanup(); }
});
