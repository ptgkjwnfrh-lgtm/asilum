import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The applied schema version must match the migrations actually committed.
// DERIVED rather than hardcoded (it read a literal 23 until Aug 6): CI applies
// every supabase/schema-v*.sql, so a literal turns "someone added a migration"
// into a red build that says only "25 !== 23" — and it fails on the ONE suite
// that skips locally without a database, so the author sees it first in CI.
// The substantive guard is unchanged: applied state must equal committed
// files, which still catches an out-of-band apply and a migration that forgot
// its app_schema_migrations row.
function committedSchemaVersion() {
  const dir = path.join(process.cwd(), "supabase");
  const versions = fs.readdirSync(dir)
    .map((f) => /^schema-v(\d+)-/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return versions.length ? Math.max(...versions) : 0;
}

const databaseUrl = process.env.TEST_DATABASE_URL || "";

// The ledger REKEY that adoption performs had no Postgres coverage — exactly
// the gap #144 existed to close for the popularity write path. The statements
// run INSIDE adoptAccountData's transaction, and the unit suite that proves
// them runs mem-mode, so a Postgres-only fault (a parse error, a wrong
// conflict target, a recompute that reads a pre-write snapshot) would ship
// green. This drives the real transaction against a real database.
//
// THESE TWO TESTS RUN FIRST, ON PURPOSE, ON THE DEFAULT MODULE INSTANCE.
// The `?suffix=1` trick the later tests use gives each of them a private pool,
// but production.js imports "./index.js" WITHOUT a query string — so a
// suffixed production.js still reaches for the DEFAULT pool, which the
// board/ticket test below ends in its cleanup. The tests that survive that do
// it by injecting a live pool through `queryTarget`, and adoptAccountData
// takes no such parameter (it owns its own BEGIN/COMMIT and advisory locks).
// Running before anything calls pool.end() is the fix that needs no
// testability seam in production code. Neither test may end the pool.
// CI caught this the first time these ran: "Cannot use a pool after calling
// end on the pool", both tests, which is the failure this comment exists to
// stop someone re-introducing by moving them.
test("Postgres adoption rekeys the identity_hash ledgers", { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js");
  const production = await import("../lib/db/production.js");
  const pool = await db.getPool();
  const suffix = randomUUID();
  const device = `u-${randomUUID()}`;
  const account = `sb-${randomUUID()}`;
  const A = `pgadopt-a-${suffix}`;
  const B = `pgadopt-b-${suffix}`;
  const lo = A < B ? A : B, hi = A < B ? B : A;
  const item = `pgadopt-item-${suffix}`;

  t.after(async () => {
    await pool.query("DELETE FROM edge_contributors WHERE a=ANY($1::text[]) OR b=ANY($1::text[])", [[A, B]]);
    await pool.query("DELETE FROM edges WHERE a=ANY($1::text[]) OR b=ANY($1::text[])", [[A, B]]);
    await pool.query("DELETE FROM popularity_contributors WHERE item_id=$1", [item]);
    await pool.query("DELETE FROM popularity WHERE item_id=$1", [item]);
    await pool.query(
      "DELETE FROM identity_adoptions WHERE from_user_id=ANY($1::text[]) OR to_user_id=ANY($1::text[])",
      [[device, account]]);
    for (const uid of [device, account]) await production.purgePersonalizationData(uid).catch(() => {});
  });

  // The device corroborates a pair and an item, hard. Repetition buys nothing.
  for (let i = 0; i < 5; i++) {
    await db.bumpEdges([{ a: A, b: B, w: 2 }], device);
    await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], device);
  }
  let edge = (await pool.query("SELECT w,contributors FROM edges WHERE a=$1 AND b=$2", [lo, hi])).rows[0];
  assert.equal(edge.contributors, 1, "device is ONE contributor before sign-in");

  // Sign in.
  await db.saveProfile(device, { long: { MINIMAL: 0.5 }, session: {}, _meta: {} });
  await production.adoptAccountData(device, account);

  // The rows must now BELONG to the account, not merely still exist.
  const stranded = await pool.query(
    "SELECT count(*)::int n FROM edge_contributors WHERE a=$1 AND b=$2 AND identity_hash=$3",
    [lo, hi, db.identityHash(device)]);
  assert.equal(stranded.rows[0].n, 0, "no ledger row left stranded under the device hash");

  // The same human, now signed in, engages the SAME pair and item again.
  await db.bumpEdges([{ a: A, b: B, w: 1 }], account);
  await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], account);

  edge = (await pool.query("SELECT w,contributors FROM edges WHERE a=$1 AND b=$2", [lo, hi])).rows[0];
  assert.equal(edge.contributors, 1, "one human is still ONE contributor after signing in");
  assert.equal(Number(edge.w), 2, "GREATEST of the two bests (2 and 1), never their sum");

  const pop = (await pool.query(
    "SELECT engagers,viewers,engagers_decayed FROM popularity WHERE item_id=$1", [item])).rows[0];
  assert.equal(pop.engagers, 1, "one human, one engager");
  assert.equal(pop.viewers, 1, "one human, one viewer");
  // The recompute is a separate statement from the rekey for the same reason
  // writeEdges splits its two: a CTE fused onto the write reads a snapshot
  // taken at statement start and would lag by exactly one contributor.
  assert.ok(Math.abs(Number(pop.engagers_decayed) - 1) < 1e-4,
    `decayed engagers must collapse to one person, got ${pop.engagers_decayed}`);

  // Erasure must now reach what was corroborated BEFORE sign-in.
  await production.purgePersonalizationData(account);
  const leftEdge = await pool.query(
    "SELECT contributors FROM edges WHERE a=$1 AND b=$2", [lo, hi]);
  assert.equal(leftEdge.rows[0]?.contributors ?? 0, 0,
    "pre-sign-in edge corroboration is erased with the account");
  const leftPop = await pool.query("SELECT engagers FROM popularity WHERE item_id=$1", [item]);
  assert.equal(leftPop.rows[0]?.engagers ?? 0, 0,
    "pre-sign-in engager is erased with the account");
});

