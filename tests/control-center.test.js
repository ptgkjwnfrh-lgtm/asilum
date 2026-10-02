// tests/control-center.test.js — the control center, the one sheet, the
// view-state registry and the ad strip's law (V.2 brief, owner, 1 Oct 2026).
// Pure modules, tested as data; the shell markup is pinned by source reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UTILITIES, SEARCH_SCOPES, scopeFor, SEARCH_TOGGLES, toggleContent, stateKey, LAUNCH_PATH, MAP_TOOLS } from "../lib/dock.js";
import { restoreAnchor, newAbove } from "../lib/viewstate.js";
import { tickerItems, placementLine, shortDate, PLACEMENT_LABELS } from "../lib/placements.js";
import { placeNames, projector } from "../lib/roads/overpass.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("the utilities are Likes, Search, Messages — actions, not tabs", () => {
  assert.deepEqual(UTILITIES.map((u) => u.id), ["likes", "search", "messages"]);
  for (const u of UTILITIES) assert.ok(u.label && !("href" in u), u.id + " must not be a route");
});

test("search scopes carry the brief's exact placeholders and never widen on their own", () => {
  assert.equal(SEARCH_SCOPES.global.placeholder, "Search ASiLUM");
  assert.equal(SEARCH_SCOPES.map.placeholder, "Search places and events");
  assert.equal(SEARCH_SCOPES.messages.placeholder, "Search your messages");
  assert.equal(SEARCH_SCOPES["likes-pieces"].placeholder, "Search liked pieces");
  assert.equal(SEARCH_SCOPES["likes-wire"].placeholder, "Search liked Wire posts");
  assert.equal(SEARCH_SCOPES["likes-sold"].placeholder, "Search sold likes");
  assert.equal(scopeFor({ pathname: "/map" }).id, "map");
  assert.equal(scopeFor({ pathname: "/", sheet: "messages" }).id, "messages");
  assert.equal(scopeFor({ pathname: "/map", sheet: "likes", likesTab: "sold" }).id, "likes-sold", "a sheet's scope beats the page's");
  assert.equal(scopeFor({ pathname: "/cover" }).id, "global");
  for (const k of Object.keys(SEARCH_SCOPES)) if (k !== "global") assert.equal(SEARCH_SCOPES[k].wide, true, k + " offers Search all ASiLUM as an explicit action");
  assert.equal(SEARCH_SCOPES.global.wide, false);
});

test("Pieces and Wire are independent toggles with at least one on; ASTERISK is free", () => {
  assert.deepEqual(SEARCH_TOGGLES.map((t) => t.id), ["pieces", "wire", "asterisk"]);
  const both = { pieces: true, wire: true, asterisk: true };
  const noWire = toggleContent(both, "wire");
  assert.deepEqual(noWire, { pieces: true, wire: false, asterisk: true });
  assert.deepEqual(toggleContent(noWire, "pieces"), noWire, "the last content type cannot be turned off");
  assert.equal(toggleContent(both, "asterisk").asterisk, false);
});

test("a fresh launch goes to the feed and nothing remembers a last tab", () => {
  assert.equal(LAUNCH_PATH, "/");
  const dock = read("lib/dock.js") + read("lib/dockstate.js") + read("app/shell.js");
  assert.ok(!/last[-_]?tab|lastDestination|asilum-last/i.test(dock), "no last-tab memory anywhere in the shell");
});

test("the view-state key is viewer + route + subtab + normalised query + sorted filters", () => {
  const a = stateKey({ viewer: "u1", route: "/", subtab: "wire", query: "  Black  Leather ", filters: { lane: "film", tab: "curated" } });
  const b = stateKey({ viewer: "u1", route: "/", subtab: "wire", query: "black leather", filters: { tab: "curated", lane: "film" } });
  assert.equal(a, b, "whitespace, case and filter order do not make a new key");
  assert.notEqual(a, stateKey({ viewer: "u2", route: "/", subtab: "wire", query: "black leather", filters: { lane: "film", tab: "curated" } }), "another viewer is another key");
});

test("a removed anchor restores to the nearest surviving neighbour; new items wait above", () => {
  const record = { anchor: "c", order: ["a", "b", "c", "d", "e"] };
  assert.equal(restoreAnchor(record, ["a", "b", "c", "d", "e"]), "c");
  assert.equal(restoreAnchor(record, ["a", "b", "d", "e"]), "b", "the one before first");
  assert.equal(restoreAnchor(record, ["a", "d", "e"]), "d", "then the one after");
  assert.equal(restoreAnchor(record, ["x", "y"]), null, "nothing of the old order survived");
  assert.deepEqual(newAbove(record, ["n1", "n2", "a", "b", "c"]), ["n1", "n2"], "the fresh prefix is held behind the button");
  assert.deepEqual(newAbove(record, ["a", "b", "c"]), []);
});

