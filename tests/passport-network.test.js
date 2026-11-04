// tests/passport-network.test.js — THE NETWORK (owner, 3 Nov 2026: "a way to see everything … like a 3d
// nural map") and the Passport's leaves. The law: every edge the network draws says something true — a
// reading, a curated affinity, a tag the save really carries, a membership, an earned stamp — and nothing
// else; the leaves keep every /board?tab= link working and speak the passport's drawn language.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGraph, MAX_SAVES, PIECES_PER_BOARD } from "../lib/passport/network.js";
import { TAGS, TAG_AFFINITY } from "../lib/brain/tags.js";
import { LANGUAGES, LANGUAGE_CODES } from "../lib/passport/document.js";

const ROOT = new URL("../", import.meta.url).pathname;
const page = readFileSync(ROOT + "app/board/page.js", "utf8");
const net = readFileSync(ROOT + "app/components/TasteNetwork.jsx", "utf8");

const reading = {
  nodes: TAGS.map((tag) => ({ tag, weight: tag === "MINIMAL" ? 0.8 : tag === "GORP" ? -0.3 : tag === "ARCHIVAL" ? 0.02 : 0, kind: tag === "MINIMAL" ? "manual" : tag === "GORP" ? "inferred" : "none", saves: 0, evidence: [] })),
  edges: [{ a: "MINIMAL", b: "TAILORED", w: 0.7 }, { a: "GORP", b: "STREETWEAR", w: 0.2 }],
};
const saves = [
  { kind: "place", id: "berghain", title: "Berghain", tags: ["minimal", "avant-garde"], at: "2026-11-01T00:00:00Z" },
  { kind: "post", id: "p1", title: "notes", tags: ["not-a-tag"] },
  { kind: "person", id: "r1", title: "@quietarchive", tags: [] },
];
const boards = [{ id: "b1", name: "winter", items: Array.from({ length: 9 }, (_, i) => ({ id: "i" + i, title: "piece " + i, tags: i === 0 ? ["ARCHIVAL"] : [] })) }];
const stamps = [{ id: "collection", label: "FIRST COLLECTION", earned: true }, { id: "taste", label: "TASTE DEFINED", earned: false }];

test("every edge is one of the five true relations, and only where the data says so", () => {
  const g = buildGraph(reading, saves, boards, stamps);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) {
    assert.ok(ids.has(e.a) && ids.has(e.b), "both ends exist: " + e.a + " → " + e.b);
    assert.ok(["weight", "curated", "carries", "member", "earned"].includes(e.k), e.k);
  }
  const weight = g.edges.filter((e) => e.k === "weight").map((e) => e.b).sort();
  assert.deepEqual(weight, ["tag:GORP", "tag:MINIMAL"], "a reading only where |weight| > 0.04 (ARCHIVAL's 0.02 draws none)");
  assert.ok(g.edges.find((e) => e.b === "tag:GORP").neg, "a negative reading is marked so");
  const curated = g.edges.filter((e) => e.k === "curated");
  assert.deepEqual(curated.map((e) => e.a + "~" + e.b), ["tag:MINIMAL~tag:TAILORED"], "the API's affinities, below 0.3 left out");
  const carries = g.edges.filter((e) => e.k === "carries").map((e) => e.a + "→" + e.b).sort();
  assert.deepEqual(carries, ["piece:b1:i0→tag:ARCHIVAL", "save:place:berghain→tag:AVANT-GARDE", "save:place:berghain→tag:MINIMAL"],
    "a save or a piece is joined only to the tags it really carries; an unknown word draws nothing");
  assert.ok(g.edges.some((e) => e.a === "save:post:p1" && e.b === "hub:post" && e.k === "member"), "a save with no tag hangs off its kind");
  assert.deepEqual(g.edges.filter((e) => e.k === "earned").map((e) => e.b), ["stamp:collection"], "an unearned stamp is not drawn");
});

test("the kinds, the boards and the caps", () => {
  const g = buildGraph(reading, saves, boards, stamps);
  assert.deepEqual(g.nodes.filter((n) => n.type === "hub").map((n) => n.id).sort(), ["hub:person", "hub:place", "hub:post"], "a kind appears only with a save of it");
  assert.equal(g.nodes.filter((n) => n.type === "piece").length, PIECES_PER_BOARD, "a board draws its first six pieces");
  const many = Array.from({ length: MAX_SAVES + 20 }, (_, i) => ({ kind: "post", id: "x" + i, title: "x", tags: [] }));
  assert.equal(buildGraph(null, many, [], []).nodes.filter((n) => n.type === "save").length, MAX_SAVES);
});

