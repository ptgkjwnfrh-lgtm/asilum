// lib/events/index.js
// Canonical user-event vocabulary for the Alpha Learning Brain.
// Pure module (no I/O) — safe to import from client or server.
//
// LIVE SINK (Day 5): lib/db recordEvent → user_events table (Postgres) or a
// capped in-memory ring. Writers today: /api/interaction (all actions via
// eventFromInteraction), /api/boards saves (USER_ADDED_TO_MOOD_BOARD), and
// /api/search (USER_SEARCHED_QUERY when the caller sends its uid).
// This history is the Alpha Learning Brain's training data — write-only for
// now; learning jobs read it later. /api/stats reports the count.

export const EVENTS = Object.freeze({
  USER_SAVED_ITEM: "USER_SAVED_ITEM",                     // live → interaction "save"
  USER_FAVORITED_ITEM: "USER_FAVORITED_ITEM",             // live → interaction "favorite"
  USER_VIEWED_PRODUCT: "USER_VIEWED_PRODUCT",             // live → interaction "dwell"
  USER_SKIPPED_PRODUCT: "USER_SKIPPED_PRODUCT",           // live → interaction "skip"
  USER_BOUGHT_ITEM: "USER_BOUGHT_ITEM",                   // live → interaction "bag" (intent; real checkout doesn't exist)
  USER_UPLOADED_IMAGE: "USER_UPLOADED_IMAGE",             // live → /api/train on filename words (until vision exists)
  USER_CONNECTED_ACCOUNT: "USER_CONNECTED_ACCOUNT",       // placeholder — connectors are coming-soon
  USER_FOLLOWED_BRAND: "USER_FOLLOWED_BRAND",             // live → localStorage + /api/train on brand tags
  USER_FOLLOWED_USER: "USER_FOLLOWED_USER",               // live → localStorage follows
  USER_LIKED_EDITORIAL: "USER_LIKED_EDITORIAL",           // placeholder
  USER_ADDED_TO_MOOD_BOARD: "USER_ADDED_TO_MOOD_BOARD",   // live → /api/boards (strongest edge signal)
  USER_SEARCHED_QUERY: "USER_SEARCHED_QUERY",             // placeholder (search is live, not yet a taste signal)
  USER_VIEWED_BRAND: "USER_VIEWED_BRAND",                 // placeholder
  USER_VIEWED_EDITORIAL: "USER_VIEWED_EDITORIAL",         // placeholder
  USER_SHARED_ITEM: "USER_SHARED_ITEM",                   // live → interaction "share"
  USER_CLICKED_SIMILAR_ITEM: "USER_CLICKED_SIMILAR_ITEM", // live → modal "goes with" reopens detail
  USER_REJECTED_RECOMMENDATION: "USER_REJECTED_RECOMMENDATION", // live → interaction "hide"
  USER_RETURNED_TO_ITEM: "USER_RETURNED_TO_ITEM",         // placeholder (needs view-history)
  USER_COMPLETED_PURCHASE: "USER_COMPLETED_PURCHASE",     // placeholder — checkout not built (constitution)
});

// One canonical event record. `payload` is event-specific (itemId, brand,
// query, imageRef, …). Never put secrets or raw PII in payloads.
export function buildEvent(userId, type, payload = {}, at = Date.now()) {
  if (!EVENTS[type]) throw new Error("unknown event type: " + type);
  return { userId, type, payload, at, v: 1 };
}

// LIVE mapping: /api/interaction actions → canonical events.
const ACTION_TO_EVENT = {
  save: EVENTS.USER_SAVED_ITEM,
  favorite: EVENTS.USER_FAVORITED_ITEM,
  dwell: EVENTS.USER_VIEWED_PRODUCT,
  skip: EVENTS.USER_SKIPPED_PRODUCT,
  hide: EVENTS.USER_REJECTED_RECOMMENDATION,
  bag: EVENTS.USER_BOUGHT_ITEM, // purchase INTENT — real checkout doesn't exist
  share: EVENTS.USER_SHARED_ITEM,
};

// Null for unmapped actions — callers skip those rather than inventing types.
export function eventFromInteraction(userId, action, item, dwellMs = null) {
  const type = ACTION_TO_EVENT[action];
  if (!type) return null;
  const payload = { itemId: item?.id, brand: item?.brand };
  if (action === "dwell") payload.dwellMs = dwellMs;
  return buildEvent(userId, type, payload);
}
