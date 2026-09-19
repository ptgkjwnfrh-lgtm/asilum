// lib/nav.js
// The FOUR destinations, as DATA (Live Launch V.2, owner brief 17 Sep 2026:
// "the preferred primary navigation is deliberately small"). Extracted from the
// shell so the swap a business sees can be tested without mounting React — a
// nav rule asserted by grepping its own source is not a test of the rule.
//
// Driven by lib/accounts.js, which the server-side route guard also reads.
// One table, two readers, no way for them to disagree.
//
// What moved where (V.2): THE WIRE and the feed are ONE STREAM at "/"
// (round three, owner: "a constant stream of media") — the chunked feed's
// pieces and the wire's transmissions in the same masonry; /hotlist is the
// booth ladder beside it. DISCOVER is the open index at /discover (search,
// the map, the stylist). FULL READ (/stats) and UPLOAD ride inside PASSPORT
// as tabs; PROFILE, ORDERS and SETTINGS live under the account circle at the
// top right (ACCOUNT_MENU below) — one identity, one door.

import { can } from "./accounts.js";

const NAV = [
  { href: "/cover", icon: "▣", label: "FRONT COVER", meta: "LIVE EDITION",
    match: (p) => p.startsWith("/cover") },
  { href: "/discover", icon: "◎", label: "DISCOVER", meta: "SEARCH · AROUND YOU · STYLIST",
    match: (p) => p.startsWith("/discover") || p.startsWith("/stylist") },
  { href: "/", icon: "✎", label: "THE WIRE", meta: "ONE STREAM · PIECES AND CULTURE",
    match: (p) => p === "/" || p.startsWith("/hotlist") || p.startsWith("/u/") || p.startsWith("/piece") },
  { href: "/board", icon: "✚", label: "PASSPORT", meta: "COLLECTION · FULL READ · PLACES · STUDIO",
    match: (p) => p.startsWith("/board") || p.startsWith("/stats") || p.startsWith("/asterisk") || p.startsWith("/upload") || p.startsWith("/profile") || p.startsWith("/orders") || p.startsWith("/settings") },
];

// The account circle's menu — the same for every kind. PROFILE is the public
// record, ORDERS the ledger, SETTINGS the rack. None of these are
// destinations; they are the person's own drawers.
export const ACCOUNT_MENU = [
  { href: "/profile", label: "PROFILE", meta: "PUBLIC RECORD" },
  { href: "/orders", label: "ORDERS", meta: "TICKETS + RECEIPTS" },
  { href: "/settings", label: "SETTINGS", meta: "CONTROL PANEL" },
];

// A business trades two destinations for two others. It is a SWAP, not a
// subtraction: the shell keeps four slots in the same order, so the shape of
// the OS is the same building whichever door you came through — the second
// and fourth slots simply say something else.
//
// PASSPORT → ANALYTICS (what happened at this storefront)
// DISCOVER → WATCH TOWER (what the catalog's readers want)
const BUSINESS_NAV = {
  "/board": {
    href: "/analytics", icon: "▤", label: "ANALYTICS", meta: "THE LEDGER",
    match: (p) => p.startsWith("/analytics") || p.startsWith("/profile") || p.startsWith("/orders") || p.startsWith("/settings"),
  },
  "/discover": {
    href: "/watchtower", icon: "△", label: "WATCH TOWER", meta: "DEMAND // COHORTS",
    match: (p) => p.startsWith("/watchtower"),
  },
};

/**
 * The four destinations for this kind. Driven by the same capability table
 * the route guard reads, so the nav cannot offer a door the guard closes —
 * a hidden link over a live URL is an unguarded feature, not a hidden one.
 */
export function navFor(kind) {
  return NAV.map((entry) => {
    const swap = BUSINESS_NAV[entry.href];
    if (!swap) return entry;
    // Swap when the kind cannot reach the original and CAN reach the
    // replacement. Both halves are checked so a capability table edit that
    // opens neither leaves the reader with the passport default rather than a
    // dead tab.
    const capability = entry.href === "/board" ? "passport" : "discover";
    const replacement = entry.href === "/board" ? "analytics" : "watchtower";
    if (!can(kind, capability) && can(kind, replacement)) return swap;
    return entry;
  });
}

/** The destination that owns a path, or null. Used by the mobile tab bar and
 *  the shell's lamp; a path no destination claims (the fine print, /checkout,
 *  /admin) lights nothing. */
export function currentDestination(kind, pathname) {
  return navFor(kind).find((n) => n.match(pathname || "/")) || null;
}
