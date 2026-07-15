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

  t.after(async () => {
    try {
      await pool.query("BEGIN");
      await pool.query(
        "DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE user_id=ANY($1::text[]))",
        [userIds]
      );
      await pool.query("DELETE FROM boards WHERE user_id=ANY($1::text[])", [userIds]);
      for (const table of [
        "purchase_tickets", "user_events", "interactions", "processed_operations",
        "user_style_profiles", "profiles",
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
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await pool.end();
    }
  });

  await db.upsertItems([itemA, itemB]);
  await production.addProductTags(itemB.id, [{ tag: "sharp", tagType: "mood", confidence: 0.9 }]);
  const candidates = await db.searchItemCandidates("sharp", ["sharp"], 10);
  assert.ok(candidates.some((item) => item.id === itemB.id));
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
  assert.equal(schema.rows[0].version, 11);

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
