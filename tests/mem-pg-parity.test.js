// tests/mem-pg-parity.test.js — the audit's law 4, made executable.
//
// "mem and Postgres are one system with two implementations, and mem is
// the one being exercised." (HANDOVER-2026-08-08.) Preview deploys, local
// dev, and 520 of 532 tests run mem, so a divergence ships green. These
// pin the two divergences confirmed by the Aug 14 verification pass, in
// the backend that would otherwise hide them.
//
// Both tests fail against the code as it stood before the fix — checked
// by reverting each fix and watching them go red (law 2).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createTicket, updateTicket, transitionTicket, listTickets, getTicket,
} from "../lib/db/production.js";
import { normalizeWardrobeAdd } from "../lib/wardrobe/index.js";

const USER = "u-parity-1111-4111-8111-111111111111";

test("mem tickets expose `consented`, exactly as ticketRow derives it on Postgres", async () => {
  const created = await createTicket({
    userId: USER, productId: "p-parity-1", sourceName: "ASILUM Vault",
    sourceProductUrl: "https://example.com/p", itemPriceAtRequest: 100,
  });
  // The key must EXIST and be false before consent — undefined would read
  // as false at the call site while meaning "this backend has no idea".
  assert.equal("consented" in created, true, "the key exists on creation");
  assert.equal(created.consented, false);

  await updateTicket(created.id, { status: "awaiting_user_consent" });
  const consented = await transitionTicket(created.id, USER, "consent", {
    disclaimerVersion: "v1-2026-07",
  });
  assert.ok(consented, "the consent transition is legal from awaiting_user_consent");
  assert.equal(consented.consented, true, "transition result reports consent");

  // /orders reads `t.consented` off the LIST, which is the path that was
  // silently blank on mem.
  const listed = (await listTickets(USER)).find((t) => t.id === created.id);
  assert.equal(listed.consented, true, "the list a reader sees says consent is on file");
  assert.equal((await getTicket(created.id)).consented, true, "and so does the single read");
});

// NOTE — where the OTHER confirmed divergence is tested, and why not here.
// A non-numeric ticketId (purchase_tickets.id is BIGSERIAL) used to raise
// Postgres 22P02 → 500 while mem answered a clean 400. A mem test cannot
// catch that: mem's Number("abc") → NaN misses either way, so the
// assertion passes with the fix AND without it — the exact anti-pattern
// law 2 names ("a test asserting the benign case passes against the
// bug"). I wrote it here first, reverted the fix, watched it stay green,
// and moved it to tests/postgres-integration.test.js, where the
// unguarded query really does raise and the guard really can fail.
