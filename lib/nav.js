// lib/nav.js
// The seven destinations, as DATA. Extracted from the shell so the swap a
// business sees can be tested without mounting React — a nav rule asserted by
// grepping its own source is not a test of the rule.
//
// Driven by lib/accounts.js, which the server-side route guard also reads.
// One table, two readers, no way for them to disagree.

import { can } from "./accounts.js";

const NAV = [
  { href: "/cover", icon: "▣", label: "FRONT COVER", meta: "LIVE EDITION",
    match: (p) => p.startsWith("/cover") },
  { href: "/", icon: "✦", label: "CATALOG", meta: "YOUR EDIT // CURATED",
    match: (p) => p === "/" },
  { href: "/hotlist", icon: "✎", label: "THE WIRE", meta: "POSTS + THE HOTLIST",
    match: (p) => p.startsWith("/hotlist") },
  { href: "/board", icon: "✚", label: "PASSPORT", meta: "IDENT // MOODBOARD",
    match: (p) => p.startsWith("/board") || p.startsWith("/stats") || p.startsWith("/asterisk") || p.startsWith("/upload"),
    sub: [{ href: "/upload", label: "UPLOAD ⇪" }, { href: "/stats", label: "STATS →" }] },
  { href: "/discover", icon: "◎", label: "DISCOVER", meta: "OPEN INDEX",
    match: (p) => p.startsWith("/discover") || p.startsWith("/stylist"),
    sub: [{ href: "/stylist", label: "STYLIST ✂" }] },
  { href: "/profile", icon: "◉", label: "PROFILE", meta: "PUBLIC RECORD",
    match: (p) => p.startsWith("/profile") || p.startsWith("/orders") || p.startsWith("/u/"),
    sub: [{ href: "/orders", label: "ORDERS →" }] },
  { href: "/settings", icon: "⚙", label: "SETTINGS", meta: "CONTROL PANEL",
    match: (p) => p.startsWith("/settings") || p.startsWith("/privacy") || p.startsWith("/terms") || p.startsWith("/accessibility") },
];

// A business trades two destinations for two others. It is a SWAP, not a
// subtraction: the shell keeps seven slots in the same order, so the shape of
// the OS is the same building whichever door you came through — the third and
// fifth slots simply say something else.
//
// PASSPORT → ANALYTICS (what happened at this storefront)
// DISCOVER → WATCH TOWER (what the catalog's readers want)
const BUSINESS_NAV = {
  "/board": {
    href: "/analytics", icon: "▤", label: "ANALYTICS", meta: "THE LEDGER",
    match: (p) => p.startsWith("/analytics"),
  },
  "/discover": {
    href: "/watchtower", icon: "△", label: "WATCH TOWER", meta: "DEMAND // COHORTS",
    match: (p) => p.startsWith("/watchtower"),
  },
};

/**
 * The seven destinations for this kind. Driven by the same capability table
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
