import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Storefront does not add a global tab and a fresh launch remains on Feed", () => {
  const shell = readFileSync(new URL("../app/shell.js", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../lib/nav.js", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /router\.replace\(["']\/cover/);
  assert.doesNotMatch(nav, /label:\s*["']STOREFRONT/);
});

test("the shared bag dispatches native lines to the native API and keeps the gate visible", () => {
  const shell = readFileSync(new URL("../app/shell.js", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const discover = readFileSync(new URL("../app/discover/page.js", import.meta.url), "utf8");
  const ticketRoute = readFileSync(new URL("../app/api/ticket-fee/route.js", import.meta.url), "utf8");
  assert.match(shell, /postJSON\("\/api\/checkout"/);
  assert.match(shell, /commerceRail !== "native_storefront"/);
  assert.match(shell, /native_checkout_ready !== true/);
  assert.match(shell, /CHECK OUT THIS SELLER/);
  assert.match(shell, /ASiLUM passenger fee before payment/);
  assert.match(shell, /target\.hostname !== "checkout\.stripe\.com"/);
  assert.doesNotMatch(shell, /window\.location\.href\s*=\s*["']\/checkout\?item/);
  assert.match(feed, /item\?\.commerce_rail === "native_storefront"/);
  assert.match(feed, /postJSON\("\/api\/checkout"/);
  assert.match(feed, /Native records never enter that legacy fee rail/);
  assert.match(feed, /modal\.commerce_rail === "native_storefront"/,
    "native product detail does not show the legacy request-purchase control");
  assert.match(discover, /item\?\.commerce_rail === "native_storefront"/);
  assert.match(discover, /postJSON\("\/api\/checkout"/);
  assert.match(ticketRoute, /item\.commerce_rail === "native_storefront"/);
  assert.match(ticketRoute, /native Storefront items require native checkout/g);
});