// The early return that made the rekey above unreachable. adoptAccountData
// short-circuits when a prior adoption exists and the device shows no NEW
// signals — but "signals" enumerated user_id tables only, and the ledgers are
// keyed by identity_hash. GET /api/interpret writes unknown_query_votes and
// nothing else, so a signed-out search between two sign-ins produced exactly
// the state the short-circuit could not see.
//
// Postgres-only by construction: the mem path dedupes on an in-flight promise
// it deletes in `finally`, so it has no persistent `prior` and never takes
// this branch. That is why every mem-mode unit test misses it.
test("Postgres adoption does not short-circuit past ledger-only signals",
  { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js");
  const production = await import("../lib/db/production.js");
  const pool = await db.getPool();
  const suffix = randomUUID();
  const device = `u-${randomUUID()}`;
  const account = `sb-${randomUUID()}`;
  const query = `pgshort-unknown-${suffix}`;

  t.after(async () => {
    await pool.query(
      `DELETE FROM unknown_query_votes WHERE query_id IN
         (SELECT id FROM unknown_queries WHERE normalized_query=$1)`, [query]);
    await pool.query("DELETE FROM unknown_queries WHERE normalized_query=$1", [query]);
    await pool.query(
      "DELETE FROM identity_adoptions WHERE from_user_id=ANY($1::text[]) OR to_user_id=ANY($1::text[])",
      [[device, account]]);
    for (const uid of [device, account]) await production.purgePersonalizationData(uid).catch(() => {});
  });

  // 1. A first, ordinary sign-in. This is what writes the identity_adoptions
  //    row that arms the short circuit.
  await db.saveProfile(device, { long: { MINIMAL: 0.4 }, session: {}, _meta: {} });
  await production.adoptAccountData(device, account);
  const prior = await pool.query(
    "SELECT 1 FROM identity_adoptions WHERE from_user_id=$1 AND to_user_id=$2", [device, account]);
  assert.equal(prior.rowCount, 1, "the prior adoption row exists");

  // 2. Signed out. A research-flagged search writes a vote and NOTHING else —
  //    no profile, no event, no search log, no interaction.
  await production.recordUnknownQuery(query, db.identityHash(device), "none");
  const linked = await pool.query(
    `SELECT (
       (SELECT count(*) FROM interactions WHERE user_id=$1) +
       (SELECT count(*) FROM user_events WHERE user_id=$1) +
       (SELECT count(*) FROM search_logs WHERE user_id=$1)
     )::int AS n`, [device]);
  assert.equal(linked.rows[0].n, 0, "the device really has no user_id-keyed signal");

  // 3. Sign back in. The short circuit must NOT fire.
  await production.adoptAccountData(device, account);

  const stranded = await pool.query(
    "SELECT count(*)::int n FROM unknown_query_votes WHERE identity_hash=$1",
    [db.identityHash(device)]);
  assert.equal(stranded.rows[0].n, 0, "the vote was rekeyed, not skipped");

  // And the tally is still honest: one human, one vote.
  const again = await production.recordUnknownQuery(query, db.identityHash(account), "none");
  assert.equal(again.distinctIdentities, 1, "one human is still one voter after signing back in");
});

