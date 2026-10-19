// lib/profile/handles.js
// The handle vocabulary — pure constants, no imports, no db, no window.
//
// These used to live in rooms.js, which is server-only (it reaches the
// database through lib/db). The wire's ref parser needs the SAME rules on
// the client to decide whether an @mention could ever resolve, and
// importing rooms.js from a client component drags `pg` into the browser
// bundle (the build fails on `Can't resolve 'dns'`). Splitting the
// constants out keeps ONE source of truth: rooms.js re-exports them, so
// every existing importer is unaffected.

// Handles that can never be claimed: app routes, operator words, and
// anything that could impersonate the house.
export const RESERVED_HANDLES = Object.freeze([
  "asilum", "asterisk", "admin", "api", "official", "staff", "support",
  "help", "legal", "home", "profile", "settings", "discover", "stylist",
  "moodboard", "board", "orders", "tickets", "stats", "hotlist", "editorial",
  "u", "auth", "privacy", "wardrobe", "feed", "search",
]);

export const HANDLE_RE = /^[a-z0-9-]{3,24}$/;