test("with no reading the ten tags still stand, unlit, and the curated table supplies the affinities", () => {
  const g = buildGraph(null, [], [], []);
  assert.equal(g.nodes.filter((n) => n.type === "tag" && n.kind === "none").length, TAGS.length);
  assert.equal(g.edges.filter((e) => e.k === "weight").length, 0, "no reading, no reading lines");
  const table = Object.entries(TAG_AFFINITY).flatMap(([a, row]) => Object.entries(row).filter(([b, w]) => a < b && w >= 0.3).map(([b]) => "tag:" + a + "~tag:" + b));
  assert.deepEqual(g.edges.filter((e) => e.k === "curated").map((e) => e.a + "~" + e.b).sort(), table.sort());
});

test("the same passport draws the same shape every opening", () => {
  const a = buildGraph(reading, saves, boards, stamps), b = buildGraph(reading, saves, boards, stamps);
  assert.deepEqual(a.nodes.map((n) => n.p), b.nodes.map((n) => n.p));
  for (const n of a.nodes) assert.ok(n.p.every(Number.isFinite), n.id);
});



// ---- the stamps (owner, 3 Nov 2026: "different shapes in relation to what they mean … semi resemble the apple
// fitness badges … they go into a space zone"; "keep the sleek tron tom ford style") ----
import { MILESTONES, SERVER_READ, GROUPS } from "../lib/passport/milestones.js";
import { readMilestones, isArchival } from "../lib/passport/milestones-read.js";
import { SHAPES, shapePath, stampCode } from "../lib/passport/badges.js";
const badgeSrc = readFileSync(ROOT + "app/components/PassportBadge.jsx", "utf8");
const spaceSrc = readFileSync(ROOT + "app/components/StampSheet.jsx", "utf8");
const sheetSrc = readFileSync(ROOT + "app/components/SheetHost.jsx", "utf8");
const css = readFileSync(ROOT + "app/globals.css", "utf8");

test("the owner's list is all there, each with a shape of its own meaning", () => {
  const ids = MILESTONES.map((m) => m.id);
  for (const id of ["first-purchase", "first-international", "first-steal", "first-wardrobe", "first-archive", "first-japanese", "first-lvmh", "first-concert",
    "followers-100", "followers-1000", "followers-5000", "followers-10000", "followers-50000", "followers-100000", "followers-500000", "followers-1000000"]) assert.ok(ids.includes(id), id);
  for (const m of MILESTONES) {
    assert.ok(SHAPES[m.shape], m.id + " has a drawn shape");
    assert.ok(GROUPS.some((g) => g.id === m.group), m.id + " sits in a group");
    assert.ok(m.means && m.title && m.emblem, m.id + " says what it means");
  }
  const once = MILESTONES.filter((m) => !m.id.startsWith("followers-")).map((m) => m.shape);
  assert.equal(new Set(once).size, once.length, "no two meanings share a silhouette");
  const ladder = MILESTONES.filter((m) => m.id.startsWith("followers-")).map((m) => shapePath(m.shape).split(/[LM]/).filter((x) => x.trim()).length);
  assert.ok(ladder.every((n, i) => i === 0 || n > ladder[i - 1]), "the followers' ladder gains corners with every tier: " + ladder.join(","));
});

test("no stamp is lit by a guess: what cannot be read is locked and says what it waits for", () => {
  for (const m of MILESTONES) {
    assert.ok(["device", "server", "waits"].includes(m.read), m.id);
    if (m.read === "waits") assert.ok(m.waits && m.waits.length > 20, m.id + " names what it waits for");
  }
  for (const id of ["first-steal", "first-lvmh", "first-concert", "followers-100", "followers-1000000"]) assert.equal(MILESTONES.find((m) => m.id === id).read, "waits", id);
  assert.deepEqual([...SERVER_READ].sort(), ["first-archive", "first-international", "first-japanese", "first-purchase", "first-wardrobe"]);
  const none = readMilestones({});
  for (const id of SERVER_READ) assert.equal(none[id].earned, false, "nothing on record, nothing earned: " + id);
  assert.match(none["first-international"].waits, /base city/, "international without a base city says so");
});

