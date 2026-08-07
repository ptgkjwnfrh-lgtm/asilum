import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL || "";

// THE STRUCTURAL TEST. Round A found four bugs in adoption, and THREE of them
// were invisible for the same reason: mem and Postgres disagreed, and almost
// every test runs mem. Each was caught by hand, one at a time:
//
//   #149  the identity_hash ledgers were never moved
//   #150  the early return could skip that move (Postgres only)
//   #151  mem deleted operation ids where Postgres rekeyed them
//
// Hand-diffing two backends does not scale and does not stay done. This runs
// ONE scenario through BOTH and asserts the observable outcomes are identical,
// so the next divergence fails a test instead of waiting to be noticed.
//
// Two child processes rather than two module instances: getPool() caches, and
// production.js imports "./index.js" without a query string, so a suffixed
// import still binds the default pool. One process cannot host both backends.
//
// Skipped without TEST_DATABASE_URL — there is no Postgres to differ FROM.
test("mem and Postgres agree on the whole adoption scenario",
  { skip: !databaseUrl }, async () => {
  const scenario = path.join(process.cwd(), "tests", "helpers", "adoption-scenario.mjs");

  // Distinct run ids: the two runs must not collide on shared state, and the
  // Postgres run writes real rows it then cleans up.
  const memRun = await run(process.execPath, [scenario, `mem${randomUUID().slice(0, 8)}`], {
    env: { ...process.env, DATABASE_URL: "", TEST_DATABASE_URL: "" },
  });
  const pgRun = await run(process.execPath, [scenario, `pg${randomUUID().slice(0, 8)}`], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  const mem = JSON.parse(memRun.stdout.trim().split("\n").pop());
  const pg = JSON.parse(pgRun.stdout.trim().split("\n").pop());

  // Field by field, so a failure names the divergence instead of dumping two
  // blobs and leaving the reader to spot the difference.
  for (const key of Object.keys(mem)) {
    assert.deepEqual(pg[key], mem[key],
      `backends diverge on "${key}":\n  mem = ${JSON.stringify(mem[key])}\n  pg  = ${JSON.stringify(pg[key])}`);
  }
  assert.deepEqual(Object.keys(pg).sort(), Object.keys(mem).sort(),
    "both backends must report the same snapshot shape");

  // Guard the guard: a scenario that silently degraded to nothing would make
  // every comparison above trivially true. Pin the facts Round A established.
  assert.equal(mem.adoption.movedProfile, true, "the scenario must actually adopt a profile");
  assert.equal(mem.deviceProfileEmpty, true, "adoption empties the device (#148)");
  assert.equal(mem.edgeContributors, 1, "one human is one contributor (#149)");
  assert.equal(mem.popularity.engagers, 1, "one human is one engager (#149)");
  assert.equal(mem.replayAfterAdoptionDuplicate, true, "a replayed op is refused (#151)");
  // #148. This scenario's evidence ratio is 45:5, not the 500:5 of the unit
  // battery, so the account keeps ~77% of its conviction rather than ~99%.
  // The property being pinned is that it beats the OLD flat average, which for
  // 0.8 and 0.1 was exactly 0.45 — not any particular tuned number.
  assert.ok(mem.accountLong.TAILORED > 0.55,
    `evidence weighting must beat the old 0.45 flat average (#148), got ${mem.accountLong.TAILORED}`);
  assert.ok(mem.accountLong.TAILORED < 0.8,
    "and the device must still move it — this is a merge, not account-wins");
  assert.deepEqual(mem.accountSeen, ["acct-a", "dev-a"], "the _meta rings merge, not overwrite");
});
