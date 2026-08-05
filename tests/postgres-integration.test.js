import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TEST_DATABASE_URL || "";

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
  assert.equal(schema.rows[0].version, 22);

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
  const db = await import("../lib/db/index.js");
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
