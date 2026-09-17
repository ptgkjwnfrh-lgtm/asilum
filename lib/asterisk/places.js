// lib/asterisk/places.js — where the houses' cities are on the globe.
//
// The PURCHASE GLOBE on /upload plots the cities the bearer's pieces came
// from: a paid order or a purchase ticket the bearer reported as bought →
// the piece's house (lib/asterisk/houses.js, the curated origin record) →
// that house's city → a latitude and a longitude from this table. Nothing
// else is plotted. A house the origin record does not know, or knows only by
// country (Carhartt WIP, Cav Empt), is UNPLACED and said so — a marker that
// was guessed is the fabricated record the constitution forbids.
//
// WHAT THIS IS. Curated reference knowledge in the same class as houses.js:
// one row per city named in HOUSES, hand-entered, reviewable on one screen.
// Coordinates are the city centre to about a tenth of a degree — at the
// globe's size a tenth of a degree is under a pixel, so nothing finer is
// claimed. `originCoverage` in houses.js reports houses the record lacks;
// `placeCoverage()` here reports cities the record names but this table
// cannot place, so the two files cannot drift apart silently (the test
// tests/purchase-places.test.js holds them together).

import { HOUSES, houseOrigin } from "./houses.js";

export const PLACE_PROVENANCE = {
  compiledOn: "2026-09-11",
  method: "hand-entered city-centre coordinates, decimal degrees, one row per city named in HOUSES",
  precision: "about 0.1 degree — sub-pixel at the globe's size; nothing finer is claimed",
  // The standard changed on 11 Sep 2026 when the origin record grew from 63
  // houses to the archive canon. "Every city in HOUSES has a row" was a
  // promise this file could keep at 63 houses and could only have kept at 392
  // by inventing coordinates for towns it cannot place — which is the
  // fabricated record the constitution forbids, and worse than a hole. What
  // is promised now is what the globe actually needs: every city of a house
  // the catalog STOCKS is placed (a purchase can only come from stocked
  // inventory), every other hole is REPORTED by placeCoverage(), and nothing
  // is ever guessed.
  standard: "every city of a STOCKED house has a row; any other city the record names and this table cannot place is a hole placeCoverage() reports, never a guess",
};

// city → { country, lat, lon }. Keyed by the exact `city` string houses.js
// uses, so a rename there is a hole here, not a silent miss.
export const PLACES = {
  "Annecy": { country: "France", lat: 45.90, lon: 6.13 },
  "Antwerp": { country: "Belgium", lat: 51.22, lon: 4.40 },
  "Beaverton": { country: "United States", lat: 45.49, lon: -122.80 },
  "Florence": { country: "Italy", lat: 43.77, lon: 11.26 },
  "Herzogenaurach": { country: "Germany", lat: 49.57, lon: 10.88 },
  "Kojima": { country: "Japan", lat: 34.46, lon: 133.81 },
  "Laguna Beach": { country: "United States", lat: 33.54, lon: -117.78 },
  "London": { country: "United Kingdom", lat: 51.51, lon: -0.13 },
  "Los Angeles": { country: "United States", lat: 34.05, lon: -118.24 },
  "Madrid": { country: "Spain", lat: 40.42, lon: -3.70 },
  "Milan": { country: "Italy", lat: 45.46, lon: 9.19 },
  "New York": { country: "United States", lat: 40.71, lon: -74.01 },
  "North Vancouver": { country: "Canada", lat: 49.32, lon: -123.07 },
  "Paris": { country: "France", lat: 48.86, lon: 2.35 },
  "Ravarino": { country: "Italy", lat: 44.72, lon: 11.10 },
  "Rome": { country: "Italy", lat: 41.90, lon: 12.50 },
  "Sanjō": { country: "Japan", lat: 37.64, lon: 138.96 },
  "Stockholm": { country: "Sweden", lat: 59.33, lon: 18.07 },
  "Tokyo": { country: "Japan", lat: 35.68, lon: 139.69 },
  "Venice": { country: "United States", lat: 33.99, lon: -118.46 },
  "Ventura": { country: "United States", lat: 34.27, lon: -119.23 },
  "Vicenza": { country: "Italy", lat: 45.55, lon: 11.55 },
  "Zurich": { country: "Switzerland", lat: 47.38, lon: 8.54 },

  // ---- SECOND PASS, 11 September 2026 ------------------------------------
  // The origin record grew from 63 houses to the archive canon, naming many
  // more cities. These are the ones whose centre this file can state at 0.1°
  // without reaching: major cities, entered by hand like every row above.
  // Cities named by the record and NOT here are deliberate holes —
  // placeCoverage() reports them and placeFor() returns null rather than
  // guess. Every city of a house the catalog actually stocks is placed; the
  // holes are all houses nobody can buy here yet.
  "Barcelona": { country: "Spain", lat: 41.39, lon: 2.17 },
  "Beijing": { country: "China", lat: 39.90, lon: 116.41 },
  "Berlin": { country: "Germany", lat: 52.52, lon: 13.40 },
  "Bologna": { country: "Italy", lat: 44.49, lon: 11.34 },
  "Boston": { country: "United States", lat: 42.36, lon: -71.06 },
  "Brighton": { country: "United Kingdom", lat: 50.82, lon: -0.14 },
  "Brussels": { country: "Belgium", lat: 50.85, lon: 4.35 },
  "Copenhagen": { country: "Denmark", lat: 55.68, lon: 12.57 },
  "Denver": { country: "United States", lat: 39.74, lon: -104.99 },
  "Helsinki": { country: "Finland", lat: 60.17, lon: 24.94 },
  "Hong Kong": { country: "Hong Kong", lat: 22.32, lon: 114.17 },
  "Johannesburg": { country: "South Africa", lat: -26.20, lon: 28.05 },
  "Kobe": { country: "Japan", lat: 34.69, lon: 135.20 },
  "Manchester": { country: "United Kingdom", lat: 53.48, lon: -2.24 },
  "Munich": { country: "Germany", lat: 48.14, lon: 11.58 },
  "Northampton": { country: "United Kingdom", lat: 52.24, lon: -0.90 },
  "Nottingham": { country: "United Kingdom", lat: 52.95, lon: -1.15 },
  "Osaka": { country: "Japan", lat: 34.69, lon: 135.50 },
  "Perugia": { country: "Italy", lat: 43.11, lon: 12.39 },
  "Portland": { country: "United States", lat: 45.52, lon: -122.68 },
  "San Francisco": { country: "United States", lat: 37.77, lon: -122.42 },
  "Seattle": { country: "United States", lat: 47.61, lon: -122.33 },
  "Seoul": { country: "South Korea", lat: 37.57, lon: 126.98 },
  "Shanghai": { country: "China", lat: 31.23, lon: 121.47 },
  "Sofia": { country: "Bulgaria", lat: 42.70, lon: 23.32 },
  "Sydney": { country: "Australia", lat: -33.87, lon: 151.21 },
  "Tbilisi": { country: "Georgia", lat: 41.72, lon: 44.79 },
  "Turin": { country: "Italy", lat: 45.07, lon: 7.69 },
  "Umeå": { country: "Sweden", lat: 63.83, lon: 20.26 },
  "Varese": { country: "Italy", lat: 45.82, lon: 8.83 },
  "Xiamen": { country: "China", lat: 24.48, lon: 118.09 },
};


