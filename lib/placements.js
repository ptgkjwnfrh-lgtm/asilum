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
//
// WHAT THE TICKER PRINTS (owner, 28 Oct 2026: "all BRDCST should simply be
// displayed by their title and all actual ads should start with "AD:"
// following whatever the advertiser wants to put"): each entry carries
// `ticker`, the words the deck's ticker shows, beside `line` (the labelled
// line the cover's placements block still prints). A BRDCST (the SPONSORED
// rows: live campaigns) and a LISTED event print their title alone; an ad
// prints "AD: " and the advertiser's own words — a paid ad row (`ads`, none
// exist yet: no ads table, nothing charged, so none ever runs) or this
// device's own promotion draft, which says it is a draft.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const KIND_WORD = { runway: "RUNWAY", "pop-up": "POP UP", consignment: "CONSIGNMENT", thrift: "THRIFT", shop: "SHOP", exhibition: "EXHIBITION", creator: "CREATOR" };

export const PLACEMENT_LABELS = Object.freeze({ sponsored: "SPONSORED", draft: "DRAFT", listed: "LISTED", ad: "AD" });

/** An entry's title, as the ticker prints a BRDCST or a listed event. */
export function titleLine(row) {
  return String((row && row.name) || "").trim().toUpperCase();
}

/** An ad, as the ticker prints it: "AD: " and the advertiser's words. */
export function adLine(words) {
  const w = String(words || "").replace(/\s+/g, " ").trim().replace(/^AD:\s*/i, "");
  return w ? "AD: " + w : "";
}

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
 * The ticker's entries. `ads` are paid ad rows ({ id, copy, href }: none
 * today — the argument exists so the day they do, nothing else changes);
 * `placements` are the live BRDCST campaigns in reach; `drafts` are
 * the device's Studio drafts; `places` are rows from /api/places. `today`
 * is an ISO date; a dated event that has ended is never carried.
 */
/** THE HOUSE LINE (owner, 30 Oct 2026, going live: "the ad ticker isnt loading in, let it say *ASILUM-MEDIA dot
 *  COMMERCE dot CONNECTION"): the ticker carries the house's own words always, first in its loop — the brand's line,
 *  never an ad or an offer — so it is open from the first frame whatever is live, and folds only without service. */
export const HOUSE_TICKER = "*ASILUM-MEDIA \u00b7 COMMERCE \u00b7 CONNECTION";
export const HOUSE_ITEM = Object.freeze({ id: "house", kind: "house", label: "ASILUM", line: HOUSE_TICKER, ticker: HOUSE_TICKER, href: "/" });

export function tickerItems({ ads = [], placements = [], drafts = [], places = [], today = "" } = {}) {
  const out = [HOUSE_ITEM];
  for (const a of ads) {
    const words = a && adLine(a.copy);
    if (!words) continue;
    out.push({ id: "ad:" + a.id, kind: "ad", label: PLACEMENT_LABELS.ad, line: words, ticker: words, href: a.href || "/" });
  }
  for (const p of placements) {
    if (!p || !p.name) continue;
    out.push({ id: "sponsored:" + p.id, kind: "sponsored", label: PLACEMENT_LABELS.sponsored, line: placementLine(p), ticker: titleLine(p), href: p.href || "/map" });
  }
  // A promotion draft points at an event/shop draft by id; the draft list
  // holds both kinds, so the name comes from the pointed-at row.
  const byId = new Map(drafts.filter((d) => d && d.id).map((d) => [String(d.id), d]));
  for (const d of drafts) {
    if (!d || d.kind !== "promotion") continue;
    const target = byId.get(String(d.draftId));
    if (!target || !target.name) continue;
    const line = placementLine({ ...target, startsAt: d.startsAt || target.startsAt });
    out.push({ id: "draft:" + d.id, kind: "draft", label: PLACEMENT_LABELS.draft, line, ticker: adLine(line) + " (DRAFT)", href: "/board?tab=studio" });
  }
  for (const p of places) {
    if (!p || p.sample || !p.dated || !p.sourceUrl) continue;
    if (today && p.endsAt && p.endsAt < today) continue;
    if (today && !p.endsAt && p.startsAt && p.startsAt < today) continue;
    out.push({ id: "listed:" + p.id, kind: "listed", label: PLACEMENT_LABELS.listed, line: placementLine(p), ticker: titleLine(p), href: "/map?pin=" + encodeURIComponent(p.id) });
  }
  return out;
}

/** THE TICKER'S RULE (owner, 28 Oct 2026: "if there is no ads or brdcsts the
 *  ticker should collapse and turn into a glowing white line … if the user
 *  has no service the ticker obviously can[t] show anything live so it
 *  shouldnt remain [open] … and should open immediatly after regaining
 *  service"): the ticker is open only while the device is online AND it has
 *  an ad, a BRDCST or the device's own ad draft to carry. A listed event or
 *  the house lines alone never hold it open. */
// (30 Oct 2026) and the house line, which is always carried: online, the ticker is open
export const OPENS_TICKER = Object.freeze(["house", "ad", "sponsored", "draft"]);
export function tickerOpen(items, online = true) {
  return !!online && Array.isArray(items) && items.some((it) => it && OPENS_TICKER.includes(it.kind));
}

/** THE TICKER TEST (owner, 28 Oct 2026: "create a button so i can test the
 *  animation"): the Design Console can open, fold and replay the ticker on
 *  this device, for this page view only. When nothing live is there to
 *  carry, it runs these two entries — written to say what they are, labelled
 *  SAMPLE, linking nowhere — never an invented ad or broadcast. */
export const TICKER_SAMPLE = Object.freeze([
  Object.freeze({ id: "sample:ad", kind: "ad", label: "SAMPLE", line: "AD: TICKER TEST - SAMPLE, NOT AN AD", ticker: "AD: TICKER TEST - SAMPLE, NOT AN AD", href: null }),
  Object.freeze({ id: "sample:brdcst", kind: "sponsored", label: "SAMPLE", line: "SAMPLE BRDCST TITLE", ticker: "SAMPLE BRDCST TITLE", href: null }),
]);

/** The test's events: the console sends one of these as `asilum:ticker-test` (null: back to live). */
export const TICKER_TESTS = Object.freeze(["open", "fold"]);