test("Postgres enforces board, ticket, and adoption integrity", { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js");
  const production = await import("../lib/db/production.js");
  const suffix = randomUUID();
  const userId = `u-${suffix}`;
  const from = `u-${randomUUID()}`;
  const to = `sb-${randomUUID()}`;
  const itemA = { id: `item-a-${suffix}`, title: "A", tags: { MINIMAL: 0.8 }, price: 100 };
  const itemB = { id: `item-b-${suffix}`, title: "B", tags: { TAILORED: 0.8 }, price: 120 };
  const pool = await db.getPool();
  const userIds = [userId, from, to];
  const itemIds = [itemA.id, itemB.id];
  const factIds = [];
  const unknownQuery = `unknown-${suffix}`;

  t.after(async () => {
    try {
      await pool.query("BEGIN");
      await pool.query(
        "DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE user_id=ANY($1::text[]))",
        [userIds]
      );
      await pool.query("DELETE FROM boards WHERE user_id=ANY($1::text[])", [userIds]);
      await pool.query("DELETE FROM user_measurements WHERE user_id=ANY($1::text[])", [userIds]);
      for (const table of [
        "purchase_tickets", "user_events", "interactions", "processed_operations",
        "user_style_profiles", "user_follows", "asterisk_memory_preferences", "wardrobe_items", "user_rail_prefs", "profiles",
      ]) {
        await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`, [userIds]);
      }
      await pool.query(
        "DELETE FROM identity_adoptions WHERE from_user_id=ANY($1::text[]) OR to_user_id=ANY($1::text[])",
        [userIds]
      );
      await pool.query("DELETE FROM product_tags WHERE product_id=ANY($1::text[])", [itemIds]);
      await pool.query("DELETE FROM popularity WHERE item_id=ANY($1::text[])", [itemIds]);
      await pool.query("DELETE FROM edges WHERE a=ANY($1::text[]) OR b=ANY($1::text[])", [itemIds]);
      await pool.query("DELETE FROM items WHERE id=ANY($1::text[])", [itemIds]);
      await pool.query("DELETE FROM learned_facts WHERE id=ANY($1::text[])", [factIds]);
      await pool.query("DELETE FROM interpretation_feedback WHERE user_id=ANY($1::text[])", [userIds]);
      await pool.query("DELETE FROM unknown_queries WHERE normalized_query=$1", [unknownQuery]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await pool.end();
    }
  });

  await db.upsertItems([itemA, itemB]);
  await production.addProductTags(itemA.id, [
    { tag: "sharp", tagType: "mood", confidence: 0.1 },
  ]);
  await production.addProductTags(itemB.id, [
    { tag: "sharp", tagType: "mood", confidence: 0.9 },
    { tag: "sharp", tagType: "material", confidence: 0.9 },
  ]);
  const typedTop = await production.productsByTagsTyped(["sharp"], { limit: 1 });
  assert.deepEqual(Object.keys(typedTop), [itemB.id],
    "typed tag limit counts products, not product/type rows");
  assert.deepEqual(Object.keys(typedTop[itemB.id]).sort(), ["material", "mood"],
    "all score dimensions survive the product cap");

  // Inventory-representation predicate (PR 0A): the SQL count must mirror
  // isDiscoverableProduct — hidden, sold, and unavailable rows never count.
  const zzTag = `ZZPHASE0${suffix.replaceAll("-", "").toUpperCase().slice(0, 8)}`;
  const itemVis = { id: `item-vis-${suffix}`, title: "Vis", tags: { [zzTag]: 1 }, price: 90 };
  const itemSold = { id: `item-sold-${suffix}`, title: "Sold", tags: { [zzTag]: 1 }, price: 90, availability_status: "sold" };
  const itemHidden = { id: `item-hidden-${suffix}`, title: "Hidden", tags: { [zzTag]: 1 }, price: 90 };
  const itemOff = { id: `item-off-${suffix}`, title: "Off", tags: { [zzTag]: 1 }, price: 90, is_available: false };
  itemIds.push(itemVis.id, itemSold.id, itemHidden.id, itemOff.id);
  await db.upsertItems([itemVis, itemSold, itemHidden, itemOff]);
  await pool.query("UPDATE items SET moderation_status='hidden' WHERE id=$1", [itemHidden.id]);
  const products = await import("../lib/products.js");
  assert.equal(await products.countDiscoverableProductsByTags([zzTag]), 1,
    "sold, hidden, and unavailable rows must not inflate inventory confidence");

  // Dual-channel candidate retrieval (PR 0A slice 2): tag-only matches are
  // retrieved by summed evidence confidence, not starved by text recency,
  // and the result shape reports truncation.
  const retrieved = await db.searchItemCandidates("zz-no-text-match", ["sharp"]);
  assert.ok(Array.isArray(retrieved.rows) && typeof retrieved.truncated === "boolean",
    "retrieval returns { rows, truncated }");
  const tagIds = retrieved.rows.map((row) => row.id).filter((id) => itemIds.includes(id));
  assert.deepEqual(tagIds, [itemB.id, itemA.id],
    "tag channel orders by summed evidence confidence (B 1.8 > A 0.1)");
  const candidates = await db.searchItemCandidates("sharp", ["sharp"], 10);
  assert.ok(candidates.rows.some((item) => item.id === itemB.id));
  const save = (item) => db.commitBoardSave({
    userId, item,
    canonicalEvent: (boardId) => ({
      userId, type: "USER_ADDED_TO_MOOD_BOARD", payload: { boardId, itemId: item.id }, at: Date.now(),
    }),
    reduce(profile) {
      return { profile, edgePairs: [], popularity: [] };
    },
  });
  await Promise.all([save(itemA), save(itemB)]);
  const boards = await db.getBoards(userId);
  assert.equal(boards.length, 1);
  assert.equal(boards.filter((board) => board.isDefault).length, 1);
  assert.deepEqual(new Set(boards[0].items.map((item) => item.id)), new Set([itemA.id, itemB.id]));

  const ticket = await production.createTicket({
    userId, productId: itemA.id, sourceName: "ebay",
    sourceProductUrl: "https://www.ebay.com/itm/123", idempotencyKey: randomUUID(),
  });
  await production.updateTicket(ticket.id, { status: "awaiting_user_consent" });
  const consented = await production.transitionTicket(ticket.id, userId, "consent", {
    disclaimerVersion: "server-version",
  });
  assert.equal(consented.status, "checkout_started");
  assert.equal(await production.transitionTicket(ticket.id, userId, "consent", {
    disclaimerVersion: "forged-version",
  }), null);
  assert.equal(await production.transitionTicket(ticket.id, userId, "cancel"), null);
  const outcomeEvent = {
    userId, type: "USER_REPORTED_PURCHASE",
    payload: { ticketId: ticket.id, itemId: itemA.id }, at: Date.now(),
  };
  const outcome = await production.reportTicketOutcome(ticket.id, userId, "bought", outcomeEvent);
  assert.equal(outcome.ticket.userReportedOutcome, "bought");
  assert.equal(outcome.duplicate, false);
  assert.equal((await production.reportTicketOutcome(ticket.id, userId, "bought", outcomeEvent)).duplicate, true);

  await db.saveProfile(from, { long: { MINIMAL: 0.7 } });
  await production.saveUserMeasurements(from, {
    usualSize: "M", preferredUnit: "in",
    inches: { chest: 40, waist: 32, hips: 40, inseam: 31, height: 70 },
  });
  await production.recordInterpretationFeedback({
    userId: from, normalizedQuery: "rain", interpretationId: "1:exact:rain",
    contractVersion: 1, verdict: "not-meant",
  });
  const sourceBoard = await db.createBoard(from, "source board");
  await db.addBoardItem(sourceBoard.id, itemA);
  const [first, second] = await Promise.all([
    production.adoptAccountData(from, to),
    production.adoptAccountData(from, to),
  ]);
  assert.equal([first, second].filter((result) => result.duplicate).length, 1);
  assert.equal((await db.getBoards(to)).length, 1);
  assert.equal((await db.getBoards(from)).length, 0);
  assert.equal((await db.getProfile(to)).long.MINIMAL, 0.7);
  assert.equal((await production.getUserMeasurements(to)).chest, 40);
  assert.equal((await production.getUserMeasurements(from)).chest, "");
  assert.equal((await production.listInterpretationFeedback(from, "rain")).length, 0);
  assert.equal((await production.listInterpretationFeedback(to, "rain"))[0]?.verdict, "not-meant");

  const firstUnknown = await production.recordUnknownQuery(unknownQuery, `identity-${suffix}`, "none");
  assert.equal(firstUnknown.demandCount, 1, "the first persistent vote is counted exactly once");
  assert.equal(firstUnknown.distinctIdentities, 1);
  const duplicateUnknown = await production.recordUnknownQuery(unknownQuery, `identity-${suffix}`, "none");
  assert.equal(duplicateUnknown.demandCount, 1, "a repeated identity cannot inflate demand");

  const fact = await production.createLearnedFact({
    entityType: "test", entityId: suffix, claim: "concurrent review",
    claimType: "test", sourceUrls: ["https://example.com/fact"],
    verificationStatus: "discovered",
  });
  factIds.push(fact.id);
  const competingReviews = await Promise.all([
    production.updateLearnedFactStatus(fact.id, "pending_verification", null, "discovered"),
    production.updateLearnedFactStatus(fact.id, "rejected", "integration-test", "discovered"),
  ]);
  assert.equal(competingReviews.filter(Boolean).length, 1,
    "only one reviewer may advance the same fact version");

  await db.saveProfile(from, { long: { GORP: 0.5 } });
  await db.createBoard(from, "later source board");
  const later = await production.adoptAccountData(from, to);
  assert.equal(later.duplicate, false);
  assert.equal(later.movedBoards, 1);
  assert.equal((await db.getBoards(to)).length, 2);
  assert.ok((await db.getProfile(to)).long.GORP > 0);

  const schema = await pool.query(
    "SELECT max(version)::int AS version FROM app_schema_migrations"
  );
  assert.equal(schema.rows[0].version, committedSchemaVersion());

  // v18 brand cases: CAS transition + same-transaction ledger row.
  {
    const { validateOpenCase, validateTransition } = await import("../lib/brands/cases.js");
    let kase = await production.insertBrandCase(validateOpenCase({
      kind: "verification", brandName: `IT Brand ${suffix.slice(0, 8)}`, openedBy: "it-admin" }));
    try {
      kase = await production.applyBrandCaseTransition(kase.id, "open",
        validateTransition(kase, { to: "under_review", actor: "it-admin" }));
      await assert.rejects(
        () => production.applyBrandCaseTransition(kase.id, "open",
          { to: "archived", actor: "it-admin" }),
        /case-moved/, "stale expectedStatus must 409, not overwrite");
      const ledger = await production.listBrandCaseEvents(kase.id);
      assert.deepEqual(ledger.map((e) => e.toStatus), ["open", "under_review"]);
      assert.deepEqual((await production.listBrandCaseEvents(kase.id, 1)).map((e) => e.toStatus),
        ["under_review"], "a capped ledger returns the latest transition");
    } finally {
      await pool.query("DELETE FROM brand_cases WHERE id=$1", [kase.id]);
      const orphans = await pool.query(
        "SELECT count(*)::int AS n FROM brand_case_events WHERE case_id=$1", [kase.id]);
      assert.equal(orphans.rows[0].n, 0, "ledger cascades with the case");
    }
  }

  // v17 profile rooms: account-uuid domain (ADR-002), unique handles,
  // module cascade, purge coverage.
  const themeRegistry = await pool.query("SELECT count(*)::int AS n FROM profile_themes");
  assert.ok(themeRegistry.rows[0].n >= 5, "the five seed skins must exist");
  const accountA = randomUUID();
  const accountB = randomUUID();
  const roomHandle = `it-${suffix.slice(0, 12)}`;
  // profile_rooms carries an FK to auth.users wherever the auth schema
  // exists (Supabase, and CI's shim) — give the test accounts parent rows.
  const authUsersPresent = (await pool.query(
    "SELECT to_regclass('auth.users') IS NOT NULL AS present")).rows[0].present;
  if (authUsersPresent) {
    await pool.query(
      "INSERT INTO auth.users (id) VALUES ($1::uuid), ($2::uuid) ON CONFLICT DO NOTHING",
      [accountA, accountB]);
  }
  try {
    await assert.rejects(() => production.upsertProfileRoom(accountB, { published: true }),
      /handle-required/, "published rooms require a claimed handle");
    await production.upsertProfileRoom(accountA, { handle: roomHandle, themeId: "after-dark", published: true });
    await assert.rejects(() => production.upsertProfileRoom(accountB, { handle: roomHandle }),
      /handle-taken/, "handles must be unique across accounts");
    await production.setProfileModule(accountA, "statement", { content: { text: "integration words" } });
    await assert.rejects(() => production.setProfileModule(accountB, "statement", { content: { text: "x" } }),
      /room-required/, "modules require the room row");
    const storedRoom = await production.getProfileRoomByHandle(roomHandle);
    assert.equal(storedRoom.accountId, accountA);
    assert.equal(storedRoom.themeId, "after-dark");
    await production.purgePersonalizationData("sb-" + accountA);
    assert.equal(await production.getProfileRoom(accountA), null, "purge erases the room");
    const orphanModules = await pool.query(
      "SELECT count(*)::int AS n FROM profile_modules WHERE account_id=$1::uuid", [accountA]);
    assert.equal(orphanModules.rows[0].n, 0, "modules cascade with the room");
  } finally {
    await pool.query("DELETE FROM profile_rooms WHERE account_id=ANY($1::uuid[])", [[accountA, accountB]]);
    if (authUsersPresent) {
      await pool.query("DELETE FROM auth.users WHERE id=ANY($1::uuid[])", [[accountA, accountB]]);
    }
  }

  const railRegistry = await pool.query("SELECT count(*)::int AS n FROM discover_rails");
  assert.ok(railRegistry.rows[0].n >= 4, "the four seed rails must exist");
  const railBefore = (await production.listDiscoverRails()).find((r) => r.id === "screen");
  const railUpdated = await production.updateDiscoverRail("screen", { position: railBefore.position + 1 });
  assert.equal(railUpdated.position, railBefore.position + 1, "registry update roundtrips");
  await production.updateDiscoverRail("screen", { position: railBefore.position });
  assert.equal(await production.updateDiscoverRail("no-such-rail", { enabled: false }), null);
  const railPref = await production.setRailPref(from, "screen", { collapsed: true });
  assert.equal(railPref.collapsed, true);
  await production.setRailPref(to, "screen", { collapsed: false });
  const railAdoption = await production.adoptAccountData(from, to);
  assert.equal(railAdoption.duplicate, false);
  assert.equal((await production.getRailPrefs(to)).screen.collapsed, false,
    "account-side rail pref wins on adoption");
  assert.deepEqual(await production.getRailPrefs(from), {});

  const memorySecurity = await pool.query(`
    SELECT c.relname,
      c.relrowsecurity AS rls,
      has_table_privilege('asilum_app', c.oid, 'SELECT') AS app_select,
      has_table_privilege('asilum_app', c.oid, 'INSERT') AS app_insert,
      has_table_privilege('asilum_app', c.oid, 'UPDATE') AS app_update,
      has_table_privilege('asilum_app', c.oid, 'DELETE') AS app_delete,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner)))
        WHERE grantee=0 AND privilege_type='SELECT') AS public_read
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('asterisk_memory_preferences', 'user_follows', 'wardrobe_items', 'discover_rails', 'user_rail_prefs',
                        'profile_themes', 'profile_rooms', 'profile_modules', 'brand_cases', 'brand_case_events')
    ORDER BY c.relname`);
  assert.equal(memorySecurity.rows.length, 10);
  for (const row of memorySecurity.rows) {
    assert.equal(row.rls, true, `${row.relname} must have RLS enabled`);
    assert.equal(row.app_select, true, `asilum_app must read ${row.relname}`);
    assert.equal(row.public_read, false, `${row.relname} must not be publicly readable`);
    if (row.relname === "brand_cases") {
      assert.equal(row.app_insert, true);
      assert.equal(row.app_update, true);
      assert.equal(row.app_delete, false, "case records are retained operational evidence");
    } else if (row.relname === "brand_case_events") {
      assert.equal(row.app_insert, true);
      assert.equal(row.app_update, false, "the transition ledger is append-only");
      assert.equal(row.app_delete, false, "the transition ledger is append-only");
    }
  }

  await production.setFollow(from, "brand", "Integration Brand", true);
  await production.setFollow(to, "brand", "Integration Brand", true);
  await production.setFollow(from, "user", "@integration", true);
  await production.saveMemoryPreferences(from, { hiddenSections: ["global"], guidanceEnabled: false });
  await production.saveMemoryPreferences(to, { hiddenSections: ["inferred"], guidanceEnabled: true });
  const memoryAdoption = await production.adoptAccountData(from, to);
  assert.equal(memoryAdoption.duplicate, false);
  assert.equal((await production.listFollows(from)).length, 0);
  const adoptedFollows = await production.listFollows(to);
  assert.equal(adoptedFollows.filter((f) => f.target === "Integration Brand").length, 1,
    "duplicate follows must not double on adoption");
  assert.equal(adoptedFollows.filter((f) => f.target === "@integration").length, 1);
  assert.deepEqual((await production.getMemoryPreferences(to)).hiddenSections, ["inferred"],
    "account-side preferences win on adoption");
  assert.equal((await production.getMemoryPreferences(to)).guidanceEnabled, true,
    "account-side guidance preference wins on adoption");
  assert.deepEqual((await production.getMemoryPreferences(from)).hiddenSections, []);

  let activePhotoOps = 0;
  let peakPhotoOps = 0;
  await Promise.all([1, 2, 3].map(() => production.withUserOperationLock(from, async () => {
    activePhotoOps++;
    peakPhotoOps = Math.max(peakPhotoOps, activePhotoOps);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activePhotoOps--;
  })));
  assert.equal(peakPhotoOps, 1, "persistent owner-operation locks serialize Storage/erasure work");

  const longCatalogRef = `catalog:${"x".repeat(80)}`;
  const wardrobeAdd = await production.createWardrobeItem({
    userId: from, source: "manual", sourceRef: null, catalogItemId: null,
    title: "integration overcoat", brand: null, category: "outerwear",
    sizeLabel: null, colors: [], tags: { MINIMAL: 0.5 }, acquiredAt: null,
  });
  assert.equal(wardrobeAdd.duplicate, false);
  for (const owner of [from, to]) {
    const catalogAdd = await production.createWardrobeItem({
      userId: owner, source: "catalog", sourceRef: longCatalogRef, catalogItemId: null,
      title: "integration duplicate", brand: null, category: "tops",
      sizeLabel: null, colors: [], tags: {}, acquiredAt: null,
    });
    assert.equal(catalogAdd.duplicate, false);
  }
  const wardrobeAdoptions = await Promise.all([
    production.adoptAccountData(from, to),
    production.adoptAccountData(from, to),
  ]);
  assert.equal(wardrobeAdoptions.filter((result) => result.duplicate).length, 1,
    "identity locks make concurrent wardrobe adoption idempotent");
  assert.equal((await production.listWardrobeItems(from, { status: "all" })).length, 0);
  const ownedByAccount = await production.listWardrobeItems(to, { status: "all" });
  assert.equal(ownedByAccount.filter((piece) => piece.title === "integration overcoat").length, 1);
  assert.equal(ownedByAccount.filter((piece) => piece.sourceRef === longCatalogRef).length, 1,
    "namespaced 80-character catalog ids fit and dedupe during adoption");

  const measurementSecurity = await pool.query(`
    SELECT c.relrowsecurity AS rls,
      has_table_privilege('asilum_app', 'public.user_measurements', 'SELECT,INSERT,UPDATE,DELETE') AS app_access,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner)))
        WHERE grantee=0 AND privilege_type='SELECT') AS public_read
    FROM pg_class AS c
    WHERE c.oid='public.user_measurements'::regclass
  `);
  assert.equal(measurementSecurity.rows[0].rls, true);
  assert.equal(measurementSecurity.rows[0].app_access, true);
  assert.equal(measurementSecurity.rows[0].public_read, false);

  const interpretationSecurity = await pool.query(`
    SELECT c.relname, c.relrowsecurity AS rls,
      has_table_privilege('asilum_app', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS app_access,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner)))
        WHERE grantee=0 AND privilege_type='SELECT') AS public_read
    FROM pg_class AS c
    WHERE c.oid IN (
      'public.unknown_queries'::regclass,
      'public.unknown_query_votes'::regclass,
      'public.interpretation_feedback'::regclass
    )
    ORDER BY c.relname
  `);
  assert.equal(interpretationSecurity.rows.length, 3);
  for (const row of interpretationSecurity.rows) {
    assert.equal(row.rls, true, `${row.relname} must have RLS enabled`);
    assert.equal(row.app_access, true, `${row.relname} must be reachable by asilum_app`);
    assert.equal(row.public_read, false, `${row.relname} must not be publicly readable`);
  }

  const defaults = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_default_acl AS defaults,
        LATERAL aclexplode(defaults.defaclacl) AS privilege
      WHERE defaults.defaclnamespace='public'::regnamespace
        AND defaults.defaclobjtype='f'
        AND privilege.grantee=0
        AND privilege.privilege_type='EXECUTE'
    ) AS public_function_execute
  `);
  assert.equal(defaults.rows[0].public_function_execute, false);
});

