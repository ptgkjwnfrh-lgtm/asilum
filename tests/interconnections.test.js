// Interconnections (19 Sep 2026, second round).
//
// Law 1: a purchase teaches the brain — from the server's own records only,
//        once per record, under consent, with the ad firewall intact; the
//        client cannot claim one through /api/interaction.
// Law 2: the reader's fit hints reach search and discover results when the
//        search is personalised — the same reading the feed serves.
// Law 3: the memory and the taste network name the designers a reader's
//        saved pieces credit, tied to the career registry.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { learnFromPurchase, PURCHASE_ACTION } from "../lib/brain/purchase.js";
import { getProfile, saveProfile, createBoard, addBoardItem, getInteractions, listEvents } from "../lib/db/index.js";
import { getMemoryPreferences, saveMemoryPreferences } from "../lib/db/production.js";
import { weightedEventTypes } from "../lib/brain/tuning.js";
import { EVENTS } from "../lib/events/index.js";
import { recordCorrection } from "../lib/asterisk/explain.js";
import { asteriskMemory, creditedDesigners } from "../lib/asterisk/memory.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { callRoute, loadRoute, newDevice } from "./helpers/route.js";

const piece = CATALOG.find((it) => it.tags && Object.keys(it.tags).length && it.brand);
const topTag = Object.entries(piece.tags).sort((a, b) => b[1] - a[1])[0][0];

test("law 1: a reported purchase teaches once, with the event on record, and a repeat learns nothing", async () => {
  const me = newDevice();
  const first = await learnFromPurchase({ userId: me.uid, itemId: piece.id, kind: "reported", ref: "ticket-1", consent: "observe" });
  assert.equal(first.learned, true, JSON.stringify(first));
  const profile = await getProfile(me.uid);
  assert.ok((profile.long?.[topTag] || 0) > 0, `the piece's strongest tag rose: ${JSON.stringify(profile.long)}`);
  const interactions = await getInteractions(me.uid, { limit: 10 });
  assert.equal(interactions[0].action, PURCHASE_ACTION);
  const events = await listEvents(me.uid, 10);
  const evt = events.find((e) => e.type === EVENTS.USER_REPORTED_PURCHASE);
  assert.ok(evt, "the canonical event is written");
  assert.equal(evt.payload.ref, "ticket-1");
  assert.equal(evt.payload.learned, true);
  const again = await learnFromPurchase({ userId: me.uid, itemId: piece.id, kind: "reported", ref: "ticket-1", consent: "observe" });
  assert.equal(again.learned, false);
  assert.equal(again.duplicate, true, "the same ticket cannot teach twice");
  assert.equal((await getProfile(me.uid)).long[topTag], profile.long[topTag], "the weight did not move on the repeat");
});

test("law 1: consent and standing choices gate what the server may learn", async () => {
  const unanswered = newDevice();
  const refused = await learnFromPurchase({ userId: unanswered.uid, itemId: piece.id, kind: "reported", ref: "ticket-2", consent: "unanswered" });
  assert.equal(refused.learned, false);
  assert.match(refused.reason, /consent/);
  // a webhook has no request: a reader the terminal has never learned from is not learned from now
  const stranger = newDevice();
  const cold = await learnFromPurchase({ userId: stranger.uid, itemId: piece.id, kind: "paid", ref: "ord_cold" });
  assert.equal(cold.learned, false);
  assert.match(cold.reason, /no profile/);
  // a reader with a profile and guidance on is learned from; guidance off is not
  const known = newDevice();
  await saveProfile(known.uid, { long: { MINIMAL: 0.4 }, session: {}, _meta: {} });
  const warm = await learnFromPurchase({ userId: known.uid, itemId: piece.id, kind: "paid", ref: "ord_warm" });
  assert.equal(warm.learned, true, JSON.stringify(warm));
  assert.ok((await listEvents(known.uid, 10)).some((e) => e.type === EVENTS.USER_COMPLETED_PURCHASE));
  await saveMemoryPreferences(known.uid, { guidanceEnabled: false });
  assert.equal((await getMemoryPreferences(known.uid)).guidanceEnabled, false);
  const off = await learnFromPurchase({ userId: known.uid, itemId: piece.id, kind: "paid", ref: "ord_off" });
  assert.equal(off.learned, false);
  assert.match(off.reason, /guidance/);
  const unknownItem = await learnFromPurchase({ userId: known.uid, itemId: "no-such-piece", kind: "reported", ref: "ticket-3", consent: "observe" });
  assert.equal(unknownItem.learned, false);
});

