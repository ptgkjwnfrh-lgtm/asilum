// app/api/items/route.js — GET ?ids=a,b,c → the public shape of up to 60
// listings by id, with their availability status and when it was last
// checked (V.2 brief §5: the Likes sheet reads a saved piece's status; the
// Sold tab reads the sold date), and its verification badge (§12). Public fields only (lib/products.js
// publicProduct); no identity, the global budget only.
import { NextResponse } from "next/server";
import { getItems } from "../../../lib/db/index.js";
import { latestStatusEvents, latestVerifications } from "../../../lib/db/production.js";
import { badgeFor } from "../../../lib/verification/ledger.js";
import { publicProduct } from "../../../lib/products.js";
import { consumeGlobalBudget } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ids = [...new Set(String(searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9_-]{1,80}$/i.test(s)))].slice(0, 60);
  if (!ids.length) return NextResponse.json({ items: [] });
  const budget = await consumeGlobalBudget("items").catch(() => ({ allowed: true }));
  if (budget && budget.allowed === false) return NextResponse.json({ error: "busy — try again shortly" }, { status: 429 });
  const [rows, events, checks] = await Promise.all([getItems(ids), latestStatusEvents(ids), latestVerifications(ids)]);
  const items = [];
  for (const id of ids) {
    const it = rows.get(id);
    if (!it) { items.push({ id, missing: true }); continue; }
    const safe = publicProduct(it) || { id: it.id, title: it.title, brand: it.brand, img: it.img, price: it.price, currency: it.currency };
    const ev = events.get(id) || null;
    items.push({ ...safe, availability_status: it.availability_status || "unknown", is_available: it.is_available !== false,
      lastCheckedAt: it.last_synced_at ? new Date(it.last_synced_at).toISOString() : null,
      statusEvent: ev ? { toStatus: ev.toStatus, observedAt: ev.observedAt, provider: ev.provider } : null,
      // V.2 §12: the card's asterisk, decided now against the listing's current evidence version
      verification: badgeFor(checks.get(id) || null, it) });
  }
  return NextResponse.json({ items });
}