/** The city a brand's pieces come from, placed — or null. Never guesses. */
export function placeFor(brand) {
  const house = houseOrigin(brand);
  if (!house || !house.city) return null;
  const at = PLACES[house.city];
  if (!at) return null;
  return { brand: house.brand, city: house.city, country: house.country, lat: at.lat, lon: at.lon };
}

/** Cities the origin record names that this table cannot place — the hole, said out loud. */
export function placeCoverage(stockedBrands = null) {
  const houses = stockedBrands
    ? stockedBrands.map((b) => houseOrigin(b)).filter(Boolean)
    : Object.values(HOUSES);
  const cities = [...new Set(houses.map((h) => h.city).filter(Boolean))];
  const missing = cities.filter((c) => !PLACES[c]);
  return { total: cities.length, placed: cities.length - missing.length, missing };
}

/**
 * The bearer's purchases → the globe's markers. `purchases` is a list of
 * { brand, at } (at: epoch ms or null); the answer is one marker per city
 * with how many pieces came from it, which houses, and the newest purchase,
 * plus the honest remainder: how many purchases there were, how many could
 * be placed, and the brands that could not (unknown house, or no city).
 * Cities sort by count, then by newest, so the first marker is the one the
 * globe's readout names.
 */
export function aggregatePlaces(purchases = []) {
  const byCity = new Map();
  const unplaced = [];
  let placed = 0;
  for (const p of purchases) {
    const brand = p && p.brand ? String(p.brand) : "";
    const spot = brand ? placeFor(brand) : null;
    if (!spot) {
      const label = brand || "unknown house";
      if (!unplaced.includes(label)) unplaced.push(label);
      continue;
    }
    placed += 1;
    const at = Number.isFinite(p.at) ? p.at : null;
    let row = byCity.get(spot.city);
    if (!row) {
      row = { city: spot.city, country: spot.country, lat: spot.lat, lon: spot.lon, count: 0, brands: [], last: null };
      byCity.set(spot.city, row);
    }
    row.count += 1;
    if (!row.brands.includes(spot.brand)) row.brands.push(spot.brand);
    if (at != null && (row.last == null || at > row.last)) row.last = at;
  }
  const places = [...byCity.values()].sort((a, b) => b.count - a.count || (b.last || 0) - (a.last || 0) || a.city.localeCompare(b.city));
  return { places, purchases: purchases.length, placed, unplaced };
}
