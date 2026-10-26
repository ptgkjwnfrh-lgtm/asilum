// tests/live-launch-v2.test.js — the V.2 laws, pinned.
//
// Four destinations; one save record shape; a places register whose fixtures
// are labelled and whose sourced rows are checked; a person-overview lookup
// that tolerates a typo and refuses a tie; a verification desk that never
// turns absent evidence into agreement; a taste network that derives
// evidence kinds it can prove.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
const require_fs = () => nodeFs;
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("the destinations are FEED, PASSPORT and ACCOUNT; the deck keys are FEED and ACCOUNT; the passport is the globe", async () => {
  // V.2 Blueprint (owner, 17 Oct 2026, Foundations): the Central Control
  // Deck is FEED · SEARCH · POST · MESSAGES · ACCOUNT; the Passport Button
  // is a fixture, not a key; Front Cover and Map are no longer tabs.
  const { navFor, deckFor, fixtureFor, ACCOUNT_MENU, currentDestination } = await import("../lib/nav.js");
  const labels = navFor("passport").map((n) => n.label);
  assert.deepEqual(labels, ["FEED", "PASSPORT", "ACCOUNT"]);
  assert.deepEqual(deckFor("passport").map((n) => n.label), ["FEED", "ACCOUNT"], "two routes on the deck");
  assert.equal(fixtureFor("passport", "passport").href, "/board", "the globe opens the passport");
  assert.equal(fixtureFor("business", "passport"), null, "a business has no passport, so no globe");
  assert.deepEqual(deckFor("business").map((n) => n.label), ["FEED", "ANALYTICS"], "a business swaps ACCOUNT for ANALYTICS");
  assert.deepEqual(ACCOUNT_MENU.map((m) => m.href), ["/profile", "/orders", "/settings"]);
  for (const m of ACCOUNT_MENU) assert.ok(!labels.includes(m.label), m.label + " must not be a destination");
  assert.equal(currentDestination("passport", "/stats").label, "PASSPORT");
  assert.equal(currentDestination("passport", "/upload").label, "PASSPORT");
  assert.equal(currentDestination("passport", "/board").label, "PASSPORT");
  assert.equal(currentDestination("passport", "/map").label, "PASSPORT", "the map is the passport's");
  assert.equal(currentDestination("passport", "/").label, "FEED", "the feed is home");
  assert.equal(currentDestination("passport", "/cover").label, "FEED", "the cover is a page under the feed");
  assert.equal(currentDestination("passport", "/hotlist").label, "FEED");
  assert.equal(currentDestination("passport", "/discover").label, "FEED", "global search answers under the feed");
  assert.equal(currentDestination("passport", "/stylist").label, "FEED");
  assert.equal(currentDestination("passport", "/profile").label, "ACCOUNT");
  assert.equal(currentDestination("passport", "/settings").label, "ACCOUNT");
});

