// lib/passport/milestones.js — THE STAMPS a Passport can earn (owner, 3 Nov 2026: "first purchase, first
// international purchase, 100 followers … 1 million followers, first steal … first wardrobe buy, first
// archive piece, first japanese designer piece, first LVMH house piece, first concert bought through asilum,
// shit like that"). The catalogue alone — what each stamp means, its shape and its ink, and HOW it is read —
// so the client can draw every badge without the reading's tables (lib/passport/milestones-read.js reads them
// on the server, app/api/passport/stamps).
//
// No stamp is ever lit by a guess. Each says how it is read, and one the house cannot read yet is drawn
// LOCKED with `waits` saying what it waits for — the Constitution's "features without real access are
// disabled and say so", in a badge's words:
//   read: "device"   the Passport itself decides (the three house stamps, from the page's own reading)
//   read: "server"   decided from the records on the server, the evidence returned with it
//   read: "waits"    not measurable today; `waits` names the missing data
//
// Shapes are the meaning's (lib/passport/badges.js); the followers' ladder gains a side with every tier.

export const GROUPS = Object.freeze([
  { id: "house", label: "THE HOUSE" },
  { id: "commerce", label: "BUYING" },
  { id: "collection", label: "THE COLLECTION" },
  { id: "audience", label: "FOLLOWING" },
  { id: "culture", label: "CULTURE" },
]);

const FOLLOWER_WAIT = "a follower count — follows are kept on the server, but nothing serves the count yet";
const tier = (n, label, shape) => ({
  id: "followers-" + n, group: "audience", title: label + " FOLLOWERS", shape, ink: "p2", emblem: label, small: "FOLLOWERS",
  means: `${n.toLocaleString("en")} passengers follow your public room.`, read: "waits", waits: FOLLOWER_WAIT, threshold: n,
});

export const MILESTONES = Object.freeze([
  // the house's own — read on the device from the Passport's page
  { id: "collection", group: "house", title: "FIRST COLLECTION", shape: "asterisk", ink: "red", emblem: "✳",
    means: "you kept your first thing — a piece, a post, a place, a person.", read: "device" },
  { id: "taste", group: "house", title: "TASTE DEFINED", shape: "lens", ink: "red", emblem: "◇",
    means: "the brain holds three convictions about your taste or more.", read: "device" },
  { id: "transmission", group: "house", title: "FIRST TRANSMISSION", shape: "pennant", ink: "red", emblem: "↗",
    means: "you published your first post.", read: "device" },

  // buying
  { id: "first-purchase", group: "commerce", title: "FIRST PURCHASE", shape: "tag", ink: "sig", emblem: "01", small: "PURCHASE",
    means: "your first piece bought — a paid order, or a ticket you reported bought, kept or returned.", read: "server" },
  { id: "first-international", group: "commerce", title: "FIRST INTERNATIONAL PURCHASE", shape: "globe", ink: "sig", emblem: "INTL",
    means: "your first piece from a house based outside your base city's country.",
    how: "read by where the HOUSE is based (lib/asterisk/houses.js), not where the piece shipped from — no order carries a ship-from country yet.",
    read: "server" },
  { id: "first-wardrobe", group: "commerce", title: "FIRST WARDROBE BUY", shape: "hanger", ink: "sig", emblem: "WRD",
    means: "your first piece bought from another passenger's wardrobe — an offer made in a message and paid.", read: "server" },
  { id: "first-steal", group: "commerce", title: "FIRST STEAL", shape: "gem", ink: "sig", emblem: "-80%",
    means: "a luxury piece bought at 20% of its retail price or less.", read: "waits",
    waits: "a retail price (MSRP) with its source on each piece — today a piece carries only its asking price" },

  // the collection
  { id: "first-archive", group: "collection", title: "FIRST ARCHIVE PIECE", shape: "arch", ink: "ink", emblem: "ARC",
    means: "your first piece bought from before 2000, or one the catalogue reads as archival.", read: "server" },
  { id: "first-japanese", group: "collection", title: "FIRST JAPANESE HOUSE", shape: "rosette", ink: "ink", emblem: "JPN",
    means: "your first piece from a house founded or based in Japan.",
    how: "read by the house's base (lib/asterisk/houses.js) — a house, not the designer's nationality.", read: "server" },
  { id: "first-lvmh", group: "collection", title: "FIRST LVMH HOUSE", shape: "quatrefoil", ink: "ink", emblem: "LVMH",
    means: "your first piece from a house in the LVMH group.", read: "waits",
    waits: "a sourced, dated group field on each house — ownership is written only as prose today, and it changes (a house sold is no longer the group's)" },

  // following — the ladder
  tier(100, "100", "tri"),
  tier(1000, "1K", "diamond"),
  tier(5000, "5K", "pent"),
  tier(10000, "10K", "hex"),
  tier(50000, "50K", "oct"),
  tier(100000, "100K", "dec"),
  tier(500000, "500K", "star12"),
  tier(1000000, "1M", "star16"),

  // culture
  { id: "first-concert", group: "culture", title: "FIRST CONCERT", shape: "ticket", ink: "p2", emblem: "LIVE",
    means: "your first concert ticket bought through ASILUM.", read: "waits",
    waits: "ASILUM selling event tickets — today an event links out to its seller, and ASILUM never counts a ticket it did not sell" },
]);

export const SERVER_READ = Object.freeze(MILESTONES.filter((m) => m.read === "server").map((m) => m.id));
export function milestone(id) { return MILESTONES.find((m) => m.id === id) || null; }
