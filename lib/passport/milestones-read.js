// lib/passport/milestones-read.js — READING the server's stamps (lib/passport/milestones.js, read: "server")
// from the passenger's own records. Pure: the route hands it what was bought (lib/orders/bought.js), the
// wardrobe offers paid as the buyer and the base city's country; it returns, per stamp, earned or not, when,
// and the evidence — the piece that earned it. The earliest qualifying record earns a stamp.

import { houseOrigin, houseIsFrom } from "../asterisk/houses.js";
import { eraBand } from "../valuation/comparables.js";

export const ARCHIVAL_READING = 0.6; // the catalogue's ARCHIVAL weight that reads a piece as archival

const norm = (s) => String(s || "").trim().toLowerCase();
const evidenceOf = (p) => (p && p.item ? { itemId: p.item.id, title: p.item.title || null, brand: p.item.brand || null } : null);
const first = (list, test) => list.find(test) || null;

export function isArchival(item) {
  if (!item) return false;
  if (eraBand(item.era) === "archive") return true;
  const w = item.tags && Number(item.tags.ARCHIVAL);
  return Number.isFinite(w) && w >= ARCHIVAL_READING;
}

export function readMilestones({ purchases = [], wardrobePaid = [], home = "" } = {}) {
  const bought = purchases.filter((p) => p && p.item);
  const out = {};
  const put = (id, p, extra = {}) => { out[id] = p ? { earned: true, at: p.at ?? null, evidence: evidenceOf(p), ...extra } : { earned: false, ...extra }; };

  put("first-purchase", purchases[0] || null); // a purchase counts even when its piece has left every index
  if (!home) out["first-international"] = { earned: false, waits: "a confirmed base city — the house's country is read against yours" };
  else put("first-international", first(bought, (p) => { const o = houseOrigin(p.item.brand); return !!(o && o.country && norm(o.country) !== norm(home)); }));
  const w = [...wardrobePaid].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))[0] || null;
  out["first-wardrobe"] = w ? { earned: true, at: w.at ?? null, evidence: w.itemId ? { itemId: String(w.itemId), title: null, brand: null } : null } : { earned: false };
  put("first-archive", first(bought, (p) => isArchival(p.item)));
  put("first-japanese", first(bought, (p) => houseIsFrom(p.item.brand, "Japan")));
  return out;
}
