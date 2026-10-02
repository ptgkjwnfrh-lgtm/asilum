// lib/dock.js — THE CONTROL CENTER as DATA (V.2 brief, owner, 1 Oct 2026,
// §1 "Navigation and control center").
//
// The control center stays centred at the bottom above the safe area. It
// has a BASE mode — the four labelled tabs (lib/nav.js) and a visually
// secondary utility group: Likes, Search, Messages — and a SEARCH mode,
// where the scoped search field takes the row and the icons shrink but
// their targets do not. The ad strip is a separate, stable-height part of
// the same dock: changing modes never resizes it or resets it.
//
// Search mode opens when Search is tapped, or on entering Map, Messages or
// Likes — and it never opens the keyboard by itself. The scope is shown
// prominently and is never widened silently: "Search all ASiLUM" is an
// explicit action, and a private-message search can never reach the whole
// app on its own.
//
// Pure data and pure functions; the shell, the sheets and the tests read
// the same table.

/** The utilities, in the order the brief names them. Each is a sheet or a
 *  mode, never a route of its own — a utility is an action, not a tab. */
export const UTILITIES = Object.freeze([
  { id: "likes", icon: "heart", label: "LIKES" },
  { id: "search", icon: "search", label: "SEARCH" },
  { id: "messages", icon: "messages", label: "MESSAGES" },
]);

/** Search scopes and the exact placeholder each shows. The brief's list,
 *  verbatim. `wide` is whether "Search all ASiLUM" is offered as the way
 *  out of the scope. */
export const SEARCH_SCOPES = Object.freeze({
  global: { id: "global", placeholder: "Search ASiLUM", wide: false },
  map: { id: "map", placeholder: "Search places and events", wide: true },
  messages: { id: "messages", placeholder: "Search your messages", wide: true },
  "likes-pieces": { id: "likes-pieces", placeholder: "Search liked pieces", wide: true },
  "likes-wire": { id: "likes-wire", placeholder: "Search liked Wire posts", wide: true },
  "likes-sold": { id: "likes-sold", placeholder: "Search sold likes", wide: true },
});

/** The scope a surface opens in: entering Map, Messages or Likes selects
 *  that scope; everything else is the global search. `likesTab` is the
 *  Likes sheet's subtab when it is open. */
export function scopeFor({ pathname = "/", sheet = null, likesTab = "pieces" } = {}) {
  if (sheet === "messages") return SEARCH_SCOPES.messages;
  if (sheet === "likes") return SEARCH_SCOPES["likes-" + (["pieces", "wire", "sold"].includes(likesTab) ? likesTab : "pieces")];
  if (String(pathname || "").startsWith("/map")) return SEARCH_SCOPES.map;
  return SEARCH_SCOPES.global;
}

/** The three visible search controls (brief, decision 4): Pieces and Wire
 *  are independent content toggles with at least one on; ASTERISK is the
 *  taste rerank. "Following only" is an audience filter in the drawer, not
 *  a third content type. */
export const SEARCH_TOGGLES = Object.freeze([
  { id: "pieces", label: "PIECES" },
  { id: "wire", label: "WIRE" },
  { id: "asterisk", label: "ASTERISK" },
]);

/** Flip a content toggle, refusing to turn the last content type off. */
export function toggleContent(state, id) {
  const next = { ...state, [id]: !state[id] };
  if (id !== "asterisk" && !next.pieces && !next.wire) return state;
  return next;
}

// ---- Session law ----------------------------------------------------------
// "Every fresh app launch starts on The Feed" — even when the last session
// ended on Front Cover, Map, Wire or Account. Within a session, switching
// tabs preserves each tab's position and filters; a brief background/
// foreground transition resumes the session and never resets it. For a web
// app a URL opened from outside IS a deep link: the Feed is the base
// destination beneath it and Back leads there. What the law forbids is the
// app itself restoring a last-visited tab — it never does, so nothing here
// remembers one. (A PWA launch opens the manifest's start_url, "/".)

export const SESSION_KEY = "asilum-session";

/** Where a fresh launch goes. */
export const LAUNCH_PATH = "/";

/** The base destination beneath a deep link: the Feed, unless the link is
 *  itself the Feed. Used by sheets' Back and by the ◀ in a detail. */
export function baseFor(pathname) {
  return "/";
}

/** The view-state key for a surface (brief §2): viewer + route + subtab +
 *  normalised query + filters. Order and casing are fixed so the same view
 *  always lands on the same key. */
export function stateKey({ viewer = "anon", route = "/", subtab = "", query = "", filters = {} } = {}) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
  const f = Object.keys(filters || {}).sort().map((k) => `${k}=${String(filters[k])}`).join("&");
  return [String(viewer || "anon"), String(route || "/"), String(subtab || ""), q, f].join("|");
}

/** The map's three tools (brief §11): Stamp opens the personal Passport,
 *  Connect opens permitted passenger discovery, Discover opens the cultural
 *  directory. Visible labels, always — the sketch's icons alone are not
 *  enough (brief: "every symbol that is not obvious needs a readable
 *  label"). */
export const MAP_TOOLS = Object.freeze([
  { id: "stamp", icon: "stamp", label: "STAMP", hint: "your passport" },
  { id: "connect", icon: "link", label: "CONNECT", hint: "passengers" },
  { id: "discover", icon: "glasses", label: "DISCOVER", hint: "the directory" },
]);
