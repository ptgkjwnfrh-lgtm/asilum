// One adoption scenario, run to completion, printed as a canonical snapshot.
//
// This file is a HELPER, not a test (tests/*.test.js is the suite glob). It
// exists to be executed TWICE as a child process — once with DATABASE_URL set
// and once without — so tests/adoption-differential.test.js can diff mem
// against Postgres on identical input.
//
// Why a child process rather than two module instances: getPool() caches, and
// production.js imports "./index.js" WITHOUT a query string, so a suffixed
// import still binds the default pool. One process therefore cannot host both
// backends. Two processes can, and the isolation is the point.
//
// Everything printed must be BACKEND-INDEPENDENT by construction:
//   - no ids, no timestamps, no decayed sums (wall-clock dependent)
//   - `movedRecords` is deliberately excluded: the two backends count
//     genuinely different row populations and were never meant to agree
//   - numbers rounded, collections sorted
//
// Usage: node tests/helpers/adoption-scenario.mjs <runId>
// Prints a single line of JSON to stdout. Cleans up after itself in both modes.

const runId = process.argv[2];
if (!runId) {
  console.error("usage: adoption-scenario.mjs <runId>");
  process.exit(2);
}

const db = await import("../../lib/db/index.js");
const production = await import("../../lib/db/production.js");

const device = `u-${runId}-dev`;
const account = `sb-${runId}-acct`;
const A = `diff-a-${runId}`;
const B = `diff-b-${runId}`;
const item = `diff-item-${runId}`;
const op = `diffop-${runId}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 80);

const round = (n) => Math.round(Number(n) * 1e6) / 1e6;
const mkEvent = (uid) => ({
  itemId: item, action: "favorite", dwellMs: null,
  canonicalEvent: { userId: uid, type: "USER_FAVORITED_ITEM", payload: { itemId: item } },
});
const reduce = () => ({
  profile: { long: { TAILORED: 1 }, session: {}, _meta: {} },
  edgePairs: [],
  popularity: [{ id: item, eng: 1, imp: 1 }],
});

async function cleanup() {
  for (const uid of [device, account]) {
    await production.purgePersonalizationData(uid).catch(() => {});
  }
  const pool = await db.getPool();
  if (!pool) return;
  const lo = A < B ? A : B, hi = A < B ? B : A;
  await pool.query("DELETE FROM edge_contributors WHERE a=$1 AND b=$2", [lo, hi]).catch(() => {});
  await pool.query("DELETE FROM edges WHERE a=$1 AND b=$2", [lo, hi]).catch(() => {});
  await pool.query("DELETE FROM popularity_contributors WHERE item_id=$1", [item]).catch(() => {});
  await pool.query("DELETE FROM popularity WHERE item_id=$1", [item]).catch(() => {});
  await pool.query(
    "DELETE FROM identity_adoptions WHERE from_user_id=ANY($1::text[]) OR to_user_id=ANY($1::text[])",
    [[device, account]]).catch(() => {});
  await pool.end().catch(() => {});
}

try {
  // Asymmetric evidence: the account is established, the device barely used.
  for (let i = 0; i < 40; i++) await db.recordInteraction(account, `${item}-acct-${i}`, "favorite", null);
  for (let i = 0; i < 4; i++) await db.recordInteraction(device, `${item}-dev-${i}`, "favorite", null);

  // An operation the client may replay across the sign-in. Committed BEFORE
  // the profiles are written: reduce() returns a whole profile, so committing
  // later would overwrite the device's _meta rings and quietly remove the
  // ring-merge from the comparison.
  const firstCommit = await db.commitInteractionBatch({
    userId: device, operationId: op, events: [mkEvent(device)], reduce,
  });

  // ---- both sides accumulate real, DIFFERENT state -------------------------
  await db.saveProfile(account, {
    long: { TAILORED: 0.8, MINIMAL: 0.4 }, session: { TAILORED: 0.2 },
    _meta: { seen: ["acct-a"], follows: ["board-acct"] },
  });
  await db.saveProfile(device, {
    long: { TAILORED: 0.1, GORP: 0.9 }, session: { GORP: 0.3 },
    _meta: { seen: ["dev-a"], follows: ["board-dev"] },
  });

  const acctBoard = await db.createBoard(account, "account board");
  const devBoard = await db.createBoard(device, "device board");
  await db.addBoardItem(acctBoard.id, { id: `${item}-acct`, title: "acct", tags: ["TAILORED"] });
  await db.addBoardItem(devBoard.id, { id: `${item}-dev`, title: "dev", tags: ["GORP"] });

  await production.setFollow(account, "brand", "Helmut Lang", true);
  await production.setFollow(device, "brand", "Arc'teryx", true);
  await production.setFollow(device, "brand", "Helmut Lang", true); // collision

  // Corroboration ledgers: device hard, account not at all.
  for (let i = 0; i < 3; i++) {
    await db.bumpEdges([{ a: A, b: B, w: 2 }], device);
    await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], device);
  }

  // ---- sign in -------------------------------------------------------------
  const adoption = await production.adoptAccountData(device, account);

  // ---- the same human, now signed in, does it all again --------------------
  await db.bumpEdges([{ a: A, b: B, w: 1 }], account);
  await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], account);
  const replay = await db.commitInteractionBatch({
    userId: account, operationId: op, events: [mkEvent(account)], reduce,
  });

  // ---- snapshot ------------------------------------------------------------
  const accountProfile = await db.getProfile(account);
  const deviceProfile = await db.getProfile(device);
  const edges = await db.getEdges([A]);
  const pop = (await db.getPopularity(5000))[item] || {};

  const snapshot = {
    adoption: {
      movedProfile: !!adoption.movedProfile,
      movedBoards: adoption.movedBoards,
      movedCorrections: adoption.movedCorrections,
      duplicate: !!adoption.duplicate,
    },
    accountLong: Object.fromEntries(
      Object.entries(accountProfile.long || {}).map(([k, v]) => [k, round(v)]).sort()),
    accountSession: Object.fromEntries(
      Object.entries(accountProfile.session || {}).map(([k, v]) => [k, round(v)]).sort()),
    accountSeen: [...(accountProfile._meta?.seen || [])].sort(),
    accountFollowsMeta: [...(accountProfile._meta?.follows || [])].sort(),
    deviceProfileEmpty: Object.keys(deviceProfile || {}).length === 0,
    accountBoards: (await db.getBoards(account)).map((b) => b.name).sort(),
    deviceBoards: (await db.getBoards(device)).map((b) => b.name).sort(),
    accountFollows: (await production.listFollows(account)).map((f) => f.target).sort(),
    deviceFollows: (await production.listFollows(device)).map((f) => f.target).sort(),
    edgeContributors: edges[A]?.[B] ?? 0,
    popularity: {
      eng: pop.eng ?? 0, imp: pop.imp ?? 0,
      engagers: pop.engagers ?? 0, viewers: pop.viewers ?? 0,
    },
    firstCommitDuplicate: !!firstCommit.duplicate,
    replayAfterAdoptionDuplicate: !!replay.duplicate,
  };

  process.stdout.write(JSON.stringify(snapshot) + "\n");
} finally {
  await cleanup();
}
