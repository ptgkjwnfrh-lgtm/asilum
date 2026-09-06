import test from "node:test";
import assert from "node:assert/strict";

import { buildFeed, markSeen, migrateProfile } from "../lib/brain/index.js";
import { makeBots } from "../lib/brain/replay.js";
import { CATALOG } from "../lib/ingest/catalog.js";

// WHAT A HEAVY SCROLLER CAN REACH.
//
// `_meta.seen` is feed rotation memory, capped at SEEN_CAP = 200. The debt
// register described the consequence as "past ~200 pieces served, the oldest
// fall out and can reappear — a heavy scroller loops", which is true and much
// too mild. Measured (scripts/measure-feed-rotation.mjs): the reader is
// confined to roughly a THIRD of the catalog permanently. Not "sees repeats
// sooner" — never shown the other two thirds at all, however long they scroll.
//
// The cause is that the memory is a score penalty rather than an exclusion,
// and it saturates: once 200 items carry the penalty the engine serves the
// next-best 60, those enter memory, 60 others fall out with their penalty
// lifted, and the feed oscillates over one taste-shaped neighbourhood.
//
// This test does not assert the exact number — that would break on any tuning
// change and teach the next person to delete it. It asserts the SHAPE: with an
// unbounded memory a reader reaches the whole catalog, and with the shipped
// cap they reach a small fraction of it. Both halves matter. The second alone
// could be a concentrated engine rather than a memory ceiling; the first is
// what proves the engine will show everything if it can remember what it
// showed.

const PAGES = 25;
const LIMIT = 60;

function reach(remember) {
  const bot = makeBots(1, 11)[0];
  let profile = migrateProfile({ long: { ...bot.latent }, session: {}, _meta: {} });
  const everServed = new Set();
  for (let page = 0; page < PAGES; page++) {
    const { items } = buildFeed({ profile, limit: LIMIT }, CATALOG);
    const ids = items.map((it) => it.id);
    for (const id of ids) everServed.add(id);
    profile = remember(profile, ids);
  }
  return everServed.size;
}

test("rotation memory, not the engine, is what a heavy scroller runs into", () => {
  // markSeen without its .slice(0, SEEN_CAP) — the entire difference.
  const unbounded = reach((p, ids) => {
    const next = migrateProfile(p);
    next._meta.seen = [...ids, ...(next._meta.seen || [])];
    return next;
  });
  const shipped = reach((p, ids) => markSeen(p, ids));

  assert.equal(unbounded, CATALOG.length,
    `with an unbounded memory the reader reaches the whole catalog; saw ${unbounded}/${CATALOG.length}. ` +
    `If this fails the engine itself has become concentrated, and the cap is no longer the story.`);

  assert.ok(shipped < CATALOG.length * 0.5,
    `the shipped cap should still confine this reader to well under half the catalog ` +
    `(measured ~31%); saw ${shipped}/${CATALOG.length}. If this now passes because ` +
    `shipped went UP, the ceiling has been raised or removed — good, and this test ` +
    `should be rewritten to pin the new reach rather than deleted.`);

  // A floor as well as a ceiling: a reader who reached almost nothing would
  // mean something else broke, and the assertion above would pass on it.
  assert.ok(shipped > CATALOG.length * 0.15,
    `the reader should still reach a meaningful slice; saw ${shipped}/${CATALOG.length}`);
});
