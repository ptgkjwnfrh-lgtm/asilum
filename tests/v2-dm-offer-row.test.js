// tests/v2-dm-offer-row.test.js — THE OFFER ROW (owner's messages sketch, 28 Oct
// 2026: a row that reads ":SENT AN OFFER OF $25.50" with a boxed ↖ arrow).
//
// Declared before measuring:
//   - money is whole cents printed as dollars by integer arithmetic: $25.50,
//     $0.05, $1,250.00; anything not a positive whole number of cents is null,
//     never a guessed price;
//   - a row whose newest Wardrobe offer is its latest activity reads
//     "SENT AN OFFER OF $X.XX" for the buyer and "RECEIVED AN OFFER OF $X.XX"
//     for the owner; a closed offer names its state after the price;
//   - a reply after the offer wins (the row reads the words), an offer in
//     REQUESTS is never shown, and an offer it cannot read falls back to words;
//   - the row's age is read from whichever it shows;
//   - the store read keeps the viewer to offers they are party to, and the
//     memory backend answers the same as Postgres (the differential is in
//     tests/postgres-integration.test.js; this runs the memory half).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offerDollars, rowPreview } from "../lib/dm-desk.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("the money, as the sketch prints it", () => {
  assert.equal(offerDollars(2550), "$25.50", "the sketch's own row");
  assert.equal(offerDollars(2500), "$25.00");
  assert.equal(offerDollars(5), "$0.05");
  assert.equal(offerDollars(99), "$0.99");
  assert.equal(offerDollars(100), "$1.00");
  assert.equal(offerDollars(125000), "$1,250.00");
  assert.equal(offerDollars(123456789), "$1,234,567.89");
  assert.equal(offerDollars("2550"), "$25.50", "a numeric string reads too");
  for (const bad of [0, -100, 25.5, NaN, Infinity, null, undefined, "", "abc", true, {}, 2 ** 60]) {
    assert.equal(offerDollars(bad), null, `no price for ${String(bad)}`);
  }
});

const T = "2026-10-28T10:00:00.000Z", LATER = "2026-10-28T11:00:00.000Z", EARLIER = "2026-10-28T09:00:00.000Z";
const row = (offer, over = {}) => ({ id: "c1", folder: "inbox", lastActivityAt: T, preview: "still have it?", offer, ...over });

test("the row's wording", () => {
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: LATER })),
    { kind: "offer", text: "SENT AN OFFER OF $25.50", side: "SENT", lead: "AN OFFER OF", amount: "$25.50", state: null, at: LATER });
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "received", state: "open", at: LATER })),
    { kind: "offer", text: "RECEIVED AN OFFER OF $25.50", side: "RECEIVED", lead: "AN OFFER OF", amount: "$25.50", state: null, at: LATER });
  const closed = rowPreview(row({ amountCents: 125000, side: "sent", state: "declined", at: LATER }));
  assert.deepEqual([closed.side, closed.lead, closed.amount, closed.state], ["SENT", "AN OFFER OF", "$1,250.00", "DECLINED"], "the parts are the text");
  assert.equal(closed.text, [closed.side, closed.lead, closed.amount, "·", closed.state].join(" "));
  assert.equal(rowPreview(row({ amountCents: 2550, side: "sent", state: "someday", at: LATER })).state, null, "an unknown state is not named");
  assert.equal(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: T })).kind, "offer", "an offer at the same instant as the last message is the latest");
  assert.equal(rowPreview(row({ amountCents: 9000, side: "received", state: "declined", at: LATER })).text, "RECEIVED AN OFFER OF $90.00 · DECLINED");
  assert.equal(rowPreview(row({ amountCents: 9000, side: "sent", state: "expired", at: LATER })).text, "SENT AN OFFER OF $90.00 · EXPIRED");
  assert.equal(rowPreview(row({ amountCents: 9000, side: "sent", state: "accepted", at: LATER })).text, "SENT AN OFFER OF $90.00 · ACCEPTED");
  assert.equal(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: LATER }, { lastActivityAt: null })).kind, "offer", "no message time: the offer is the activity");
});

test("when the row reads its words instead", () => {
  const words = { kind: "words", text: "still have it?", at: T };
  assert.deepEqual(rowPreview(row(null)), words, "no offer");
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: EARLIER })), words, "a reply after the offer is the latest thing");
  assert.deepEqual(rowPreview(row({ amountCents: 0, side: "sent", state: "open", at: LATER })), words, "an unreadable amount is not printed");
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "owner", state: "open", at: LATER })), words, "an unknown side is not guessed");
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: "whenever" })), words, "an unreadable time is not the latest");
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: "whenever" }, { lastActivityAt: null })),
    { kind: "words", text: "still have it?", at: null }, "nor when there is no message time to compare it with");
  assert.deepEqual(rowPreview(row({ amountCents: 2550, side: "sent", state: "open", at: LATER }, { folder: "requests", preview: null })),
    { kind: "none", text: null, at: T }, "no offer, and no words, in REQUESTS");
  assert.equal(rowPreview(row(null, { folder: "requests" })).kind, "none", "a stray preview in REQUESTS is not shown either");
  assert.equal(rowPreview(row(null, { preview: "x".repeat(200) })).text.length, 90);
  assert.equal(rowPreview(row(null, { preview: null })).kind, "none");
  assert.equal(rowPreview(undefined).kind, "none");
});