test("the server's reading: the earliest qualifying record earns it, with the piece as evidence", () => {
  const purchases = [
    { at: 100, item: { id: "a", brand: "Acne Studios", title: "coat", era: { year: 2021 }, tags: {} } },
    { at: 200, item: { id: "b", brand: "Auralee", title: "knit", era: { year: 2022 }, tags: {} } },
    { at: 300, item: { id: "c", brand: "Helmut Lang", title: "jacket", era: { year: 1998 }, tags: {} } },
  ];
  const r = readMilestones({ purchases, wardrobePaid: [{ itemId: 9, at: 50 }, { itemId: 8, at: 10 }], home: "Sweden" });
  assert.equal(r["first-purchase"].at, 100);
  assert.equal(r["first-international"].evidence.itemId, "b", "Acne is Swedish like the base city; Auralee is the first from abroad");
  assert.equal(r["first-japanese"].evidence.itemId, "b");
  assert.equal(r["first-archive"].evidence.itemId, "c", "before 2000 is archive");
  assert.equal(r["first-wardrobe"].at, 10, "the earliest paid wardrobe offer");
  assert.equal(isArchival({ era: null, tags: { ARCHIVAL: 0.7 } }), true, "or the catalogue's archival reading");
  assert.equal(isArchival({ era: null, tags: { ARCHIVAL: 0.3 } }), false);
});

test("the badge is sleek and token-coloured; the space zone is a popup view, still under reduced motion", () => {
  for (const src of [badgeSrc, spaceSrc]) {
    assert.doesNotMatch(src, /feTurbulence|feDisplacementMap|<filter/, "no worn texture");
    assert.doesNotMatch(src, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])/i, "colour only through tokens");
  }
  assert.match(css, /\.ppbadge\.earned \{ filter: var\(--glow-mark\); \}/, "an earned badge glows through the token");
  assert.match(css, /\[data-theme="light"\] \{[^}]*--glow-mark: none;/s, "and never in the light palette");
  assert.match(sheetSrc, /stamp: \{ title: "ACHIEVEMENT", render: \(p\) => <StampSheet \{\.\.\.p\} \/> \}/, "the space zone is the one popup's view, not a second modal");
  assert.match(spaceSrc, /prefers-reduced-motion: reduce/);
  assert.match(readFileSync(ROOT + "app/components/Achievements.jsx", "utf8"), /openSheet\("stamp", \{ id: m\.id, states, title: "ACHIEVEMENT" \}\)/);
});



test("the map: Apple's map as the owner set it, the events near you, an event's ticket to Ticketmaster", () => {
  const map = readFileSync(ROOT + "app/components/PassportMapSheet.jsx", "utf8");
  const placeMap = readFileSync(ROOT + "app/components/PlaceMap.jsx", "utf8");
  assert.match(map, /tone="asilum"/);
  // the owner's SwiftUI setting, in MapKit JS: standard, flat, no points of interest, light, the user's dot, the scale, labels
  assert.match(placeMap, /colorScheme: asilum \|\| themeNow\(\) === "light" \? mk\.Map\.ColorSchemes\.Light/);
  assert.match(placeMap, /pointOfInterestFilter: mk\.PointOfInterestFilter\.excludingAllCategories/);
  assert.match(placeMap, /showsUserLocation: true/);
  assert.match(placeMap, /showsScale: mk\.FeatureVisibility\.Visible/);
  assert.match(placeMap, /el\.className = "ppmaplabel"/, "each place a label, not a pin");
  assert.match(css, /\.ppmaplabel \{[^}]*font-family: var\(--ocr\)[^}]*background: var\(--map-label-bg\); color: var\(--map-label-ink\)/s);
  assert.match(placeMap, /setRegionAnimated\(region, true\)/, "a new region is flown to");
  assert.match(placeMap, /prefers-reduced-motion: reduce/, "and jumped to under reduced motion");
  assert.doesNotMatch(css, /\.pmtint/, "no tint over Apple's map — its own light standard style");
  // no MapKit key (owner: "welp im broke"; then, on the schematic: "wtf is this radar shit"): the streets as
  // OpenStreetMap tiles in the same window, never the schematic
  const tiles = readFileSync(ROOT + "app/components/TileMap.jsx", "utf8");
  assert.match(map, /gate !== "apple" \? \(\s*<VectorMap centre=\{centre\} places=\{events\} selectedId=\{sel\} onSelect=\{choose\} height=\{winH\} \/>/, "Apple's look over OpenStreetMap (owner: 'make open streetmap look like apple maps')");
  assert.match(tiles, /https:\/\/tile\.openstreetmap\.org\/\$\{z\}\/\$\{x\}\/\$\{y\}\.png/);
  assert.match(tiles, /© OpenStreetMap ↗/, "the tiles' credit, as OpenStreetMap's tile policy asks");
  assert.match(tiles, /className=\{"ppmaplabel smaplabel"/, "each place a label, not a pin");
  assert.match(tiles, /prefers-reduced-motion: reduce\)"\)\.matches\) \{ setCam\(to\); return; \}/, "flown to, or jumped to under reduced motion");
  assert.match(map, /fetch\("\/api\/places\?" \+ qs/, "the events are the places record's, dated");
  assert.match(map, /ev\.live && ev\.sourceUrl/, "TICKETMASTER ↗ only on a live Ticketmaster listing, to its own page");
  assert.match(map, /a sample fixture — no tickets exist for it\./, "a fixture says it is one");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.pmticket \{ animation: none; \} \}/);
});


