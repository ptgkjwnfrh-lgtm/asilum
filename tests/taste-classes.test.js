// One taste, three evidence classes (19 Sep 2026, synergy round).
//
// Law 1: search reads the SAME taste vector the feed, the taste network and
//        the Asterisk memory read — tasteVector's 60/40 blend clamped to ±1 —
//        so a correction lands the same way on every surface.
// Law 2: decay is by evidence class. An explicit choice (keep / explore /
//        reduce on the taste network) never fades because the reader was
//        away; inferred long taste keeps its 6-day half-life; the session
//        vector fades in a day.
// Law 3: a reduce is a recorded choice, named as such by the network, and
//        one undo takes it back.
import test from "node:test";
import assert from "node:assert/strict";
import { getPersonalizedSearchContext } from "../lib/search/index.js";
import { tasteVector, migrateProfile } from "../lib/brain/index.js";
import { saveProfile } from "../lib/db/index.js";
import { applyTimeDecay } from "../lib/brain/memory.js";
import { buildNetwork } from "../lib/taste/network.js";
import { callRoute, loadRoute, newDevice } from "./helpers/route.js";

const DAY = 24 * 60 * 60 * 1000;
const t0 = 1_700_000_000_000;

test("law 1: search's personal vector IS tasteVector — blended and clamped, not summed", async () => {
  const me = newDevice();
  await saveProfile(me.uid, { long: { MINIMAL: 1, GORP: 0.5 }, session: { MINIMAL: 1, TAILORED: 0.5 }, _meta: {} });
  const ctx = await getPersonalizedSearchContext(me.uid);
  assert.ok(ctx);
  assert.equal(ctx.vec.MINIMAL, 1, "0.6 + 0.4 = 1.0, clamped at the ceiling — the old sum gave 2");
  assert.ok(Math.abs(ctx.vec.GORP - 0.3) < 1e-9, "long alone carries 0.6 of its weight");
  assert.ok(Math.abs(ctx.vec.TAILORED - 0.2) < 1e-9, "session alone carries 0.4");
  const brain = tasteVector(migrateProfile({ long: { MINIMAL: 1, GORP: 0.5 }, session: { MINIMAL: 1, TAILORED: 0.5 } }));
  assert.deepEqual(ctx.vec, brain, "byte-identical to what the feed reads");
  process.env.SEARCH_TASTE_BLEND = "0";
  try {
    const legacy = await getPersonalizedSearchContext(me.uid);
    assert.equal(legacy.vec.MINIMAL, 2, "the kill switch restores the old 1:1 sum");
  } finally { delete process.env.SEARCH_TASTE_BLEND; }
  assert.equal(await getPersonalizedSearchContext(null), null);
});

test("law 2: an explicit choice does not fade; inferred long taste keeps 6 days; a session is a day", () => {
  const p = {
    long: { MINIMAL: 0.8, GORP: 0.8 }, session: { TAILORED: 0.6 },
    _meta: { lastActive: t0, manual: { MINIMAL: "2026-09-19T00:00:00.000Z", "MINIMAL:via": "keep" } },
  };
  const { profile: after6, forgotten } = applyTimeDecay(p, t0 + 6 * DAY);
  assert.equal(after6.long.MINIMAL, 0.8, "the tag the reader chose is where they left it");
  assert.ok(Math.abs(after6.long.GORP - 0.4) < 1e-9, "inferred long taste halved at 6 idle days, as before");
  assert.ok((after6.session.TAILORED ?? 0) < 0.02, `the session vector is gone after six days (${after6.session.TAILORED ?? "deleted"})`);
  assert.ok(!forgotten.some((f) => f.tag === "MINIMAL"), "an explicit tag is never logged as forgotten");
  const { profile: after1 } = applyTimeDecay(p, t0 + DAY);
  assert.ok(Math.abs(after1.session.TAILORED - 0.3) < 1e-9, "the session half-life is one idle day");
  assert.ok(after1.long.GORP > 0.7, "one day barely touches inferred long taste");
  // a long idle spell forgets inferred taste but never the choice
  const { profile: afterYear } = applyTimeDecay(p, t0 + 365 * DAY);
  assert.equal(afterYear.long.MINIMAL, 0.8);
  assert.equal(afterYear.long.GORP, undefined, "inferred taste below the floor is forgotten");
  process.env.BRAIN_DECAY_BY_CLASS = "0";
  try {
    const { profile: legacy } = applyTimeDecay(p, t0 + 6 * DAY);
    assert.ok(Math.abs(legacy.long.MINIMAL - 0.4) < 1e-9, "the kill switch restores one half-life for everything");
    assert.ok(Math.abs(legacy.session.TAILORED - 0.3) < 1e-9);
  } finally { delete process.env.BRAIN_DECAY_BY_CLASS; }
});

test("law 3: a reduce is recorded as the reader's act, the network names it, undo takes it back", async () => {
  const route = await loadRoute("app/api/taste/route.js");
  const me = newDevice();
  const keep = await callRoute(route.POST, { path: "/api/taste", cookies: me.cookies, json: { user: me.uid, op: "keep", tag: "MINIMAL" } });
  assert.equal(keep.status, 200, JSON.stringify(keep.body));
  const reduce = await callRoute(route.POST, { path: "/api/taste", cookies: me.cookies, json: { user: me.uid, op: "reduce", tag: "MINIMAL" } });
  assert.equal(reduce.status, 200, JSON.stringify(reduce.body));
  const node = reduce.body.nodes.find((n) => n.tag === "MINIMAL");
  assert.equal(node.kind, "manual");
  assert.ok(node.evidence.some((e) => e.via === "reduce" && /you reduced this/.test(e.what)), JSON.stringify(node.evidence));
  const undo = await callRoute(route.POST, { path: "/api/taste", cookies: me.cookies, json: { user: me.uid, op: "undo" } });
  const back = undo.body.nodes.find((n) => n.tag === "MINIMAL");
  assert.ok(back.evidence.some((e) => e.via === "keep"), "one undo restores the keep");
  // a reduce that empties the tag removes the provenance with it
  const explore = await callRoute(route.POST, { path: "/api/taste", cookies: me.cookies, json: { user: me.uid, op: "explore", tag: "GORP" } });
  assert.equal(explore.status, 200);
  let last = explore;
  for (let i = 0; i < 6; i++) last = await callRoute(route.POST, { path: "/api/taste", cookies: me.cookies, json: { user: me.uid, op: "reduce", tag: "GORP" } });
  const gone = last.body.nodes.find((n) => n.tag === "GORP");
  assert.notEqual(gone.kind, "manual", "a tag reduced to nothing is not 'chosen'");
  const net = buildNetwork({ long: { MINIMAL: 0.3 }, session: {}, _meta: { manual: { MINIMAL: "2026-09-19", "MINIMAL:via": "reduce" } } }, []);
  assert.match(net.nodes.find((n) => n.tag === "MINIMAL").evidence[0].what, /you reduced this on 2026-09-19/);
});
