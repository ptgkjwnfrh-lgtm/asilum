// tests/feed-types.test.js — THE ONE FEED's card law (V.2 Blueprint, 17 Oct
// 2026): the eight types, the blueprint weights, the ECHO clock and the
// braid. Pure. The packing's own tests are tests/feed-tetris.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pieceName, brdcstMoment, brdcstWhen, priceLine, offerMode, postType, weightOf, echoLive, echoRail, braid, WEIGHT, ECHO_TTL_MS, TYPES } from "../lib/feed/types.js";

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

test("the blueprint's weights stand (the packing is lib/feed/tetris.js since 25 Oct 2026)", () => {
  assert.equal(WEIGHT.STILL, 0.7); assert.equal(WEIGHT.MOTION, 0.7); assert.equal(WEIGHT["MEDIA+BRDCST"], 0.75);
  assert.equal(WEIGHT.LISTING, 0.45); assert.equal(WEIGHT.PLACE, 0.2); assert.equal(WEIGHT.SONG, 0.2); assert.equal(WEIGHT.BRDCST, 0.1);
  assert.equal(weightOf({ __post: post({ imageUrl: "/x.jpg", attachments: { event: { id: "e" } } }) }), 0.75, "media plus BRDCST is the heaviest");
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

test("slice 14: the footer's date line, the price line and what OFFER does (owner's references, 18 Oct)", () => {
  assert.equal(brdcstMoment("2026-10-31"), "OCTOBER 31st", "a date-only string never drifts by zone");
  assert.equal(brdcstMoment("2026-10-31T22:30:00.000Z"), "OCTOBER 31st 10:30 pm");
  assert.equal(brdcstMoment("2026-10-31T22:30:00.000Z", { tz: "America/New_York" }), "OCTOBER 31st 6:30 pm", "the event's own zone");
  assert.equal(brdcstMoment("2026-11-02"), "NOVEMBER 2nd"); assert.equal(brdcstMoment("2026-11-13"), "NOVEMBER 13th"); assert.equal(brdcstMoment("2026-11-23"), "NOVEMBER 23rd");
  assert.equal(brdcstMoment("nonsense"), ""); assert.equal(brdcstMoment(null), "");
  assert.equal(brdcstWhen({ startsAt: "2026-09-23", endsAt: "2026-09-25" }), "SEPTEMBER 23rd → SEPTEMBER 25th");
  assert.equal(brdcstWhen({ startsAt: "2026-09-23", endsAt: "2026-09-23" }), "SEPTEMBER 23rd");
  assert.equal(priceLine({ price: 35, currency: "USD" }), "35.00 USD");
  assert.equal(priceLine({ price: "120.5" }), "120.50 USD");
  assert.equal(priceLine({ price: null }), null);
  assert.equal(offerMode({ commerce_rail: "native" }).mode, "native");
  assert.equal(offerMode({ acceptOffers: true, ownerId: "u1" }).mode, "wardrobe");
  assert.equal(offerMode({ acceptOffers: false, ownerId: "u1" }).mode, "none");
  assert.equal(offerMode({ id: "ebay-1" }).mode, "none", "an external listing: quiet, never a dead button");
  assert.ok(offerMode({ id: "x" }).reason.length > 10, "a quiet OFFER says why");
  assert.equal(pieceName({ brand: "Clark's", title: "Vintage fisherman knit sweater" }), "Clark's: Vintage fisherman knit sweater");
  assert.equal(pieceName({ brand: "Visvim", title: "Visvim – chore coat" }), "Visvim: chore coat", "a title that repeats the brand is not doubled");
  assert.equal(pieceName({ brand: "", title: "a coat" }), "a coat");
});
