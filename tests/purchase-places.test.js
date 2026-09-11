// tests/purchase-places.test.js — the PURCHASE GLOBE plots only what the
// record can place, and says the rest out loud.
//
// The contract under test:
//   * every city the origin record (houses.js) names has coordinates here —
//     the two curated files cannot drift apart silently;
//   * a coordinate is a real place on the earth, not a typo (ranges);
//   * a house without a city, or a house the record does not know, is
//     UNPLACED — reported, never guessed onto the globe;
//   * the aggregate is honest arithmetic: counts add up, cities merge, the
//     first marker is the one with the most pieces;
//   * the route answers a signed device with its OWN purchases only, and an
//     empty record is an empty list — not an error and not a stand-in.
process.env.DATABASE_URL = "";
delete process.env.STRIPE_SECRET_KEY;

import { test } from "node:test";
import assert from "node:assert/strict";

import { HOUSES } from "../lib/asterisk/houses.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { PLACES, PLACE_PROVENANCE, placeFor, placeCoverage, aggregatePlaces } from "../lib/asterisk/places.js";
import { callRoute, newDevice, loadRoute } from "./helpers/route.js";
import { createOrderWithEvent, applyOrderEvent } from "../lib/db/orders.js";

const { GET: ordersGET } = await loadRoute("app/api/orders/route.js");

// AMENDED 11 Sep 2026. The original contract was "every city in HOUSES has a
// row", which the origin record's growth from 63 houses to the archive canon
// made unkeepable without inventing coordinates for towns this file cannot
// place — a fabricated marker being strictly worse than a reported hole. The
// contract is now the one the globe actually needs, and it is stronger where
// it matters: a purchase can only come from stocked inventory, so every
// STOCKED house's city must be placed, exactly, with no exceptions.
test("every city a STOCKED house names is placed, and the rest are reported", () => {
  const stocked = [...new Set(CATALOG.map((it) => it.brand).filter(Boolean))];
  const cov = placeCoverage(stocked);
  assert.deepEqual(cov.missing, [], `stocked houses whose city has no coordinates: ${cov.missing.join(", ")}`);
  assert.equal(cov.placed, cov.total);
  assert.ok(cov.total >= 20, "the stocked houses name at least twenty cities");

  // The wider record's holes are REPORTED, never silent and never guessed.
  const all = placeCoverage();
  assert.ok(all.total >= cov.total);
  assert.ok(Array.isArray(all.missing));
  for (const city of all.missing) assert.equal(PLACES[city], undefined, city);
  for (const k of ["compiledOn", "method", "precision", "standard"]) assert.ok(PLACE_PROVENANCE[k], k);
});

test("every coordinate is a place on the earth and the country matches the house's", () => {
  for (const [city, at] of Object.entries(PLACES)) {
    assert.ok(at.lat >= -90 && at.lat <= 90, `${city} latitude ${at.lat}`);
    assert.ok(at.lon >= -180 && at.lon <= 180, `${city} longitude ${at.lon}`);
    assert.ok(at.country, `${city} names a country`);
    const houses = Object.values(HOUSES).filter((h) => h.city === city);
    assert.ok(houses.length, `${city} is used by at least one house`);
    for (const h of houses) assert.equal(h.country, at.country, `${city}: the house's country and the place's country agree`);
  }
});

test("placeFor never guesses: an unknown house, or a house without a city, is null", () => {
  // Namacheko was this assertion's example of an absent house until the
  // 11 Sep verification pass read its Antwerp base; the RULE is what matters,
  // so it is pinned on a house nobody has recorded rather than on whichever
  // house happens to be missing today.
  assert.equal(placeFor("Atelier Nobody"), null, "a house the origin record does not know");
  assert.equal(placeFor("Carhartt WIP"), null, "known by country only — no city, no marker");
  assert.equal(placeFor(""), null);
  const tokyo = placeFor("comme des garçons");
  assert.equal(tokyo.city, "Tokyo");
  assert.equal(tokyo.brand, "Comme des Garçons", "the record's own spelling comes back");
  assert.equal(tokyo.lat, PLACES.Tokyo.lat);
});