test("the page row is drawn from rowPreview, with the boxed arrow", () => {
  const desk = strip(read("app/components/MailDesk.jsx"));
  const from = desk.indexOf('<ul className="dmlist">');
  const rows = desk.slice(from, desk.indexOf('<ul className="maillist">', from));
  assert.ok(from > 0 && rows.length > 0, "the page list is found");
  assert.match(rows, /const line = rowPreview\(c\);/);
  assert.match(rows, /agoWords\(line\.at\)/, "the age is read from what the row shows");
  assert.match(rows, /<Icon name="offer"/);
  assert.match(rows, /<span className="dmofferhead"><i aria-hidden="true">:<\/i><b className="dmofferside">\{line\.side\}<\/b><span className="dmofferlead">\{line\.lead\}<\/span><\/span>\s*<span className="dmofferprice">\s*<b className="dmofferamt">\{line\.amount\}<\/b>/);
  assert.match(rows, /aria-label=\{line\.text\}/, "read aloud as one sentence");
  assert.ok(!/c\.preview/.test(rows), "the page row reads nothing around rowPreview");
  const icons = read("app/components/Icons.jsx");
  assert.match(icons, /^  offer: <g \{\.\.\.P\}><rect [^\n]*<path d="M16 16L8\.4 8\.4[^"]*" \/><\/g>,$/m, "a box and an arrow up-left, in the house stroke");
  const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/\.(?:dmprev\.dmoffer|dmoffer[a-z]+)[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(rules.length >= 4, "the offer row has its rules");
  for (const r of rules) assert.ok(!/#[0-9a-f]{3,8}\b|rgb|hsl/i.test(r), "colours only through tokens: " + r);
  assert.match(css, /\.dmofferlead \{ min-width: 0; overflow: hidden; text-overflow: ellipsis;/, "the lead gives way");
  assert.match(css, /\.dmprev\.dmoffer \{ display: flex; flex-wrap: wrap;/, "a narrow row takes a second line rather than cut the price");
  assert.match(css, /\.dmofferprice \{ flex: none;[^}]*white-space: nowrap;/, "the price never gives way");
  assert.match(css, /\.dmofferside \{ flex: none;/, "nor who sent it");
});

test("the store read: newest per conversation, only the viewer's, side and state now (memory)", async () => {
  const { latestOffersForConversations } = await import("../lib/db/production/money.js");
  const { mem } = await import("../lib/db/production/store.js");
  const owner = "sb-00000000-0000-4000-8000-0000000000a1", buyer = "sb-00000000-0000-4000-8000-0000000000b2", stranger = "sb-00000000-0000-4000-8000-0000000000c3";
  const c1 = "11111111-1111-4111-8111-111111111111", c2 = "22222222-2222-4222-8222-222222222222", c3 = "33333333-3333-4333-8333-333333333333";
  const T0 = Date.parse("2026-10-20T00:00:00Z"), H = 3_600_000;
  const put = (id, conv, cents, at, over = {}) => mem.wardrobeOffers.set(id, { id, item_id: "1", owner_id: owner, buyer_id: buyer, conversation_id: conv, amount_cents: cents, state: "open", expires_at: new Date(at + 48 * H).toISOString(), accepted_until: null, order_id: null, responded_at: null, created_at: new Date(at).toISOString(), ...over });
  put("o-old", c1, 2000, T0, { state: "declined" });
  put("o-new", c1, 2550, T0 + H);
  put("o-tie-a", c2, 1000, T0);
  put("o-tie-b", c2, 1100, T0);
  put("o-other", c3, 5000, T0, { buyer_id: stranger });
  try {
    const asBuyer = await latestOffersForConversations({ viewerId: buyer, conversationIds: [c1, c2, c3, c1], now: T0 + 2 * H });
    assert.deepEqual(asBuyer, {
      [c1]: { amountCents: 2550, side: "sent", state: "open", at: new Date(T0 + H).toISOString() },
      [c2]: { amountCents: 1100, side: "sent", state: "open", at: new Date(T0).toISOString() },
    }, "the newest, a tie broken by id, and nothing from a negotiation the viewer is not in");
    const asOwner = await latestOffersForConversations({ viewerId: owner, conversationIds: [c1, c3], now: T0 + 60 * H });
    assert.deepEqual(asOwner[c1], { amountCents: 2550, side: "received", state: "expired", at: new Date(T0 + H).toISOString() }, "the owner received it, and past its window it is expired");
    assert.equal(asOwner[c3].side, "received");
    assert.deepEqual(await latestOffersForConversations({ viewerId: "", conversationIds: [c1] }), {});
    assert.deepEqual(await latestOffersForConversations({ viewerId: buyer, conversationIds: [] }), {});
  } finally {
    for (const id of ["o-old", "o-new", "o-tie-a", "o-tie-b", "o-other"]) mem.wardrobeOffers.delete(id);
  }
});

test("the inbox route attaches the offer, never in REQUESTS, never the parties", () => {
  const route = strip(read("app/api/dm/route.js"));
  const inbox = route.slice(route.indexOf('if (op === "inbox")'), route.indexOf('if (op === "thread")'));
  assert.match(inbox, /if \(folder !== "requests" && page\.items\.length\)/);
  assert.match(inbox, /latestOffersForConversations\(\{ viewerId: "sb-" \+ me, conversationIds: page\.items\.map\(\(i\) => i\.id\) \}\)/);
  assert.match(inbox, /offer: offers\[rest\.id\] \|\| null/);
  assert.match(inbox, /offersRead = false;/, "a failed read is said, not hidden");
});
