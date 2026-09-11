// tests/ebay-title-reading.test.js — what the eBay normalizer reads out of a
// real listing title. Every title here came back from the PRODUCTION Browse
// API on first light (10 Sep 2026, scripts/ebay-first-light.mjs); the
// expectations are what an archive reader would say, and each one was a hole
// the first run exposed: season codes unread, "Short Sleeve" filed as shorts,
// sneaker collabs filed as tops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessEra, guessCategory } from "../lib/ingest/ebay.js";

test("season codes read as the year — FW1998, AW06, SS02, 03aw, 20SS, F/W21", () => {
  assert.equal(guessEra("Helmut Lang FW1998 Raw Denim Trucker Jacket Archive").year, 1998);
  assert.equal(guessEra("Raf Simons AW06 Embroidered R Logo Turtleneck").year, 2006);
  assert.equal(guessEra("Vintage Number (N)ine SS02 Cigarette Japanese").year, 2002);
  assert.equal(guessEra("NUMBER (N)INE 03aw Kurt Period Damaged Repair").year, 2003);
  assert.equal(guessEra("Yohji Yamamoto POUR HOMME 20SS Cotton Long Coat").year, 2020);
  assert.equal(guessEra("Raf Simons Tee Pink Blair Nebraska F/W21 Archive").year, 2021);
  assert.equal(guessEra("Helmut Lang AW 1996 Nylon Straps Work Jacket 46").year, 1996);
});

test("a bare decade reads as the decade, with no invented year", () => {
  assert.deepEqual(guessEra("Yohji Yamamoto Pour Homme 80s Made in France"), { decade: "1980s", raw: "80s" });
  assert.equal(guessEra("Helmut Lang 90s Stretch Cotton Trousers 38").decade, "1990s");
  assert.equal(guessEra("2000s Vintage HELMUT LANG Archival Cotton Cargo").decade, "2000s");
  assert.equal(guessEra("Maison Margiela 90's Artisanal Vintage Ribbed").decade, "1990s");
});

test("a title with no era at all is contemporary, raw null", () => {
  assert.deepEqual(guessEra("Rick Owens DRKSHDW sneaker red"), { decade: "2020s", raw: null });
});

test("a garment size or model number is never read as a year", () => {
  assert.equal(guessEra("Carol Christian Poell CCP AM/2683-IN PACAL").raw, null);
  assert.equal(guessEra("Rick Owens DRKSHDW Vegan Size 41 Black").raw, null);
});

test("short sleeve is not shorts; sneaker collabs are footwear", () => {
  assert.equal(guessCategory("Vintage 2000s Raf Simons Abstract Short Sleeve Shirt"), "tops");
  assert.equal(guessCategory("Japan Homme Plisse Pleated Shorts - Black"), "bottoms");
  assert.equal(guessCategory("Comme des Garcons Homme Plus Jordan 11 Black"), "footwear");
  assert.equal(guessCategory("Rick Owens DRKSHDW Ramones High-Top Canvas"), "footwear");
  assert.equal(guessCategory("Air Jordan 11 Retro Comme des Garcons Homme Plus"), "footwear");
  assert.equal(guessCategory("MAISON MARTIN MARGIELA Artisanal Paint Tabi Boots"), "footwear");
});

test("shoes named without the word shoe are footwear; a dress shirt is a top", () => {
  assert.equal(guessCategory("Vtg Salvatore Ferragamo Brown Leather Pumps w/horseshoe emblem 9M"), "footwear");
  assert.equal(guessCategory("Women's Red Patent Leather Pointed Toe Slingback Bow kitten Heels Size 6.5"), "footwear");
  assert.equal(guessCategory("Mid Cuban Heel Ankle Boots Lace Up Leather Brogue"), "footwear");
  assert.equal(guessCategory("New Men's French Cuff Dress Shirt Spread Collar"), "tops");
  assert.equal(guessCategory("Vintage 70s Maxi Dress"), "dresses");
});