// v22 — gamma edge corroboration. The mem path is unit-tested in
// tests/graph-corroboration.test.js; this is the Postgres half, because a
// ledger that existed on only one path would leave every preview deploy and
// local dev running the ungated rule while reporting success.
test("Postgres edge corroboration: one identity contributes once", { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  // Fresh module instance: the test above ends the shared pool in its
  // cleanup, and a second test reusing it dies with "Cannot use a pool after
  // calling end on the pool".
  const db = await import("../lib/db/index.js?corroboration=1");
  const pool = await db.getPool();
  const suffix = randomUUID();
  const A = `pgcorr-a-${suffix}`;
  const B = `pgcorr-b-${suffix}`;
  const lo = A < B ? A : B, hi = A < B ? B : A;
  t.after(async () => {
    await pool.query("DELETE FROM edge_contributors WHERE a=ANY($1::text[]) OR b=ANY($1::text[])", [[A, B]]);
    await pool.query("DELETE FROM edges WHERE a=ANY($1::text[]) OR b=ANY($1::text[])", [[A, B]]);
  });

  // The attack: one identity, the same pair, 25 times.
  for (let i = 0; i < 25; i++) await db.bumpEdges([{ a: A, b: B, w: 2 }], "pg-attacker");
  let row = (await pool.query("SELECT w,contributors FROM edges WHERE a=$1 AND b=$2", [lo, hi])).rows[0];
  assert.equal(row.contributors, 1, "25 forged engagements must remain ONE contributor");
  assert.equal(Number(row.w), 2, "w is that contributor's BEST action, never a sum");

  for (const who of ["pg-2", "pg-3"]) await db.bumpEdges([{ a: A, b: B, w: 1 }], who);
  row = (await pool.query("SELECT w,contributors FROM edges WHERE a=$1 AND b=$2", [lo, hi])).rows[0];
  assert.equal(row.contributors, 3, "distinct people accumulate");
  assert.equal(Number(row.w), 4, "sum of per-contributor bests (2 + 1 + 1)");

  const edges = await db.getEdges([A]);
  assert.equal(edges[A][B], 3, "getEdges reports the distinct-contributor count");
});