test("the ad strip carries SPONSORED only for a paid placement; drafts and listed events are labelled as such", () => {
  const today = "2026-10-01";
  const places = [
    { id: "pgc", name: "Prince George’s County Fashion Week", kind: "runway", dated: true, sample: false, startsAt: "2026-09-23", endsAt: "2026-09-25", sourceUrl: "https://example.org/x" },
    { id: "pop", name: "Street Commerce", kind: "pop-up", dated: true, sample: false, startsAt: "2026-10-31", endsAt: "2026-10-31", sourceUrl: "https://example.org/y" },
    { id: "fix", name: "A fixture", kind: "pop-up", dated: true, sample: true, startsAt: "2026-10-31", sourceUrl: "https://example.org/z" },
    { id: "shop", name: "A shop", kind: "shop", dated: false, sample: false, sourceUrl: "https://example.org/s" },
    { id: "nosrc", name: "Unsourced", kind: "pop-up", dated: true, sample: false, startsAt: "2026-11-01" },
  ];
  const drafts = [
    // a Studio event/shop draft carries its VENUE kind (addDraft spreads the
    // form over the record's kind), so the promotion line reads it directly
    { id: "d1", kind: "pop-up", name: "My pop-up", startsAt: "2026-11-05" },
    { id: "p1", kind: "promotion", draftId: "d1", startsAt: "2026-11-05" },
    { id: "p2", kind: "promotion", draftId: "missing" },
  ];
  const items = tickerItems({ placements: [], drafts, places, today });
  assert.deepEqual(items.map((i) => i.kind), ["draft", "listed"], "ended, sample, permanent and unsourced rows never run; no SPONSORED without a placement");
  assert.equal(items[0].label, PLACEMENT_LABELS.draft);
  assert.equal(items[0].line, "MY POP-UP : POP UP NOV 5");
  assert.equal(items[1].line, "STREET COMMERCE : POP UP OCT 31");
  assert.equal(items[1].href, "/map?pin=pop");
  const paid = tickerItems({ placements: [{ id: "x", name: "Paid", kind: "shop", href: "/u/paid" }], places: [], drafts: [], today });
  assert.equal(paid[0].label, "SPONSORED");
  assert.deepEqual(tickerItems({ today }), [], "nothing to carry carries nothing");
  assert.equal(shortDate("2026-10-31"), "OCT 31");
  assert.equal(placementLine({ name: "x", kind: "consignment" }), "X : CONSIGNMENT");
});

test("the map's tools are labelled Stamp, Connect, Discover", () => {
  assert.deepEqual(MAP_TOOLS.map((t) => t.label), ["STAMP", "CONNECT", "DISCOVER"]);
  for (const t of MAP_TOOLS) assert.ok(t.hint, t.id + " carries a readable hint");
});

test("the neighbourhood's name comes from OpenStreetMap place nodes inside the frame, nearest first", () => {
  const centre = { lat: 38.91, lng: -77.04 };
  const project = projector(centre.lat, centre.lng);
  const els = [
    { type: "node", id: 1, lat: 38.9096, lon: -77.0434, tags: { place: "neighbourhood", name: "Dupont Circle" } },
    { type: "node", id: 2, lat: 38.92, lon: -77.03, tags: { place: "suburb", name: "Adams Morgan" } },
    { type: "node", id: 3, lat: 38.911, lon: -77.041, tags: { place: "neighbourhood" } },      // no name → nothing
    { type: "node", id: 4, lat: 39.5, lon: -77.04, tags: { place: "neighbourhood", name: "Far away" } }, // outside the frame
    { type: "way", id: 5, tags: { highway: "primary" }, geometry: [] },
  ];
  const names = placeNames(els, project);
  assert.deepEqual(names.map((n) => n.name), ["Dupont Circle", "Adams Morgan"]);
  assert.equal(names[0].kind, "neighbourhood");
  assert.ok(Number.isInteger(names[0].x) && Number.isInteger(names[0].y));
});

test("the theme opens on the pale surface and only an explicit pick changes it", () => {
  const layout = read("app/layout.js");
  assert.ok(/if\(t!=="dark"&&t!=="light"\)t="light";/.test(layout), "the default is light");
  assert.ok(!/prefers-color-scheme/.test(layout.split("const PREPAINT")[1]), "the device scheme no longer decides");
});

test("the feed and the wire are one destination with two labelled views", () => {
  const feed = read("app/page.js");
  assert.ok(/href="\/\?view=wire"/.test(feed), "the wire view is a URL");
  assert.ok(/view === "wire"/.test(feed));
  assert.ok(/function feedList\(/.test(feed));
});

test("the feed parks and restores through the registry; wire cards carry their id; the cover and the dock read one placements hook", () => {
  const feed = read("app/page.js");
  assert.ok(/from "\.\.\/lib\/viewstate\.js"/.test(feed), "the feed imports the registry");
  assert.ok(/park\(\);\n\s*setModal\(item\);/.test(feed), "opening a detail parks the feed first");
  assert.ok(/addEventListener\("pagehide", onHide\)/.test(feed), "leaving the page parks it");
  assert.ok(/restoreFromPark\(data\.items \|\| \[\]\)/.test(feed), "the fresh feed re-finds the anchor");
  assert.ok(/className="newabove"/.test(feed), "new items above are offered, never scrolled into");
  const wire = read("app/components/WireCard.jsx");
  assert.ok(/data-id=\{"post:" \+ \(p\.serverId \?\? p\.id\)\}/.test(wire), "a wire card's data-id is the id the feed lists it under");
  const cover = read("app/cover/page.js");
  assert.ok(/<PlacementsBlock \/>/.test(cover), "the cover carries the placements block");
  const dock = read("app/components/ControlCenter.jsx");
  assert.ok(/usePlacements\(\)/.test(dock) && !/tickerItems\(/.test(dock), "the dock reads placements through the shared hook, not its own copy");
  const street = read("app/components/StreetMap.jsx");
  assert.ok(/map\.names/.test(street) && /strokeText\(label, x, y\)/.test(street), "the neighbourhood names are drawn from the document");
});
