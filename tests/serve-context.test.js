// tests/serve-context.test.js — server-stamped slot/zone on events (r24,
// audit #27).
//
// The claim under test is a SECURITY claim as much as a measurement one:
// position context is written by the server from its own record of the serve,
// and there is no path by which a client can supply it. Two ways that could
// silently stop being true — a field read off `item` instead of the serve
// record, or a null context quietly defaulting to slot 0 — and both are
// asserted against directly, because both would produce a histogram that
// looks perfectly healthy and is fiction.

import test from "node:test";
import assert from "node:assert/strict";

import { recordServe, serveContextFor, SERVE_ZONES } from "../lib/brain/index.js";
import { eventFromInteraction } from "../lib/events/index.js";
import { logSearch, SERVED_IDS_CAP } from "../lib/search/index.js";
import { listSearchLogs } from "../lib/db/production.js";

const SLATE = [
  { id: "a", brand: "A", _bridge: "alpha", _zone: "core" },
  { id: "b", brand: "B", _bridge: "gamma", _zone: "core" },
  { id: "c", brand: "C", _bridge: "discovery-adjacent", _zone: "discovery" },
  { id: "d", brand: "D", _bridge: "reach", _zone: "reach" },
];
const blank = () => ({ long: {}, session: {}, _meta: {} });

// ---- the record -------------------------------------------------------------

test("recordServe writes the slot and zone of every served item", () => {
  const p = recordServe(blank(), "serve-1", SLATE);
  assert.deepEqual(p._meta.lastServe.slots, { a: 0, b: 1, c: 2, d: 3 });
  assert.deepEqual(p._meta.lastServe.zones, { a: "core", b: "core", c: "discovery", d: "reach" });
  assert.equal(p._meta.lastServe.id, "serve-1");
  assert.equal(p._meta.lastServe.reported, false);
  // the r19 bridge record is untouched
  assert.equal(p._meta.lastServe.bridges.b, "gamma");
});

test("serveContextFor returns what the server remembers", () => {
  const p = recordServe(blank(), "serve-1", SLATE);
  assert.deepEqual(serveContextFor(p, "c"), { slot: 2, zone: "discovery", bridge: "discovery-adjacent", serveId: "serve-1" });
  assert.equal(serveContextFor(p, "a").slot, 0, "slot 0 is a real slot, not a falsy absence");
});

test("an item the server does not remember serving gets NO context", () => {
  const p = recordServe(blank(), "serve-1", SLATE);
  assert.equal(serveContextFor(p, "never-served"), null,
    "an interaction from a modal, a shared link or a page ago must not be assigned a position");
  assert.equal(serveContextFor(blank(), "a"), null, "no serve recorded at all");
  assert.equal(serveContextFor(p, ""), null);
});

test("a pre-r24 serve record reports its bridge and stays silent on position", () => {
  // What a profile written by the previous release looks like: bridges, no
  // slots. Guessing 0 here would put every legacy interaction in the top slot
  // and manufacture exactly the position bias the histogram exists to expose.
  const legacy = blank();
  legacy._meta.lastServe = { id: "old", bridges: { a: "alpha" }, reported: false };
  const ctx = serveContextFor(legacy, "a");
  assert.equal(ctx.slot, null, "an unrecorded slot must be null, never 0");
  assert.equal(ctx.bridge, "alpha");
});

test("a repeated id keeps the position the reader reached first", () => {
  const p = recordServe(blank(), "s", [SLATE[0], SLATE[1], { id: "a", _bridge: "delta", _zone: "reach" }]);
  assert.equal(p._meta.lastServe.slots.a, 0);
  assert.equal(p._meta.lastServe.zones.a, "core");
});

// ---- the stamp --------------------------------------------------------------

test("events carry the server's slot and zone for feed-sourced interactions", () => {
  const p = recordServe(blank(), "serve-1", SLATE);
  const ev = eventFromInteraction("u1", "favorite", { id: "c", brand: "C" }, null, serveContextFor(p, "c"));
  assert.equal(ev.payload.slot, 2);
  assert.equal(ev.payload.zone, "discovery");
  assert.equal(ev.payload.bridge, "discovery-adjacent");
  assert.equal(ev.payload.itemId, "c");
});

test("events carry NO slot or zone when there is no serve context", () => {
  const ev = eventFromInteraction("u1", "favorite", { id: "x", brand: "X" }, null, null);
  assert.equal("slot" in ev.payload, false, "absent must mean absent, not 0");
  assert.equal("zone" in ev.payload, false);
});

test("A CLIENT CANNOT FORGE POSITION — nothing on `item` becomes slot or zone", () => {
  // Everything a client might try, on the object that actually passes through
  // the request body.
  const hostile = {
    id: "a", brand: "A",
    slot: 0, zone: "core", _slot: 0, _zone: "core",
    payload: { slot: 0, zone: "core" },
  };
  const ev = eventFromInteraction("u1", "favorite", hostile, null, null);
  assert.equal("slot" in ev.payload, false, "a client-supplied slot must never be stored");
  assert.equal("zone" in ev.payload, false, "a client-supplied zone must never be stored");

  // And when the server DOES have a record, the server's value is the one
  // stored — the client's claim of slot 0 loses to the recorded slot 3.
  const p = recordServe(blank(), "serve-1", SLATE);
  const stamped = eventFromInteraction("u1", "favorite", { ...hostile, id: "d" }, null, serveContextFor(p, "d"));
  assert.equal(stamped.payload.slot, 3);
  assert.equal(stamped.payload.zone, "reach");
});