test("the Apple-style street map: MapLibre over OpenFreeMap, its worker the installed version's own copy", () => {
  const vm = readFileSync(ROOT + "app/components/VectorMap.jsx", "utf8");
  const pkg = JSON.parse(readFileSync(ROOT + "package.json", "utf8"));
  const lib = JSON.parse(readFileSync(ROOT + "node_modules/maplibre-gl/package.json", "utf8"));
  assert.equal(pkg.dependencies["maplibre-gl"], lib.version, "pinned exactly to what is installed");
  assert.match(vm, new RegExp(`/vendor/maplibre-gl-worker-${lib.version.replace(/\\./g, "\\.")}\\.mjs`), "the served worker is named for that version");
  const served = readFileSync(ROOT + `public/vendor/maplibre-gl-worker-${lib.version}.mjs`);
  const shipped = readFileSync(ROOT + "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
  assert.ok(served.equals(shipped), "and is byte for byte the installed worker");
  const style = readFileSync(ROOT + "lib/passport/mapStyle.js", "utf8");
  assert.match(style, /https:\/\/tiles\.openfreemap\.org\/planet/);
  assert.doesNotMatch(style, /source-layer": "poi"/, "no points of interest, as the owner set Apple's");
  assert.match(vm, /dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0/, "flat: no tilt, no turn");
  assert.match(vm, /<TileMap centre=\{centre\}/, "where a device cannot draw it, the street tiles stand in");
});


test("the Passport is the card and three keys; OPEN MAP and STAMP PASSPORT each a full-screen view with ← PASSPORT", () => {
  const code = page.replace(/\/\/.*$/gm, "");
  assert.match(code, /openView\("map"\); \}\}><Lamp \/>OPEN MAP/);
  assert.match(code, /openView\("stamps"\); \}\}><Lamp \/>STAMP PASSPORT/);
  assert.match(code, /openSheet\("tasteglobe", \{ title: "TASTE GLOBE" \}\)\}>VIEW TASTE GLOBE →/);
  assert.match(code, /<button type="button" className="ppviewback" onClick=\{closeView\}>← PASSPORT<\/button>/, "back in the left corner");
  assert.match(code, /\{view === "map" \? <PassportMapSheet \/> : <StampsView \/>\}/, "the view in place of the card");
  assert.match(code, /\{!shared && !view && \(/, "the card steps aside while a view is up");
  assert.match(code, /window\.history\.pushState\(\{ ppview: which \}/, "a step in the history, so back and a swipe return to the card");
  assert.match(code, /window\.addEventListener\("popstate", onPop\)/);
  assert.match(code, /const TAB_VIEWS = \{ places: "map", collection: "stamps" \};/, "old links open the views");
  assert.match(code, /tab === "studio"/, "the Studio stays reachable by link");
  assert.doesNotMatch(code, /ppinline|<StampBoards|<TasteNetwork|<AddStamp|MILESTONES/);
  assert.match(css, /\.ppviewback \{[^}]*position: absolute; left: 0;/);
});

test("pages and notes: a stamp is a pin, a page a board; the store keeps its rules", async () => {
  const P = await import("../lib/passport/pages.js");
  const mem = new Map(), st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const pg = P.createPage("  berlin\u0007 nights  ", st);
  assert.equal(pg.name, "berlin  nights", "the name trimmed and its control characters stripped");
  assert.equal(P.createPage("", st).name, "untitled page");
  P.addToPage(pg.id, "place:berghain", st); P.addToPage(pg.id, "artist:x", st); P.addToPage(pg.id, "place:berghain", st);
  assert.deepEqual(P.listPages(st).find((p) => p.id === pg.id).stamps, ["artist:x", "place:berghain"], "newest first, a stamp once");
  assert.deepEqual(P.pagesWith("place:berghain", st), [pg.id]);
  P.removeFromPage(pg.id, "artist:x", st);
  assert.deepEqual(P.listPages(st).find((p) => p.id === pg.id).stamps, ["place:berghain"]);
  P.renamePage(pg.id, "", st);
  assert.equal(P.listPages(st).find((p) => p.id === pg.id).name, "berlin  nights", "an empty rename keeps the name");
  P.setPageNote(pg.id, "x".repeat(400), st);
  assert.equal(P.listPages(st).find((p) => p.id === pg.id).note.length, P.NOTE_MAX, "a note is capped");
  P.setStampNote("place:berghain", "the queue", st);
  assert.equal(P.stampNotes(st)["place:berghain"], "the queue");
  P.setStampNote("place:berghain", "  ", st);
  assert.equal(P.stampNotes(st)["place:berghain"], undefined, "an emptied note is gone");
  assert.equal(P.deletePage(pg.id, st), true); assert.equal(P.deletePage(pg.id, st), false);
  // the covers: six layouts, picked by the page, the same every time, not all the same
  const ids = Array.from({ length: 40 }, (_, i) => "pg-" + i);
  assert.equal(P.coverLayout("pg-7").id, P.coverLayout("pg-7").id);
  assert.ok(new Set(ids.map((i) => P.coverLayout(i).id)).size >= 4, "the layouts vary across pages");
  for (const l of P.COVER_LAYOUTS) assert.match(css, new RegExp(`\\.sbcover\\.l-${l.id} \\{ grid-template:`), l.id);
  assert.match(css, /\.sbcover \{[^}]*gap: 1\.5px;[^}]*background: var\(--wm-bar\); \}/, "thin white lines between the pictures");
});