// The path that broke production: writeEdges called with a transaction CLIENT
// rather than a pool. A pooled client also exposes .connect(), so a naive
// pool check called connect() on it and every /api/interaction 500'd. The unit
// suite runs mem-mode and the test above uses the POOL path, so neither could
// see it — this drives the real commit transaction.
test("Postgres edge corroboration through commitInteractionBatch", { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js?corroboration-txn=1");
  const { learn } = await import("../lib/brain/index.js");
  const pool = await db.getPool();
  const suffix = randomUUID();
  const userId = `u-txn-${suffix}`;
  const anchor = `txn-anchor-${suffix}`;
  const item = { id: `txn-item-${suffix}`, tags: { MINIMAL: 0.7 }, brand: "X" };
  t.after(async () => {
    for (const table of ["user_events", "interactions", "processed_operations", "profiles"]) {
      await pool.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId]);
    }
    await pool.query("DELETE FROM edge_contributors WHERE identity_hash=$1", [db.identityHash(userId)]);
    await pool.query("DELETE FROM edges WHERE a=ANY($1::text[]) OR b=ANY($1::text[])", [[anchor, item.id]]);
  });

  const commit = async (op) => db.commitInteractionBatch({
    userId, operationId: op,
    events: [{ itemId: item.id, action: "bag", dwellMs: null,
      canonicalEvent: { userId, type: "USER_ADDED_TO_BAG", payload: { itemId: item.id }, at: Date.now(), v: 1 } }],
    reduce: (cur) => ({
      profile: learn(cur || {}, item, "bag"),
      edgePairs: [{ a: anchor, b: item.id, w: 2 }],
      popularity: [{ id: item.id, eng: 1 }],
    }),
  });

  await commit(null);
  await commit(null);
  await commit(null);
  const lo = anchor < item.id ? anchor : item.id;
  const hi = anchor < item.id ? item.id : anchor;
  const row = (await pool.query("SELECT w,contributors FROM edges WHERE a=$1 AND b=$2", [lo, hi])).rows[0];
  assert.ok(row, "the in-transaction write must actually land");
  assert.equal(row.contributors, 1, "three commits by one identity remain one contributor");
});