test("aggregatePlaces merges by city, counts honestly, and reports the unplaced", () => {
  const out = aggregatePlaces([
    { brand: "Sacai", at: 100 },
    { brand: "Comme des Garçons", at: 300 },
    { brand: "Rick Owens", at: 200 },
    { brand: "Carhartt WIP", at: 400 },
    { brand: "Some House Nobody Knows", at: 500 },
    { brand: "", at: 600 },
  ]);
  assert.equal(out.purchases, 6);
  assert.equal(out.placed, 3);
  assert.deepEqual(out.unplaced, ["Carhartt WIP", "Some House Nobody Knows", "unknown house"]);
  assert.equal(out.places.length, 2);
  assert.equal(out.places[0].city, "Tokyo", "the city with the most pieces leads");
  assert.equal(out.places[0].count, 2);
  assert.deepEqual(out.places[0].brands, ["Sacai", "Comme des Garçons"]);
  assert.equal(out.places[0].last, 300, "the newest purchase in that city");
  assert.equal(out.places[1].city, "Paris");
  assert.equal(out.places[1].count, 1);
  assert.deepEqual(aggregatePlaces([]), { places: [], purchases: 0, placed: 0, unplaced: [] });
});

test("/api/orders?places=1 refuses a stranger and answers a device with an empty, honest record", async () => {
  const anon = await callRoute(ordersGET, { path: "/api/orders", query: { places: "1" } });
  assert.equal(anon.status, 401);
  const dev = newDevice();
  const res = await callRoute(ordersGET, { path: "/api/orders", query: { places: "1" }, cookies: dev.cookies });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.places, []);
  assert.equal(res.body.purchases, 0);
  assert.equal(res.body.placed, 0);
  assert.deepEqual(res.body.unplaced, []);
  assert.deepEqual(res.body.sources, { orders: 0, tickets: 0 });
});

test("/api/orders?places=1 plots a PAID order's house and ignores an unpaid one and a fee-only one", async () => {
  const dev = newDevice();
  // the item must be resolvable: the seed catalog is what mem mode holds
  const { CATALOG } = await import("../lib/ingest/catalog.js");
  const placedItem = CATALOG.find((it) => placeFor(it.brand));
  assert.ok(placedItem, "the seed catalog stocks at least one placeable house");
  const paid = await createOrderWithEvent({ user: dev.uid, itemId: placedItem.id, amountCents: 1000, currency: "usd" });
  await applyOrderEvent({ orderId: paid.id, type: "paid", source: "test", newStatus: "paid" });
  await createOrderWithEvent({ user: dev.uid, itemId: placedItem.id, amountCents: 1000, currency: "usd" }); // awaiting_payment
  const fee = await createOrderWithEvent({ user: dev.uid, itemId: placedItem.id, amountCents: 0, feeCents: 300, currency: "usd", kind: "ticket_fee" });
  await applyOrderEvent({ orderId: fee.id, type: "paid", source: "test", newStatus: "paid" });

  const res = await callRoute(ordersGET, { path: "/api/orders", query: { places: "1" }, cookies: dev.cookies });
  assert.equal(res.status, 200);
  const spot = placeFor(placedItem.brand);
  assert.equal(res.body.purchases, 1, "one paid sale; the awaiting one and the fee-only one do not count");
  assert.equal(res.body.placed, 1);
  assert.equal(res.body.places.length, 1);
  assert.equal(res.body.places[0].city, spot.city);
  assert.equal(res.body.places[0].count, 1);
  assert.deepEqual(res.body.places[0].brands, [spot.brand]);
  assert.equal(res.body.sources.orders, 1);

  // another device sees none of it
  const other = newDevice();
  const theirs = await callRoute(ordersGET, { path: "/api/orders", query: { places: "1" }, cookies: other.cookies });
  assert.deepEqual(theirs.body.places, []);
});