test("ALL STAMPS and PAGES: four sizes up to a fifth taller, notes in the corner, a page a large-card popup", async () => {
  const { stampTiers, TIER_SCALES } = await import("../lib/passport/stampTiers.js");
  assert.equal(TIER_SCALES.length, 4); assert.equal(TIER_SCALES[0], 1); assert.ok(Math.abs(TIER_SCALES[3] - 1.2) < 1e-9);
  assert.deepEqual(stampTiers([3, 9, 1, 4, 4, 7, 2, 8]), [1, 3, 0, 2, 1, 2, 0, 3], "pages ranked by stamps held, a quarter to each size");
  const view = readFileSync(ROOT + "app/components/StampsView.jsx", "utf8");
  const card = readFileSync(ROOT + "app/components/StampCard.jsx", "utf8");
  const pageSheet = readFileSync(ROOT + "app/components/PageSheet.jsx", "utf8");
  assert.match(view, /\[\["all", "ALL STAMPS", pins\.length\], \["pages", "PAGES", pages\.length\]\]/, "the two sub-pages");
  assert.match(view, /className=\{"sbplus"/, "the + beside the bar");
  assert.match(view, />\+ PAGE</, "a stamp goes on a page from ALL STAMPS");
  assert.match(view, /openSheet\("page", \{ id: pg\.id/, "a page opens in the popup");
  assert.match(sheetSrc, /page: \{ title: "PAGE", render: \(p\) => <PageSheet \{\.\.\.p\} \/>, slim: true \}/, "a page is all cards: its head slim");
  assert.match(pageSheet, /\+ ADD STAMPS/, "stamps go on a page from the page");
  assert.match(css, /\.sbpinart::after, \.sbcover::after \{[^}]*box-shadow: var\(--pp-rim\); \}/, "a bezel round every stamp and cover");
  assert.match(css, /--pp-rim: inset 0 0 0 0\.5px color-mix\(in srgb, var\(--ink\) 16%, transparent\)/, "Apple's thin bezel: a half-pixel edge at low opacity, no glow");
  assert.match(css, /\.sbadd \{ list-style: none; margin: 0; padding: 0; columns: 2;/, "the stamps to add stack in columns too");
  assert.match(pageSheet, /note=\{notes\[p\.key\] \|\| ""\}/, "a stamp's note stays on it inside the page");
  assert.match(card, /className=\{"ppnote" \+ \(value \? " has" : ""\)\}/, "the note's rounded square");
  assert.match(css, /\.ppnote \{ position: absolute; z-index: 2; top: 7px; right: 7px;[^}]*border-radius: 6px;/, "in the top-right corner (owner: \"note should be on right corner\")");
  // ADD STAMP's three rules, kept by the bar's + mode
  assert.match(view, /aria-label="what will be stamped"/); assert.match(view, />UNDO</);
  assert.match(view, /public taste influence \(a follow of their room\) — never their location or anything private/);
  assert.match(view, /pages and notes live on this device for now/, "says where pages live");
});
