import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { requestSubject, verifiedRequestSubject } from "../lib/security/request.js";
import {
  addBoardItem, commitBoardSave, createBoard, getBoards, getInteractions,
  getProfile, listEvents, recordEvent, recordInteraction, saveProfile,
} from "../lib/db/index.js";
import {
  adoptAccountData, createTicket, transitionTicket, updateTicket,
} from "../lib/db/production.js";

test("public quota subjects ignore forgeable forwarding headers", () => {
  const request = {
    headers: new Headers({
      "cf-connecting-ip": "198.51.100.7",
      "x-forwarded-for": "203.0.113.9",
      "user-agent": "rotating-agent",
    }),
    cookies: { get: () => null },
  };
  assert.equal(verifiedRequestSubject(request), null);
  assert.equal(requestSubject(request), "unverified-public");
});

test("concurrent first saves share one default board", async () => {
  const userId = `u-${randomUUID()}`;
  const items = [
    { id: `a-${randomUUID()}`, title: "A", tags: { MINIMAL: 0.8 } },
    { id: `b-${randomUUID()}`, title: "B", tags: { TAILORED: 0.8 } },
  ];
  await Promise.all(items.map((item) => commitBoardSave({
    userId, item,
    canonicalEvent: (boardId) => ({
      userId, type: "USER_ADDED_TO_MOOD_BOARD", payload: { boardId, itemId: item.id },
    }),
    reduce(profile) { return { profile, edgePairs: [], popularity: [] }; },
  })));
  const boards = await getBoards(userId);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].isDefault, true);
  assert.deepEqual(new Set(boards[0].items.map((item) => item.id)), new Set(items.map((item) => item.id)));
});

test("ticket transitions cannot revive or rewrite a terminal flow", async () => {
  const userId = `u-${randomUUID()}`;
  const ticket = await createTicket({
    userId, productId: `item-${randomUUID()}`, sourceName: "ebay",
    sourceProductUrl: "https://www.ebay.com/itm/123", idempotencyKey: randomUUID(),
  });
  await updateTicket(ticket.id, { status: "awaiting_user_consent" });
  const consented = await transitionTicket(ticket.id, userId, "consent", {
    disclaimerVersion: "server-version",
  });
  assert.equal(consented.status, "checkout_started");
  assert.equal(consented.disclaimerVersion, "server-version");
  assert.equal(await transitionTicket(ticket.id, userId, "consent", {
    disclaimerVersion: "forged-version",
  }), null);
  assert.equal(await transitionTicket(ticket.id, userId, "cancel"), null);
});

test("account adoption moves boards, merges taste, and accepts later device data", async () => {
  const from = `u-${randomUUID()}`;
  const to = `sb-${randomUUID()}`;
  const item = { id: `item-${randomUUID()}`, title: "Saved", tags: { MINIMAL: 1 } };
  await saveProfile(from, { long: { MINIMAL: 0.8 }, session: {}, _meta: {} });
  await saveProfile(to, { long: { TAILORED: 0.6 }, session: {}, _meta: {} });
  const sourceBoard = await createBoard(from, "device board");
  await addBoardItem(sourceBoard.id, item);
  await createBoard(to, "account board");
  await recordInteraction(from, item.id, "favorite");
  await recordEvent({ userId: from, type: "USER_FAVORITED_ITEM", payload: { itemId: item.id } });

  const [first, retry] = await Promise.all([adoptAccountData(from, to), adoptAccountData(from, to)]);
  assert.equal([first, retry].filter((result) => result.duplicate).length, 1);
  assert.equal((await getBoards(from)).length, 0);
  const targetBoards = await getBoards(to);
  assert.equal(targetBoards.length, 2);
  assert.equal(targetBoards.filter((board) => board.isDefault).length, 1);
  const merged = await getProfile(to);
  assert.ok(merged.long.MINIMAL > 0);
  assert.ok(merged.long.TAILORED > 0);
  assert.equal((await getInteractions(from)).length, 0);
  assert.equal((await getInteractions(to)).length, 1);
  assert.equal((await listEvents(from)).length, 0);
  assert.equal((await listEvents(to)).length, 1);

  await saveProfile(from, { long: { GORP: 0.7 }, session: {}, _meta: {} });
  await createBoard(from, "later device board");
  const later = await adoptAccountData(from, to);
  assert.equal(later.duplicate, false);
  assert.equal(later.movedBoards, 1);
  assert.equal((await getBoards(to)).length, 3);
  assert.ok((await getProfile(to)).long.GORP > 0);
});

test("one device cannot be adopted into two accounts concurrently", async () => {
  const from = `u-${randomUUID()}`;
  const targets = [`sb-${randomUUID()}`, `sb-${randomUUID()}`];
  await saveProfile(from, { long: { MINIMAL: 0.9 }, session: {}, _meta: {} });
  await createBoard(from, "single-owner board");

  const results = await Promise.all(targets.map((target) => adoptAccountData(from, target)));
  assert.equal(results.reduce((sum, result) => sum + result.movedBoards, 0), 1);
  assert.equal((await getBoards(from)).length, 0);
  assert.equal(
    (await Promise.all(targets.map((target) => getBoards(target))))
      .reduce((sum, boards) => sum + boards.length, 0),
    1
  );
  const copiedProfiles = await Promise.all(targets.map((target) => getProfile(target)));
  assert.equal(copiedProfiles.filter((profile) => profile.long?.MINIMAL === 0.9).length, 1);
});
