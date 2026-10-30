// tests/helpers/dm-offer-row-scenario.mjs — THE OFFER ROW, TWO BACKENDS (owner's
// messages sketch, 28 Oct 2026). DATABASE_URL empty runs the memory store, set
// runs Postgres (CI applies every staged migration, v70 included); one JSON line
// both runs must agree on. The inbox read attaches latestOffersForConversations
// to each thread, and the row's words are rowPreview's — both are exercised
// here on offers opened through the real store. The Postgres run writes
// run-unique rows (three Wardrobe pieces and their offers) and leaves them.
import { randomUUID } from "node:crypto";
import * as M from "../../lib/db/production/money.js";
import { createWardrobeItem } from "../../lib/db/production/interpretation.js";
import { rowPreview } from "../../lib/dm-desk.js";

const owner = "sb-" + randomUUID();
const buyer = "sb-" + randomUUID();
const stranger = "sb-" + randomUUID();
const [c1, c2, c3, cNone] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const T0 = Date.parse("2026-10-20T00:00:00Z");
const D = 86_400_000, H = 3_600_000;
const out = {};
const piece = async (name) => {
  const w = await createWardrobeItem({ userId: owner, source: "manual", title: `offer-row ${name} ${owner.slice(3, 9)}`, colors: [], tags: {} });
  await M.setAcceptOffers({ ownerId: owner, itemId: String(w.item.id), on: true, now: T0 });
  return String(w.item.id);
};
const strip = (all) => Object.fromEntries(Object.entries(all).map(([c, o]) => [c === c1 ? "c1" : c === c2 ? "c2" : c === c3 ? "c3" : c === cNone ? "cNone" : "unknown", o]));
try {
  const a = await piece("a"), b = await piece("b"), c = await piece("c"), d = await piece("d");
  // c1: a declined offer, then (after the cooldown) a newer open one in the same thread
  const first = await M.openWardrobeOffer({ itemId: a, buyerId: buyer, amountCents: 2000, conversationId: c1, viaMessage: true, now: T0 });
  await M.respondWardrobeOffer({ offerId: first.id, ownerId: owner, decision: "decline", now: T0 + H });
  await M.openWardrobeOffer({ itemId: a, buyerId: buyer, amountCents: 2550, conversationId: c1, viaMessage: true, now: T0 + 15 * D });
  // c2: two offers at the same instant on two pieces — the tie is broken by id, the same way in both backends
  const tieB = await M.openWardrobeOffer({ itemId: b, buyerId: buyer, amountCents: 1000, conversationId: c2, viaMessage: true, now: T0 + 15 * D });
  const tieC = await M.openWardrobeOffer({ itemId: c, buyerId: buyer, amountCents: 1100, conversationId: c2, viaMessage: true, now: T0 + 15 * D });
  const tieWinner = tieB.id > tieC.id ? 1000 : 1100;
  // c3: a negotiation between the owner and someone else — the buyer is not party to it
  await M.openWardrobeOffer({ itemId: d, buyerId: stranger, amountCents: 7000, conversationId: c3, viaMessage: true, now: T0 + 15 * D });
  const now = T0 + 15 * D + 2 * H;
  const asBuyer = await M.latestOffersForConversations({ viewerId: buyer, conversationIds: [c1, c2, c3, cNone], now });
  const asOwner = await M.latestOffersForConversations({ viewerId: owner, conversationIds: [c1, c2, c3, cNone], now: T0 + 18 * D });
  const asStranger = await M.latestOffersForConversations({ viewerId: stranger, conversationIds: [c1, c2], now });
  out.buyerKeys = Object.keys(strip(asBuyer)).sort();
  out.buyerC1 = strip(asBuyer).c1;
  out.buyerC2 = { tieWinner: strip(asBuyer).c2.amountCents === tieWinner, side: strip(asBuyer).c2.side };
  out.ownerKeys = Object.keys(strip(asOwner)).sort();
  out.ownerC1 = strip(asOwner).c1;
  out.ownerC3 = strip(asOwner).c3;
  out.strangerSeesNothing = Object.keys(asStranger).length === 0;
  // the row as the page prints it, from the store's answer
  const lastMessage = new Date(T0 + 15 * D - H).toISOString(), laterReply = new Date(T0 + 16 * D).toISOString();
  out.rows = {
    buyer: rowPreview({ folder: "inbox", lastActivityAt: lastMessage, preview: "is it still around?", offer: asBuyer[c1] }).text,
    owner: rowPreview({ folder: "inbox", lastActivityAt: lastMessage, preview: "is it still around?", offer: asOwner[c1] }).text,
    afterReply: rowPreview({ folder: "inbox", lastActivityAt: laterReply, preview: "deal", offer: asBuyer[c1] }).text,
    requests: rowPreview({ folder: "requests", lastActivityAt: lastMessage, preview: null, offer: asBuyer[c1] }).kind,
  };
} catch (err) {
  out.error = String(err && err.message || err) + (err && err.code ? ` [${err.code}]` : "");
}
process.stdout.write(JSON.stringify(out) + "\n");
