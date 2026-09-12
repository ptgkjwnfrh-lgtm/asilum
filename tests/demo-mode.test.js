// tests/demo-mode.test.js — the owner's Aug-16 ruling, made executable.
//
// The catalog is synthetic sample data. It was shown with prices, sizes,
// seasons, availability and "just in", and every record offered a Buy control
// that /api/tickets would refuse with a 409 — so a visitor learned the truth
// by clicking. Demo mode labels the records and removes the control.
//
// THE ONE THING THAT MUST NOT DRIFT is the definition of "demo". The client
// hides Buy using isDemoItem(); the server refuses tickets using its own rule
// in app/api/tickets/route.js. If those two ever disagree, one of two bugs
// appears: a Buy button that always fails (the bug just fixed), or — worse — a
// real listing quietly labelled DEMO and unbuyable. The parity test below is
// the guard, and it runs against the REAL catalog rather than a fixture.

import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { isDemoItem } from "../lib/social.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { callRoute, newDevice, loadRoute } from "./helpers/route.js";

const tickets = await loadRoute("app/api/tickets/route.js");

test("isDemoItem treats anything it cannot prove is live as demo", () => {
  // Conservative by design: an unproven listing labelled demo is a small
  // embarrassment; a demo record labelled live is the trust failure.
  assert.equal(isDemoItem(null), true, "no item at all");
  assert.equal(isDemoItem({}), true, "no source of any kind");
  assert.equal(isDemoItem({ url: "" }), true, "empty url");
  assert.equal(isDemoItem({ url: "not-a-url" }), true, "unparseable url");
  assert.equal(isDemoItem({ url: "http://example.com/x" }), true,
    "plain http is not a live listing — the safe-url helper requires https");
  assert.equal(isDemoItem({ url: "https://example.com/x", source_name: "seed" }), true,
    "a seed source is demo even with a url");
  assert.equal(isDemoItem({ url: "https://example.com/x", source: "Asilum synthetic seed" }), true,
    "the full synthetic-seed label is demo too");

  // THE CASE THAT ACTUALLY EXERCISES THE URL REQUIREMENT, and the reason this
  // line exists. Every assertion above still passes with the `hasLiveUrl` check
  // deleted, because those records are ALSO caught by the seed-source check —
  // checked by reverting, which is the only way this kind of redundancy shows
  // itself. A named source with no listing behind it is the one shape that
  // needs the url rule, and without it this record reads as live.
  assert.equal(isDemoItem({ source_name: "Some Boutique" }), true,
    "a real-looking source name with NO url is still unproven, so still demo");
  assert.equal(isDemoItem({ source_name: "Some Boutique", url: "" }), true,
    "and an empty url does not rescue it");
});

test("isDemoItem does not label a genuinely sourced listing as demo", () => {
  // The failure this guards is the expensive one: real inventory hidden behind
  // a DEMO flag and stripped of its Buy control.
  const live = {
    id: "ebay-123", title: "a real listing",
    source_name: "ebay", source_product_url: "https://www.ebay.com/itm/123",
  };
  assert.equal(isDemoItem(live), false, "an ebay listing with an https url is live");
  assert.equal(isDemoItem({ url: "https://shop.example.com/p/1", source_name: "Some Boutique" }), false,
    "any non-seed source with an https url is live");
});

test("every record in the shipped catalog is demo, and the whole catalog agrees", () => {
  // If this ever fails, real inventory has entered CATALOG and the demo banner
  // on / and /discover has become a lie for at least one piece.
  const live = CATALOG.filter((it) => !isDemoItem(it));
  assert.deepEqual(live.map((it) => it.id), [],
    "the shipped catalog is entirely synthetic; anything live here means the banners are wrong");
  assert.ok(CATALOG.length > 100, `and it is the real catalog, not an empty import (${CATALOG.length} items)`);
});

test("the client's demo rule and the server's ticket refusal agree", async () => {
  // THE DRIFT GUARD. Same record, both rules. The client hides Buy; the server
  // must refuse a ticket for exactly the same records, or the two surfaces are
  // telling the visitor different things.
  const me = newDevice();
  const sample = CATALOG.slice(0, 5);
  assert.ok(sample.length === 5, "need real catalog rows for this to mean anything");

  for (const item of sample) {
    assert.equal(isDemoItem(item), true, `${item.id} is demo to the client`);
    const res = await callRoute(tickets.POST, {
      path: "/api/tickets", cookies: me.cookies, json: { user: me.uid, itemId: item.id },
    });
    assert.equal(res.status, 409,
      `${item.id}: the client calls it demo, so the server must refuse the ticket — a 200 here means Buy would have worked on a record the UI hid`);
    assert.match(res.body.error, /demo inventory/i);
  }
});

// ---- the page-level disclosure, after the seed was deleted (12 Sep 2026) ----
//
// Three pages carried an unconditional banner — "every piece here is synthetic
// sample data". True on 16 August, when the catalog was 915 seeded rows. False
// from 12 September, when they were deleted and 897 real eBay listings stood in
// their place, and the banner went on telling visitors that real, linkable,
// purchasable pieces were fake. Four test files held the sentences green. The
// banner asks the shelf now.

test("anyDemoRecord answers about the shelf, not about the assumption", async () => {
  const { anyDemoRecord } = await import("../lib/social.js");
  const real = { id: "ebay-1", source_name: "ebay", url: "https://www.ebay.com/itm/1" };
  const demo = { id: "syn-1", source_name: "seed", url: "" };
  assert.equal(anyDemoRecord([]), false, "an empty page claims nothing");
  assert.equal(anyDemoRecord([real, real]), false, "a real shelf is not announced as demo");
  assert.equal(anyDemoRecord([real, demo]), true, "one demo record earns the banner");
  assert.equal(anyDemoRecord([demo]), true);
  assert.equal(anyDemoRecord(null), false, "no items, no claim");
  // A wardrobe piece is the bearer's own garment, not catalog, and has no url —
  // isDemoItem calls it demo by its conservative default. It must not drag a
  // real shelf into a false disclosure.
  assert.equal(anyDemoRecord([real, { id: "w-1", owned: true }]), false,
    "an owned piece is not a catalog record");
});

test("every page-level demo banner is gated on the data", () => {
  for (const page of ["app/page.js", "app/discover/page.js", "app/stylist/page.js"]) {
    const src = readFileSync(new URL("../" + page, import.meta.url), "utf8");
    const banner = src.indexOf("demobanner");
    assert.ok(banner > -1, `${page} lost its banner entirely`);
    // the gate must sit within the JSX expression that produces the banner
    const before = src.slice(Math.max(0, banner - 400), banner);
    assert.match(before, /anyDemoRecord\(/,
      `${page} states the demo disclosure unconditionally — it must ask the items`);
  }
});

test("the file catalog is a floor for having no database, never for an empty one", () => {
  const products = readFileSync(new URL("../lib/products.js", import.meta.url), "utf8");
  assert.match(products, /const live = !!process\.env\.DATABASE_URL/,
    "getDiscoverablePool must distinguish no-database from empty-database");
  assert.equal(/rows\.length \? rows : fallback \? CATALOG/.test(products), false,
    "an empty live catalog must not be refilled with synthetic pieces");
  const explain = readFileSync(new URL("../lib/asterisk/explain.js", import.meta.url), "utf8");
  assert.equal(/getItem\(productId\) \|\| getCatalogItem\(productId\)/.test(explain), false,
    "Asterisk must not explain a piece the catalog no longer holds");
});
