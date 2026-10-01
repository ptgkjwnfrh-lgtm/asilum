// lib/nav.js
// The FOUR main tabs, as DATA (V.2 brief, owner, 1 Oct 2026 — "There are
// four main tabs: Front Cover, The Feed, Map, and Account"). Extracted from
// the shell so the swap a business sees can be tested without mounting
// React — a nav rule asserted by grepping its own source is not a test of
// the rule.
//
// Driven by lib/accounts.js, which the server-side route guard also reads.
// One table, two readers, no way for them to disagree.
//
// What moved where (1 Oct): THE FEED is home at "/" — pieces and Wire posts
// in one stream with Pieces/Wire toggles, and THE WIRE a labelled subview
// of the same destination ("/?view=wire") with its own remembered position.
// MAP is a root of its own (the Passport branch: Stamp / Connect / Discover
// tools). ACCOUNT holds the personal Passport, Full Read, Studio, Profile,
// Orders and Settings — one identity, one door. FRONT COVER is a permanent
// tab (the Hot List and the business/event placements), never a splash
// screen: a fresh launch starts on THE FEED (lib/dock.js). Likes, Search
// and Messages are UTILITIES in the control center, not tabs. DISCOVER as
// a destination is gone: global search opens from the dock and answers at
// /discover; AROUND YOU became MAP; the STYLIST rides under the Feed.

import { can } from "./accounts.js";

const NAV = [
  { href: "/cover", icon: "cover", label: "FRONT COVER", meta: "HOT LIST · PLACEMENTS",
    match: (p) => p.startsWith("/cover") },
  { href: "/", icon: "feed", label: "THE FEED", meta: "PIECES · THE WIRE",
    match: (p) => p === "/" || p.startsWith("/hotlist") || p.startsWith("/u/") || p.startsWith("/piece") || p.startsWith("/discover") || p.startsWith("/stylist") },
  { href: "/map", icon: "map", label: "MAP", meta: "PLACES · EVENTS · PASSENGERS",
    match: (p) => p.startsWith("/map") },
  { href: "/board", icon: "account", label: "ACCOUNT", meta: "PASSPORT · WARDROBE · STUDIO",
    match: (p) => p.startsWith("/board") || p.startsWith("/stats") || p.startsWith("/asterisk") || p.startsWith("/upload") || p.startsWith("/profile") || p.startsWith("/orders") || p.startsWith("/settings") },
];

// The account's drawers — the same for every kind. PROFILE is the public
// record, ORDERS the ledger, SETTINGS the rack. None of these are tabs; they
// are rooms inside ACCOUNT.
export const ACCOUNT_MENU = [
  { href: "/profile", label: "PROFILE", meta: "PUBLIC RECORD" },
  { href: "/orders", label: "ORDERS", meta: "TICKETS + RECEIPTS" },
  { href: "/settings", label: "SETTINGS", meta: "CONTROL PANEL" },
];

// A business trades one tab for another. It is a SWAP, not a subtraction:
// the shell keeps four slots in the same order, so the shape of the OS is
// the same building whichever door you came through — the fourth slot
// simply says something else.
//
// ACCOUNT → ANALYTICS (what happened at this storefront), with WATCH TOWER
// (what the catalog's readers want) as its sub-link. MAP stays MAP: a
// business has places and events too.
const BUSINESS_NAV = {
  "/board": {
    href: "/analytics", icon: "ledger", label: "ANALYTICS", meta: "THE LEDGER · WATCH TOWER",
    match: (p) => p.startsWith("/analytics") || p.startsWith("/watchtower") || p.startsWith("/profile") || p.startsWith("/orders") || p.startsWith("/settings"),
    sub: [{ href: "/watchtower", label: "WATCH TOWER" }],
  },
};

/**
 * The four tabs for this kind. Driven by the same capability table the
 * route guard reads, so the nav cannot offer a door the guard closes — a
 * hidden link over a live URL is an unguarded feature, not a hidden one.
 */
export function navFor(kind) {
  return NAV.map((entry) => {
    const swap = BUSINESS_NAV[entry.href];
    if (!swap) return entry;
    // Swap when the kind cannot reach the original and CAN reach the
    // replacement. Both halves are checked so a capability table edit that
    // opens neither leaves the reader with the passport default rather than a
    // dead tab.
    if (!can(kind, "passport") && can(kind, "analytics")) return swap;
    return entry;
  });
}

/** The tab that owns a path, or null. Used by the control center's lamp; a
 *  path no tab claims (the fine print, /checkout, /admin) lights nothing. */
export function currentDestination(kind, pathname) {
  return navFor(kind).find((n) => n.match(pathname || "/")) || null;
}
