// lib/placements.js — STREET COMMERCE: what the device's ticker may carry.
//
// The owner's sketch (1 Oct 2026): a strip along the bottom of the device —
// "STREET COMMERCE : POP UP OCT 31" — with the note "all paid ads appear
// here and will scroll, cycling through all of them", a paid store pin on
// the passport map, and a paid event button. The law under it (owner brief,
// 17 Sep; Studio.jsx): a placement is labelled SPONSORED wherever it
// appears and cannot buy verification, ranking truth, push access or a
// partnership label. No placements table exists yet and nothing is charged
// — a promotion request is a Studio draft on the device. So the strip is
// WIRED, not faked. It carries, in this order:
//
//   1. SPONSORED — paid placements. None exist; the slot waits for the
//                  table and the charge. The label is reserved for them.
//   2. DRAFT     — this device's own promotion drafts, shown to their author
//                  only, labelled DRAFT, so a request can be seen in place.
//   3. LISTED    — upcoming dated events from the places record that link
//                  to their own public source. A sample fixture never runs.
//
// With nothing to carry it carries nothing (INVISIBLE-MACHINERY: no empty
// state) and the title bar's house line runs instead. Isomorphic and pure.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const KIND_WORD = { runway: "RUNWAY", "pop-up": "POP UP", consignment: "CONSIGNMENT", thrift: "THRIFT", shop: "SHOP", exhibition: "EXHIBITION", creator: "CREATOR" };

export const PLACEMENT_LABELS = Object.freeze({ sponsored: "SPONSORED", draft: "DRAFT", listed: "LISTED" });

/** "2026-10-31" → "OCT 31". Anything else → "". */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const mi = parseInt(m[2], 10) - 1;
  return MONTHS[mi] ? `${MONTHS[mi]} ${parseInt(m[3], 10)}` : "";
}

/** One strip entry: "NAME : KIND DATE". */
export function placementLine(row) {
  const name = String(row.name || "").trim().toUpperCase();
  const kind = KIND_WORD[row.kind] || String(row.kind || "").toUpperCase();
  const date = shortDate(row.startsAt);
  return [name, [kind, date].filter(Boolean).join(" ")].filter(Boolean).join(" : ");
}

/**
 * The ticker's entries. `placements` are paid rows (none today — the
 * argument exists so the day they do, nothing else changes); `drafts` are
 * the device's Studio drafts; `places` are rows from /api/places. `today`
 * is an ISO date; a dated event that has ended is never carried.
 */
export function tickerItems({ placements = [], drafts = [], places = [], today = "" } = {}) {
  const out = [];
  for (const p of placements) {
    if (!p || !p.name) continue;
    out.push({ id: "sponsored:" + p.id, kind: "sponsored", label: PLACEMENT_LABELS.sponsored, line: placementLine(p), href: p.href || "/map" });
  }
  // A promotion draft points at an event/shop draft by id; the draft list
  // holds both kinds, so the name comes from the pointed-at row.
  const byId = new Map(drafts.filter((d) => d && d.id).map((d) => [String(d.id), d]));
  for (const d of drafts) {
    if (!d || d.kind !== "promotion") continue;
    const target = byId.get(String(d.draftId));
    if (!target || !target.name) continue;
    out.push({ id: "draft:" + d.id, kind: "draft", label: PLACEMENT_LABELS.draft, line: placementLine({ ...target, startsAt: d.startsAt || target.startsAt }), href: "/board?tab=studio" });
  }
  for (const p of places) {
    if (!p || p.sample || !p.dated || !p.sourceUrl) continue;
    if (today && p.endsAt && p.endsAt < today) continue;
    if (today && !p.endsAt && p.startsAt && p.startsAt < today) continue;
    out.push({ id: "listed:" + p.id, kind: "listed", label: PLACEMENT_LABELS.listed, line: placementLine(p), href: "/map?pin=" + encodeURIComponent(p.id) });
  }
  return out;
}

/** The pins the map draws as promoted — paid placements only. A draft is
 *  not a pin: nobody else can see it and it has bought nothing. */
export function promotedIds(placements = []) {
  return new Set(placements.filter((p) => p && p.id).map((p) => String(p.id)));
}
