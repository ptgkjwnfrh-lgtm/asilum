// scripts/check-deploy-drift.mjs
// Fails when `main` has moved ahead of what production is actually serving.
//
// WHY THIS EXISTS. On 17 August, main sat four merges ahead of production for
// most of a day and nothing said so. It happened twice: first Vercel's daily
// build allowance ran out (reported honestly, as a red check nobody was
// watching), then production deployments stopped firing altogether while PR
// previews kept succeeding — that second one reported NOTHING at all, no status,
// no failure. A merged PR reads as "shipped" in the PR list either way.
//
// The gap is not academic. #233-#238 included the accessibility fixes; the code
// existed and no user had it. The point of this check is that "merged" and
// "deployed" stop being the same word by accident.
//
// It uses only the GitHub deployments API — no Vercel token, no dashboard. It
// asks one question: is the newest SUCCESSFUL production deployment at, or a
// descendant-of-nothing behind, the tip of main?
//
// Exit 0 = production is current, or the drift is docs-only (harmless).
// Exit 1 = production is behind on code that users cannot see.

import { execFileSync } from "node:child_process";

const REPO = process.env.DRIFT_REPO || "ptgkjwnfrh-lgtm/asilum";
const ENVIRONMENT = process.env.DRIFT_ENVIRONMENT || "Production – asilum";
const BRANCH = process.env.DRIFT_BRANCH || "main";

const gh = (path) => {
  const out = execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(out);
};
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function fail(lines) {
  console.error("DEPLOY DRIFT\n");
  for (const line of lines) console.error("  " + line);
  process.exit(1);
}

const tip = git("rev-parse", BRANCH);

let deployments;
try {
  deployments = gh(`repos/${REPO}/deployments?environment=${encodeURIComponent(ENVIRONMENT)}&per_page=20`);
} catch (error) {
  // A check that cannot read the API must say so rather than pass quietly — a
  // silent pass is exactly the failure mode this script was written about.
  fail([
    `could not read deployments for ${REPO} (${ENVIRONMENT})`,
    String(error.message || error).split("\n")[0],
  ]);
}

// The newest deployment whose latest status is `success`.
let live = null;
for (const deployment of deployments) {
  let statuses = [];
  try {
    statuses = gh(`repos/${REPO}/deployments/${deployment.id}/statuses?per_page=10`);
  } catch { continue; }
  if (statuses.some((s) => s.state === "success")) { live = deployment; break; }
}

if (!live) {
  fail([
    `no SUCCESSFUL "${ENVIRONMENT}" deployment in the last ${deployments.length} records.`,
    "production may never have shipped, or the git integration has stopped firing.",
  ]);
}

if (live.sha === tip) {
  console.log(`production is current: ${ENVIRONMENT} at ${tip.slice(0, 7)} (= ${BRANCH})`);
  process.exit(0);
}

// Behind — but by how much, and does any of it reach a user? A docs-only gap is
// not worth waking anyone for.
let range = [];
try {
  range = git("log", "--first-parent", "--format=%h %s", `${live.sha}..${tip}`).split("\n").filter(Boolean);
} catch {
  fail([
    `production is at ${live.sha.slice(0, 7)}, ${BRANCH} is at ${tip.slice(0, 7)},`,
    "and the two are not comparable in this checkout (shallow clone?).",
  ]);
}

let changed = [];
try {
  changed = git("diff", "--name-only", `${live.sha}..${tip}`).split("\n").filter(Boolean);
} catch { changed = []; }
// What a Vercel deploy can actually put in front of a reader. `supabase/` is
// migrations, applied to Postgres by hand via apply-schema.mjs — deploying the
// app never applies one, so calling a staged migration "a file a user cannot
// see yet" is not merely noisy, it is false. `scripts/` is operator tooling and
// is not in the bundle either; both were confirmed absent from the build output
// and unimported by anything under app/ or lib/.
//
// This matters more than the tidiness: a check that fires on changes a deploy
// could never carry is a check that gets muted, and then it is worth nothing on
// the day it matters. Adding v30 was the first time it cried wolf.
const NOT_SHIPPED = ["docs/", "tests/", "supabase/", "scripts/"];
const userFacing = changed.filter((f) => !NOT_SHIPPED.some((d) => f.startsWith(d)));

if (!userFacing.length) {
  console.log(
    `production is ${range.length} merge(s) behind ${BRANCH}, but the gap is docs/tests/migrations only — nothing a user sees.`,
  );
  console.log(`  production: ${live.sha.slice(0, 7)}   ${BRANCH}: ${tip.slice(0, 7)}`);
  process.exit(0);
}

fail([
  `production is serving ${live.sha.slice(0, 7)}; ${BRANCH} is at ${tip.slice(0, 7)}.`,
  `${range.length} merge(s) and ${userFacing.length} user-facing file(s) are NOT live:`,
  ...range.map((line) => "  " + line),
  "",
  "files a user cannot see yet:",
  ...userFacing.slice(0, 12).map((f) => "  " + f),
  ...(userFacing.length > 12 ? [`  …and ${userFacing.length - 12} more`] : []),
  "",
  "First: WAIT ONE MERGE and run this again. If previews succeed while",
  "production reports no status at all, that is the 17 August state — and it",
  "was read then as a stopped git integration, a project setting. Nobody",
  "touched the dashboard: production caught up on its own, three times in one",
  "session and twice more the same day. The cause was never demonstrated, so",
  "do not spend a day in settings on it.",
  "",
  "Only if it is STILL behind after a later merge:",
  "redeploy main from the Vercel dashboard — and check the build allowance",
  "first, because running out of it is the one cause here ever confirmed.",
]);
