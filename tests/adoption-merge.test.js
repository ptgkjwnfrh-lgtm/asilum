import test from "node:test";
import assert from "node:assert/strict";

import { getProfile, saveProfile } from "../lib/db/index.js";
import { adoptAccountData, purgePersonalizationData } from "../lib/db/production.js";

// audit #16: on account adoption, mergeTasteProfiles let the target (account)
// win on every _meta key, so the DEVICE's accumulated bridgeStats/bridgeServed
// — the r16/r19 tuning DENOMINATOR — were discarded, while user_events (the
// NUMERATOR) transferred additively. Tuning then saw engagement without its
// matching impressions. These tests drive the REAL adoption path (proving the
// device=source / account=target arg order too), mem-mode.

async function seed(uid, profile) {
  await purgePersonalizationData(uid).catch(() => {});
  await saveProfile(uid, profile);
}

test("#16 device bridge impressions SURVIVE adoption when the account has its own", async () => {
  const device = "u-dev-16a", account = "u-acct-16a";
  // device browsed a lot pre-signin; account browsed a little post-signup.
  await seed(device, {
    long: { GORP: 0.4 }, session: {},
    _meta: { bridgeStats: { gamma: 90, alpha: 40 }, bridgeServed: { gamma: 120, alpha: 60 } },
  });
  await seed(account, {
    long: { MINIMAL: 0.2 }, session: {},
    _meta: { bridgeStats: { alpha: 10 }, bridgeServed: { alpha: 15 } },
  });

  await adoptAccountData(device, account);
  const merged = await getProfile(account);

  // Summed per bridge, not target-wins-and-discard.
  assert.equal(merged._meta.bridgeStats.gamma, 90, "device-only gamma preserved");
  assert.equal(merged._meta.bridgeStats.alpha, 50, "alpha summed (40 device + 10 account)");
  assert.equal(merged._meta.bridgeServed.gamma, 120, "served gamma preserved");
  assert.equal(merged._meta.bridgeServed.alpha, 75, "served alpha summed (60 + 15)");

  await purgePersonalizationData(device).catch(() => {});
  await purgePersonalizationData(account).catch(() => {});
});

test("#16 the 100k per-bridge cap holds after summing", async () => {
  const device = "u-dev-16b", account = "u-acct-16b";
  await seed(device, { long: {}, session: {}, _meta: { bridgeStats: { gamma: 80_000 } } });
  await seed(account, { long: {}, session: {}, _meta: { bridgeStats: { gamma: 80_000 } } });
  await adoptAccountData(device, account);
  const merged = await getProfile(account);
  assert.equal(merged._meta.bridgeStats.gamma, 100_000, "sum clamps to the 100k cap");
  await purgePersonalizationData(device).catch(() => {});
  await purgePersonalizationData(account).catch(() => {});
});

test("#16 tuning invariant: every transferred engagement retains impressions", async () => {
  // The concrete harm: engagement (numerator) present, impressions
  // (denominator) zero. After the fix, any bridge the device engaged on must
  // still carry its device impressions post-adoption.
  const device = "u-dev-16c", account = "u-acct-16c";
  await seed(device, { long: {}, session: {}, _meta: { bridgeStats: { gamma: 200, beta: 50 } } });
  await seed(account, { long: {}, session: {}, _meta: {} }); // fresh account
  await adoptAccountData(device, account);
  const merged = await getProfile(account);
  for (const bridge of ["gamma", "beta"]) {
    assert.ok((merged._meta.bridgeStats[bridge] || 0) > 0,
      `${bridge} kept its impression denominator after adoption`);
  }
  await purgePersonalizationData(device).catch(() => {});
  await purgePersonalizationData(account).catch(() => {});
});

test("#16 ring caps match the canonical writers (recent 20, follows 10)", async () => {
  const device = "u-dev-16d", account = "u-acct-16d";
  const many = (n, p) => Array.from({ length: n }, (_, i) => p + i);
  await seed(device, { long: {}, session: {}, _meta: { recent: many(18, "d"), follows: many(8, "bd") } });
  await seed(account, { long: {}, session: {}, _meta: { recent: many(18, "a"), follows: many(8, "ba") } });
  await adoptAccountData(device, account);
  const merged = await getProfile(account);
  assert.ok(merged._meta.recent.length <= 20, `recent capped at 20, got ${merged._meta.recent.length}`);
  assert.ok(merged._meta.follows.length <= 10, `follows capped at 10, got ${merged._meta.follows.length}`);
  await purgePersonalizationData(device).catch(() => {});
  await purgePersonalizationData(account).catch(() => {});
});

test("#16 profiles with no bridge counters adopt cleanly (no fabricated keys break reads)", async () => {
  const device = "u-dev-16e", account = "u-acct-16e";
  await seed(device, { long: { GORP: 0.5 }, session: {}, _meta: { recent: ["syn-1"] } });
  await seed(account, {});
  const res = await adoptAccountData(device, account);
  assert.ok(res.movedProfile || res.movedRecords >= 0, "adoption completed");
  const merged = await getProfile(account);
  assert.ok(merged.long, "merged profile is well-formed");
  await purgePersonalizationData(device).catch(() => {});
  await purgePersonalizationData(account).catch(() => {});
});
