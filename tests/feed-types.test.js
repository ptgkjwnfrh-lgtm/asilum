// tests/feed-types.test.js — THE ONE FEED's card law (V.2 Blueprint, 17 Oct
// 2026): the eight types, the Tetris weights and spans, the ECHO clock and
// the braid. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { postType, weightOf, spanOf, packFeed, echoLive, echoRail, braid, WEIGHT, FULL_AT, ECHO_TTL_MS, TYPES } from "../lib/feed/types.js";

const post = (extra = {}) => ({ id: "p1", serverId: 1, handle: "a", at: 1000, text: "x", attachments: {}, ...extra });

test("the eight types and how a post earns one", () => {
  assert.deepEqual(TYPES, ["TRANSM", "STILL", "MOTION", "BRDCST", "LISTING", "ECHO", "PLACE", "SONG"]);
  assert.equal(postType(post()), "TRANSM");
  assert.equal(postType(post({ imageUrl: "/x.jpg" })), "STILL");
  assert.equal(postType(post({ attachments: { media: [{ path: "a" }] } })), "STILL");
  assert.equal(postType(post({ postKind: "video" })), "MOTION");
  assert.equal(postType(post({ attachments: { event: { id: "e" } } })), "BRDCST", "an event with no media is a standalone BRDCST");
  assert.equal(postType(post({ attachments: { event: { id: "e" }, media: [{ path: "a" }] } })), "STILL", "media with an event is media");
  assert.equal(postType(post({ attachments: { echo: { expiresAt: 1 } } })), "ECHO");
  assert.equal(postType(null), "TRANSM");
});

test("Tetris weights follow the blueprint and decide the span", () => {
  assert.equal(WEIGHT.STILL, 0.7); assert.equal(WEIGHT.MOTION, 0.7); assert.equal(WEIGHT["MEDIA+BRDCST"], 0.75);
  assert.equal(WEIGHT.LISTING, 0.45); assert.equal(WEIGHT.PLACE, 0.2); assert.equal(WEIGHT.SONG, 0.2); assert.equal(WEIGHT.BRDCST, 0.1);
  assert.equal(FULL_AT, 0.7);
  assert.equal(weightOf({ __post: post({ imageUrl: "/x.jpg", attachments: { event: { id: "e" } } }) }), 0.75, "media plus BRDCST is the heaviest");
  assert.equal(spanOf({ __post: post({ imageUrl: "/x.jpg" }) }), "full");
  assert.equal(spanOf({ id: "piece" }), "column", "a LISTING takes one column");
  assert.equal(spanOf({ __place: { id: "pl" } }), "compact");
  assert.equal(spanOf({ __post: post() }), "column", "a TRANSM takes one column");
});

test("packFeed: runs of column cards become one grid; a full card breaks it; a standalone BRDCST is a strip", () => {
  const list = [
    { id: "a" }, { id: "b" },
    { id: "s", __post: post({ imageUrl: "/x.jpg" }) },
    { id: "c" }, { id: "pl", __place: { id: "pl" } },
    { id: "e", __post: post({ attachments: { event: { id: "e" } } }) },
    { id: "d" },
  ];
  const segs = packFeed(list);
  assert.deepEqual(segs.map((s) => s.kind), ["grid", "full", "grid", "strip", "grid"]);
  assert.deepEqual(segs[0].items.map((x) => x.id), ["a", "b"]);
  assert.equal(segs[1].item.id, "s");
  assert.deepEqual(segs[2].items.map((x) => x.id), ["c", "pl"]);
  assert.equal(segs[3].item.id, "e");
  assert.deepEqual(packFeed([]), []);
});

test("ECHO: 24 hours by default, never live after expiry, never an echo without the mark", () => {
  assert.equal(ECHO_TTL_MS, 86_400_000);
  const now = 10_000;
  assert.equal(echoLive(post({ attachments: { echo: { expiresAt: now + 1 } } }), now), true);
  assert.equal(echoLive(post({ attachments: { echo: { expiresAt: now } } }), now), false, "expiry is exclusive");
  assert.equal(echoLive(post(), now), false);
  assert.equal(echoLive(post({ attachments: { echo: { expiresAt: "soon" } } }), now), false);
});

test("the ECHO rail groups live echoes by author, latest first; the braid keeps echoes off the stream", () => {
  const now = 10_000;
  const e = (handle, at, exp = now + 100) => post({ id: handle + at, serverId: at, handle, name: handle.toUpperCase(), at, attachments: { echo: { expiresAt: exp } } });
  const rail = echoRail([e("a", 1), e("b", 5), e("a", 3), e("c", 9, now - 1), post({ handle: "d", at: 99 })], now);
  assert.deepEqual(rail.map((g) => g.handle), ["b", "a"], "c has expired; d is not an echo");
  assert.deepEqual(rail[1].echoes.map((x) => x.at), [3, 1]);
  const pieces = Array.from({ length: 9 }, (_, i) => ({ id: "i" + i }));
  const out = braid(pieces, [e("a", 1), post({ id: "t", serverId: 7 })], [{ id: "pl" }]);
  assert.ok(!out.some((x) => x.__post && x.__post.attachments.echo), "no echo in the stream");
  assert.equal(out.filter((x) => x.__post).length, 1);
  assert.equal(out.filter((x) => x.__place).length, 1, "a place after the ninth piece");
  assert.equal(out[3].id, "post:7", "the first post after the third piece");
});
