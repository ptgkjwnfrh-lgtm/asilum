// lib/orders/bought.js — WHAT A PASSENGER BOUGHT, one definition for every reader (the purchase globe on
// /upload, the Passport's stamps): a PAID sale order, or a purchase ticket the passenger reported as bought /
// kept / returned (each of those means the piece was bought; "not-bought" does not). A ticket-fee order pays
// ASILUM's fee alone — the piece behind it IS the ticket, counted once there. Bag intent is never a purchase.
// Each purchase comes back with its item (the seed, the discoverable pool, then the row of a listing that has
// left the pool) and the moment it was bought, oldest first.

import { CATALOG } from "../ingest/catalog.js";
import { getDiscoverablePool } from "../products.js";
import { listOrdersForUser } from "../db/orders.js";
import { listTickets } from "../db/production.js";
import { getItems } from "../db/index.js";

export const BOUGHT_OUTCOMES = new Set(["bought", "kept", "returned"]);
const epoch = (v) => { const n = new Date(v).getTime(); return Number.isFinite(n) ? n : null; };

// The catalog by id: the seed plus whatever the discoverable pool holds.
export async function itemIndex() {
  const byId = new Map(CATALOG.map((it) => [it.id, it]));
  try {
    for (const it of await getDiscoverablePool({ fallback: false })) byId.set(it.id, it);
  } catch {}
  return byId;
}

export async function boughtPieces(userId) {
  const [orders, tickets] = await Promise.all([listOrdersForUser(userId, 50), listTickets(userId, 200)]);
  const paid = orders.filter((o) => o.status === "paid" && (o.kind || "sale") === "sale");
  const bought = tickets.filter((t) => BOUGHT_OUTCOMES.has(t.userReportedOutcome));
  const wanted = [
    ...paid.map((o) => ({ id: o.item_id, at: epoch(o.created_at), via: "order" })),
    ...bought.map((t) => ({ id: t.productId, at: epoch(t.outcomeReportedAt || t.createdAt), via: "ticket" })),
  ];
  const byId = await itemIndex();
  // a real listing bought after it left the pool still has its row
  const missing = [...new Set(wanted.map((w) => w.id).filter((id) => id && !byId.has(id)))];
  if (missing.length) for (const [id, it] of await getItems(missing)) byId.set(id, it);
  const purchases = wanted.map((w) => ({ id: w.id, at: w.at, via: w.via, item: (w.id && byId.get(w.id)) || null }))
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  return { purchases, sources: { orders: paid.length, tickets: bought.length } };
}