test("law 1: the purchase events carry tuning weight above a bag; the client still cannot claim a purchase", async () => {
  const weighted = weightedEventTypes();
  assert.ok(weighted.includes(EVENTS.USER_COMPLETED_PURCHASE));
  assert.ok(weighted.includes(EVENTS.USER_REPORTED_PURCHASE));
  const route = await loadRoute("app/api/interaction/route.js");
  const me = newDevice();
  const res = await callRoute(route.POST, { path: "/api/interaction", cookies: me.cookies, json: { user: me.uid, item: { id: piece.id }, action: "purchase" } });
  assert.equal(res.status, 400, "a client-claimed purchase is refused");
  const orders = fs.readFileSync(new URL("../lib/orders.js", import.meta.url), "utf8");
  assert.match(orders, /teachFromPaidSale\(order\)/);
  assert.match(orders, /\(order\.kind \|\| "sale"\) !== "sale"/, "a ticket-fee order is not a purchase of a piece");
  const tickets = fs.readFileSync(new URL("../app/api/tickets/route.js", import.meta.url), "utf8");
  assert.match(tickets, /outcome === "bought" \|\| outcome === "kept"/);
  assert.match(tickets, /consent: consentState\(req\)/);
});

test("law 2: a personalised search and discover read sizes through the reader's fit hints", async () => {
  const me = newDevice();
  const sized = CATALOG.find((it) => it.size && typeof it.size === "object" && it.size.fitsLikeUS === "M" && it.brand && it.category && it.title);
  await recordCorrection(me.uid, { productId: sized.id, code: "too-small" });
  const word = sized.title.toLowerCase().split(/[^a-z]+/).find((w) => w.length >= 5) || sized.brand.toLowerCase();
  const discover = await loadRoute("app/api/discover/route.js");
  const personal = await callRoute(discover.GET, { path: "/api/discover", cookies: me.cookies, query: { q: sized.brand.toLowerCase(), brain: "1", user: me.uid, limit: "96" } });
  assert.equal(personal.status, 200, JSON.stringify(personal.body).slice(0, 200));
  const mine = personal.body.items.find((it) => it.id === sized.id);
  assert.ok(mine, "the corrected piece is on the rack");
  assert.equal(mine.size.fitsLikeUS, "S", "read one size smaller for this reader");
  assert.equal(mine.size.hint.direction, "runs-small");
  const anonymous = await callRoute(discover.GET, { path: "/api/discover", query: { q: sized.brand.toLowerCase(), limit: "96" } });
  const theirs = anonymous.body.items.find((it) => it.id === sized.id);
  assert.equal(theirs.size.fitsLikeUS, "M", "an unpersonalised rack keeps the label's fit");
  const search = await loadRoute("app/api/search/route.js");
  const s = await callRoute(search.GET, { path: "/api/search", cookies: me.cookies, query: { q: sized.brand.toLowerCase(), brain: "1", user: me.uid, limit: "96" } });
  const hit = s.body.results.find((it) => it.id === sized.id);
  assert.ok(hit, "search finds the piece");
  assert.equal(hit.size.fitsLikeUS, "S");
  void word;
});

test("law 3: the memory and the taste network name the designers a reader's saves credit, tied to the registry", async () => {
  const me = newDevice();
  const credited = CATALOG.filter((it) => (it.designers || []).some((d) => d !== it.brand)).slice(0, 3);
  const board = await createBoard(me.uid, "saves");
  for (const it of credited) await addBoardItem(board.id, it);
  const list = await creditedDesigners([{ items: credited.map((it) => ({ id: it.id })) }]);
  assert.ok(list.length >= 1);
  for (const d of list) {
    assert.ok(d.saves >= 1);
    assert.equal(d.sourced, true, `${d.name} is in the registry`);
    assert.ok(d.career.length >= 1, `${d.name} has a dated tenure`);
    assert.ok(!CATALOG.some((it) => it.brand === d.name), "a house is not listed as a person");
  }
  const m = await asteriskMemory(me.uid);
  assert.ok(Array.isArray(m.memory.inferred.designers));
  assert.deepEqual(m.memory.inferred.designers.map((d) => d.name).sort(), list.map((d) => d.name).sort());
  const route = await loadRoute("app/api/taste/route.js");
  const res = await callRoute(route.GET, { path: "/api/taste", cookies: me.cookies, query: { user: me.uid } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.designers.map((d) => d.name).sort(), list.map((d) => d.name).sort());
  assert.deepEqual(await creditedDesigners([]), []);
});