// The popularity write path had NO Postgres coverage until now, and it is the
// one place a ranking-critical SQL statement reached production untested: the
// v25 decayed-aggregate recompute runs INSIDE the interaction transaction, so
// a syntax or type error there would 500 every /api/interaction. The unit
// suite exercises only mem mode, which computes the same quantity in
// JavaScript and therefore cannot see a broken query.
//
// This is the same class of gap that once broke production through
// writeEdges — covered by the two tests above only after it shipped.
test("Postgres popularity: people counted once, evidence ages, erasure recomputes",
  { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js?popularity=1");
  // production.js imports "./index.js" WITHOUT a query string, so its module
  // graph points at the instance whose pool the first test in this file ends
  // (getPool caches, and an ended pool stays ended). Every call below therefore
  // injects THIS test's live pool via queryTarget rather than letting the
  // erasure path reach for a dead one.
  const production = await import("../lib/db/production.js?popularity=1");
  const { halfLifeMs } = await import("../lib/brain/popularity.js");
  const pool = await db.getPool();
  const suffix = randomUUID();
  const item = `pgpop-item-${suffix}`;
  const people = [1, 2, 3, 4].map((n) => `pgpop-u${n}-${suffix}`);
  const HALF_SECONDS = Math.round(halfLifeMs() / 1000);
  const row = async () => (await pool.query(
    "SELECT engagers,viewers,engagers_decayed,viewers_decayed,decayed_at FROM popularity WHERE item_id=$1",
    [item]
  )).rows[0];

  t.after(async () => {
    await pool.query("DELETE FROM popularity_contributors WHERE item_id=$1", [item]);
    await pool.query("DELETE FROM popularity WHERE item_id=$1", [item]);
    for (const table of ["user_events", "interactions", "processed_operations", "profiles"]) {
      await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`, [people]);
    }
    await pool.end();
  });

  // ---- the counting rule, through real SQL ---------------------------------
  for (let i = 0; i < 12; i++) await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], people[0]);
  let r = await row();
  assert.equal(r.engagers, 1, "twelve forged engagements from one identity remain ONE engager");
  assert.equal(r.viewers, 1);

  for (const who of people.slice(1)) await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], who);
  r = await row();
  assert.equal(r.engagers, 4, "distinct people accumulate");
  assert.equal(r.viewers, 4);

  // ---- v25: the decayed aggregate the mem path cannot validate -------------
  assert.ok(r.decayed_at, "the recompute must stamp decayed_at");
  assert.ok(Math.abs(Number(r.engagers_decayed) - 4) < 1e-4,
    `fresh evidence is worth a whole person each: ${r.engagers_decayed}`);
  assert.ok(Math.abs(Number(r.viewers_decayed) - 4) < 1e-4);

  // Age every contributor by exactly ONE half-life, then force a recompute
  // that changes no counts (a repeat from a known identity). This is the
  // assertion that actually exercises power(0.5, epoch/half_life) against a
  // real interval — the arithmetic no other test in the repo runs on Postgres.
  await pool.query(
    "UPDATE popularity_contributors SET first_seen = now() - make_interval(secs => $2) WHERE item_id=$1",
    [item, HALF_SECONDS]
  );
  await db.bumpPopularity([{ id: item, eng: 1, imp: 1 }], people[0]);
  r = await row();
  assert.equal(r.engagers, 4, "ageing changes what evidence is WORTH, never who is counted");
  assert.ok(Math.abs(Number(r.engagers_decayed) - 2) < 0.02,
    `four people at one half-life must weigh ~2.0, got ${r.engagers_decayed}`);
  assert.ok(Number(r.engagers_decayed) <= r.engagers + 1e-6, "decayed can never exceed lifetime");

  // ---- materialize-then-carry, through the real reader ---------------------
  // Backdate the stamp rather than the ledger: this is the OTHER half of the
  // arithmetic — the read-time factor getPopularity applies to a sum that was
  // materialized in the past.
  const storedAt = Number((await row()).engagers_decayed);
  await pool.query(
    "UPDATE popularity SET decayed_at = now() - make_interval(secs => $2) WHERE item_id=$1",
    [item, HALF_SECONDS]
  );
  const snapshot = await db.getPopularity(5000);
  assert.ok(snapshot[item], "the item must appear in the popularity snapshot");
  assert.ok(Math.abs(snapshot[item].engagersDecayed - storedAt / 2) < 0.02,
    `a sum materialized one half-life ago must read at half: ${snapshot[item].engagersDecayed} vs ${storedAt / 2}`);
  assert.equal(snapshot[item].engagers, 4, "lifetime counts are carried through unaged");

  // ---- erasure recomputes the DECAYED columns too --------------------------
  // The bug this catches: an erasure that updated only engagers/viewers would
  // leave a departed person's recency-weighted contribution scoring forever.
  // queryTarget is used as the CLIENT, not as a pool to connect from — the
  // function runs BEGIN/COMMIT on it directly. Handing it a Pool would scatter
  // those across different connections and leave a dangling transaction, so
  // this checks out one dedicated client and releases it here (ownsClient is
  // false when queryTarget is supplied, so the function will not release it).
  const purgeClient = await pool.connect();
  try {
    await production.purgePersonalizationData(people[0], { queryTarget: purgeClient });
  } finally {
    purgeClient.release();
  }
  r = await row();
  assert.equal(r.engagers, 3, "a departed person stops being an engager");
  assert.equal(r.viewers, 3);
  assert.ok(Math.abs(Number(r.engagers_decayed) - 1.5) < 0.02,
    `and stops being counted in the WEIGHTED total too: ${r.engagers_decayed} (three people at one half-life = 1.5)`);
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM popularity_contributors WHERE item_id=$1", [item])).rows[0].n,
    3, "the ledger row is gone, not merely ignored");
});

// The transaction path, for the same reason the edge version of this test
// exists: /api/interaction writes popularity inside commitInteractionBatch,
// against a transaction CLIENT rather than the pool. A statement that works on
// the pool and fails on the client 500s every interaction, and nothing else in
// the suite would notice.
test("Postgres popularity through commitInteractionBatch", { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js?popularity-txn=1");
  const pool = await db.getPool();
  const suffix = randomUUID();
  const userId = `pgpoptxn-u-${suffix}`;
  const item = `pgpoptxn-item-${suffix}`;

  t.after(async () => {
    await pool.query("DELETE FROM popularity_contributors WHERE item_id=$1", [item]);
    await pool.query("DELETE FROM popularity WHERE item_id=$1", [item]);
    for (const table of ["user_events", "interactions", "processed_operations", "profiles"]) {
      await pool.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId]);
    }
    await pool.end();
  });

  const result = await db.commitInteractionBatch({
    userId,
    operationId: randomUUID(),
    events: [{
      itemId: item, action: "favorite", dwellMs: null,
      canonicalEvent: { userId, type: "USER_FAVORITED_ITEM", payload: { itemId: item }, at: Date.now(), v: 1 },
    }],
    reduce: () => ({ profile: { long: { MINIMAL: 0.4 }, session: {}, _meta: {} }, edgePairs: [], popularity: [{ id: item, eng: 1 }] }),
  });
  assert.equal(result.duplicate, false);

  const r = (await pool.query(
    "SELECT engagers,engagers_decayed,decayed_at FROM popularity WHERE item_id=$1", [item])).rows[0];
  assert.ok(r, "the transaction must have written a popularity row");
  assert.equal(r.engagers, 1, "the identity ledger is written inside the transaction");
  assert.ok(r.decayed_at, "and the v25 recompute runs there too — this is the statement that had never executed on Postgres");
  assert.ok(Math.abs(Number(r.engagers_decayed) - 1) < 1e-4, "one fresh person weighs 1.0");
});