test("a server-recorded bridge outranks the client-reported one", () => {
  const p = recordServe(blank(), "serve-1", SLATE);
  const ev = eventFromInteraction("u1", "bag", { id: "b", brand: "B", _bridge: "alpha" }, null, serveContextFor(p, "b"));
  assert.equal(ev.payload.bridge, "gamma", "same fact, better source");
});

test("out-of-range slots and unknown zones are dropped, not stored", () => {
  const bad = [
    { slot: -1, zone: "core" }, { slot: 1000, zone: "core" }, { slot: 1.5, zone: "core" },
    { slot: "2", zone: "core" }, { slot: null, zone: "core" },
  ];
  for (const ctx of bad) {
    const ev = eventFromInteraction("u1", "favorite", { id: "a" }, null, ctx);
    assert.equal("slot" in ev.payload, false, `slot ${JSON.stringify(ctx.slot)} must be rejected`);
    assert.equal(ev.payload.zone, "core", "the zone half is judged on its own merits");
  }
  for (const zone of ["", "CORE", "sponsored", "reach ", null, 7]) {
    const ev = eventFromInteraction("u1", "favorite", { id: "a" }, null, { slot: 1, zone });
    assert.equal("zone" in ev.payload, false, `zone ${JSON.stringify(zone)} must be rejected`);
    assert.equal(ev.payload.slot, 1);
  }
});

test("every zone the feed can produce survives the whitelist", () => {
  for (const zone of SERVE_ZONES) {
    const ev = eventFromInteraction("u1", "favorite", { id: "a" }, null, { slot: 0, zone });
    assert.equal(ev.payload.zone, zone, `the assembler produces ${zone}; the whitelist must accept it`);
  }
});

// ---- the route's own composition -------------------------------------------

test("the serve → interact path stamps every slot of a page, in order", () => {
  // Exactly what app/api/interaction/route.js does: read the stored profile,
  // resolve context per item, build the event. Composed here so the invariant
  // is provable without a live server.
  const page = Array.from({ length: 60 }, (_, i) => ({
    id: `it-${i}`, brand: `b${i % 7}`,
    _bridge: i % 5 === 4 ? "discovery-adjacent" : "alpha",
    _zone: i % 5 === 4 ? "discovery" : "core",
  }));
  const profile = recordServe(blank(), "serve-page", page);
  const events = page.map((it) =>
    eventFromInteraction("u1", "favorite", { id: it.id, brand: it.brand }, null, serveContextFor(profile, it.id)));
  assert.deepEqual(events.map((e) => e.payload.slot), page.map((_, i) => i));
  assert.equal(events.filter((e) => e.payload.zone === "discovery").length, 12);
  assert.ok(events.every((e) => e.payload.slot >= 0 && e.payload.slot < 60));
});

test("the stamped data supports a slot histogram — the point of the round", () => {
  const page = Array.from({ length: 24 }, (_, i) => ({ id: `s-${i}`, _bridge: "alpha", _zone: "core" }));
  const profile = recordServe(blank(), "s", page);
  // A cohort whose engagement decays with position, the shape #27 says must
  // become correctable. If the histogram cannot recover a gradient that IS
  // there, the logged field is decoration.
  const hist = new Array(24).fill(0);
  for (let reader = 0; reader < 100; reader++) {
    for (let slot = 0; slot < 24; slot++) {
      if ((reader % 24) >= slot) {           // deterministic decay, no RNG
        const ev = eventFromInteraction(`u${reader}`, "favorite", { id: `s-${slot}` }, null, serveContextFor(profile, `s-${slot}`));
        hist[ev.payload.slot] += 1;
      }
    }
  }
  assert.ok(hist[0] > hist[23], `top slot must out-engage the bottom: ${hist[0]} vs ${hist[23]}`);
  assert.ok(hist.every((v, i) => i === 0 || v <= hist[i - 1]), "the recovered curve must be monotone, as injected");
  assert.equal(new Set(hist).size > 1, true, "a one-valued histogram cannot de-bias anything");
});

// ---- per-search exposure ----------------------------------------------------

test("a search logs the ids it actually served, in order and bounded", async () => {
  const results = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` }));
  logSearch("quiet luxury", results, "u1", { intent: "text" }, { servedIds: results.map((r) => r.id) });
  const [row] = await listSearchLogs({ limit: 1 });
  assert.deepEqual(row.servedIds, ["r0", "r1", "r2", "r3", "r4"]);
  assert.equal(row.resultCount, 5);
});

test("served ids are capped and non-strings dropped", async () => {
  const many = Array.from({ length: SERVED_IDS_CAP + 50 }, (_, i) => `x${i}`);
  logSearch("q", [], "u1", null, { servedIds: [...many, null, 7, "", { id: "no" }] });
  const [row] = await listSearchLogs({ limit: 1 });
  assert.equal(row.servedIds.length, SERVED_IDS_CAP);
  assert.ok(row.servedIds.every((id) => typeof id === "string" && id));
});

test("a search with no served ids records null, not an empty exposure", async () => {
  logSearch("q", [], "u1", null, {});
  const [row] = await listSearchLogs({ limit: 1 });
  assert.equal(row.servedIds, null,
    "an unrecorded exposure and an empty one are different facts");
});