test("the places register: fixtures say so, sourced rows carry a source and a check date", async () => {
  const { PLACES, listPlaces, placesCoverage, PLACE_KINDS, distanceKm } = await import("../lib/places/registry.js");
  const cov = placesCoverage();
  assert.equal(cov.holes.length, 0, cov.holes.join("; "));
  assert.ok(cov.sourced >= 2, "at least the two sourced rows");
  for (const p of PLACES) {
    assert.ok(PLACE_KINDS.includes(p.kind));
    if (p.sample) assert.equal(p.organizer, "fictional fixture");
    else { assert.match(p.sourceUrl, /^https:\/\//); assert.match(p.lastChecked, /^\d{4}-\d{2}-\d{2}$/); }
    assert.ok(typeof p.dated === "boolean", "events and places are told apart");
  }
  // nearby sorts by distance and keeps the sample flag
  const near = listPlaces({ near: { lat: 38.9428, lng: -76.7302, km: 60 } });
  assert.ok(near.length >= 3);
  for (let i = 1; i < near.length; i++) assert.ok(near[i].distanceKm >= near[i - 1].distanceKm);
  assert.ok(near.some((p) => p.id === "pgc-fashion-week-2026" && !p.sample));
  // an ended event drops out; a permanent place never does
  const future = listPlaces({ from: "2099-01-01" });
  assert.ok(!future.some((p) => p.dated));
  assert.ok(future.some((p) => !p.dated));
  assert.ok(Math.abs(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.2) < 1);
});

test("the overview lookup tolerates a typo, refuses a single short token, never invents a person", async () => {
  const { findOverview } = await import("../lib/people/overviews.js");
  assert.equal(findOverview("olivier rousteing").id, "olivier-rousteing");
  assert.equal(findOverview("oliver rousteing").id, "olivier-rousteing", "one edit in a 7-letter token");
  assert.equal(findOverview("rousteing").id, "olivier-rousteing", "the surname alone is enough");
  assert.equal(findOverview("black cropped leather jacket"), null, "a garment sentence is not a person");
  assert.equal(findOverview("rick owens"), null, "a designer without a row is simply not here");
  assert.equal(findOverview(""), null);
});

test("the overview's claims each name a source, and the row says it is not an affiliation", async () => {
  const { OVERVIEWS } = await import("../lib/people/overviews.js");
  for (const o of OVERVIEWS) {
    assert.match(o.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
    for (const f of o.facts) assert.ok(o.sources[f.source], `${o.id}: fact "${f.claim}" has no source`);
    assert.match(o.notAffiliated, /not/i);
    assert.ok(!/Balmain's current|current creative director of Balmain/i.test(o.summary));
  }
});

test("the desk: absent evidence is pending, a material disagreement reaches the archivalist, agreement is consistency", async () => {
  const { compareItem, buildDesk, DESK_MODE } = await import("../lib/verification/desk.js");
  assert.equal(DESK_MODE.model, false);
  assert.equal(DESK_MODE.humanLabor, "TBD");
  const silent = compareItem({ id: "x", title: "untitled", category: "" });
  assert.equal(silent.status, "pending");
  assert.ok(silent.fields.every((f) => f.status === "pending"));
  const agree = compareItem({ id: "y", title: "a wool coat in outerwear", category: "outerwear", facets: { material: "wool" } });
  assert.ok(agree.fields.find((f) => f.field === "material").status === "agree");
  assert.equal(agree.status, "agreed");
  const conflict = compareItem({ id: "z", title: "a leather jacket", category: "outerwear", facets: { material: "wool" } });
  assert.equal(conflict.fields.find((f) => f.field === "material").status, "conflict");
  assert.equal(conflict.status, "archivalist", "material is a material field");
  const desk = buildDesk({ limit: 30 });
  assert.equal(desk.total, 30);
  assert.equal(desk.counts.archivalist + desk.counts.flagged + desk.counts.agreed + desk.counts.pending, 30);
});

test("the taste network derives evidence it can prove and undoes one step", async () => {
  const { buildNetwork } = await import("../lib/taste/network.js");
  const empty = buildNetwork({}, []);
  assert.equal(empty.nodes.length, 10);
  assert.ok(empty.nodes.every((n) => n.kind === "none"));
  assert.equal(empty.undo, false);
  const profile = { long: { TAILORED: 0.7, ARCHIVAL: 0.3 }, session: {}, _meta: { manual: { TAILORED: "2026-09-17T00:00:00.000Z", "TAILORED:via": "keep" } } };
  const boards = [{ items: [{ id: 1, tags: { ARCHIVAL: 0.8, MINIMAL: 0.6 } }, { id: 2, tags: { ARCHIVAL: 0.5 } }] }];
  const net = buildNetwork(profile, boards);
  const by = Object.fromEntries(net.nodes.map((n) => [n.tag, n]));
  assert.equal(by.TAILORED.kind, "manual");
  assert.equal(by.ARCHIVAL.kind, "inferred");
  assert.equal(by.ARCHIVAL.saves, 2);
  assert.equal(by.MINIMAL.kind, "inferred", "a save alone is evidence");
  // a curated neighbour of TAILORED that has no reading and no save
  assert.ok(net.nodes.some((n) => n.kind === "curated"), "affinity neighbours are marked curated, never inferred");
  assert.ok(net.edges.length > 0);
});

test("the one save has one record shape and refuses what it cannot list", async () => {
  const { saveRecord, SAVE_KINDS } = await import("../lib/save.js");
  assert.deepEqual([...SAVE_KINDS], ["piece", "post", "person", "place", "event", "article", "artist", "designer", "house"]);
  const r = saveRecord({ kind: "place", id: "palais-galliera", title: "Palais Galliera", meta: "EXHIBITION · Paris" });
  assert.equal(r.kind, "place"); assert.equal(r.item, null); assert.match(r.at, /^\d{4}-/);
  assert.throws(() => saveRecord({ kind: "bag", id: "1", title: "x" }), /unknown save kind/);
  assert.throws(() => saveRecord({ kind: "piece", id: "", title: "x" }), /id and a title/);
});

test("the sample media: every picture is a coloured tile (owner, 25 Oct 2026, last: the original cards), the one clip is the generated pattern, and nothing is a photograph", async () => {
  const { SAMPLE_POSTS } = await import("../lib/model/media.js");
  const { isStill } = await import("../lib/model/stills.js");
  const credits = JSON.parse(read("public/model/credits.json"));
  for (const sp of SAMPLE_POSTS) {
    assert.equal(sp.sample, true);
    if (!sp.image && !sp.video && sp.attachments && sp.attachments.event) { assert.equal(sp.attachments.event.sample, true, sp.id + " is a fixture"); continue; }
    if (sp.video) {
      assert.equal(sp.video.generated, true, sp.id + " must declare itself generated");
      assert.match(sp.video.url, /^\/model\/motion-test-pattern\.mp4$/);
      assert.equal(sp.image, undefined, "a MOTION sample carries no photograph");
      continue;
    }
    for (const im of [sp.image, ...(sp.images || [])]) { assert.ok(isStill(im.src), sp.id + ": a still, not a photograph"); assert.equal(im.credit, "", "nothing to credit"); }
    if (sp.avatar) assert.ok(isStill(sp.avatar), sp.id + ": the author's picture is a still");
  }
  // (26 Oct 2026: more stills and motions) several sample motions, every one the one generated test pattern
  assert.ok(SAMPLE_POSTS.filter((sp) => sp.video).length >= 2, "enough motions for the row of videos you may like");
  const { SAMPLE_MOTION } = await import("../lib/model/media.js");
  assert.ok(SAMPLE_POSTS.filter((sp) => sp.video).every((sp) => sp.video === SAMPLE_MOTION), "no film is invented: each is the generated test pattern");
  // the model folder holds no photographs but the people overview's one portrait and the owner's logo
  // (with, since 26 Oct 2026, the masks cut from it to colour it, logo-word-ink.png and logo-star.png, and
  // logo-word-light.png, its own colours darkened for light mode; "word" since the bar of blocks was cut)
  const files = require_fs().readdirSync("public/model").filter((f) => /\.(jpg|png|webp)$/.test(f)).sort();
  assert.deepEqual(files, ["logo-star.png", "logo-word-ink.png", "logo-word-light.png", "logo.jpg", "olivier-rousteing-2016.jpg"]);
  assert.ok(credits.assets.every((a) => files.includes(a.filename) || /\.(mp4|vtt)$/.test(a.filename)), "the register names only what is there");
  const { PLACES } = await import("../lib/places/registry.js");
  for (const p of PLACES) if (p.image) assert.ok(isStill(p.image), p.id + " wears a still");
  const { MODEL_PIECES, demoImageFor } = await import("../lib/model/pieces.js");
  for (const it of MODEL_PIECES) { assert.equal(it.img, null, it.id + " carries no photograph"); assert.equal(demoImageFor(it), null, "a piece wears its own placeholder card (thumbFor), nothing lent"); }
  const { tileFor, inkFor, INK_LIGHT, INK_DARK } = await import("../lib/model/stills.js");
  assert.equal(tileFor("a").src, tileFor("a").src, "the same key, the same tile"); assert.notEqual(tileFor("a").src, tileFor("b").src);
  assert.equal(inkFor("#1d2430"), INK_LIGHT, "light ink on a dark ground"); assert.equal(inkFor("#e6f1f8"), INK_DARK, "dark ink on a light one");
});

test("no gate before the first reward: the sign-up sheet never opens itself", () => {
  const src = read("app/components/AccountSignup.jsx");
  const auto = src.match(/const maybeAutoShow = \(\) => \{[\s\S]*?\};/);
  assert.ok(auto, "the auto-show hook still exists");
  assert.ok(!/setOpen\(true\)/.test(auto[0]), "maybeAutoShow must not open the sheet");
  const home = read("app/page.js");
  assert.ok(!/if \(!onboarded && [^\n]*setConnectOpen\(true\)/.test(home), "the connect sheet must not open on first visit");
});

test("the five keys are the deck's, read from the deck table; the shell mounts the two fixtures", () => {
  // the deck renders DECK (lib/dock.js) and resolves its two routes through
  // lib/nav.js; the shell mounts the Masthead (the wordmark, the Info Dock's
  // keys and the Passport's globe on one glass strip, 26 Oct 2026), the deck
  // and the one sheet; the old header's marquee, thumb bar and destination
  // row stay gone
  const cc = read("app/components/ControlCenter.jsx");
  const shell = read("app/shell.js");
  assert.ok(/className="tabbar"/.test(cc));
  assert.ok(/DECK\.map\(\(k\) => key\(k\)\)/.test(cc), "the deck renders the DECK table");
  assert.ok(/deckFor\(kind\)/.test(cc), "the deck's routes come from lib/nav.js");
  assert.ok(/<Masthead kind=\{accountKind\} pathname=\{pathname\} \/>/.test(shell), "the shell mounts the Masthead");
  const mast = read("app/components/Masthead.jsx");
  assert.ok(/<InfoDock \/>/.test(mast), "the Masthead carries the Info Dock's keys");
  assert.ok(/<PassportButton kind=\{kind\} pathname=\{pathname\} \/>/.test(mast), "and the Passport's globe");
  assert.ok(/<ControlCenter kind=\{accountKind\} pathname=\{pathname\} \/>/.test(shell), "the shell mounts the deck");
  assert.ok(/<SheetHost \/>/.test(shell), "the shell mounts the one sheet");
  assert.ok(!/className="topnav"/.test(shell), "no destination row");
  assert.ok(!/className="tophead/.test(shell), "no header");
  assert.ok(!/os-crt/.test(shell), "no CRT layer");
});
