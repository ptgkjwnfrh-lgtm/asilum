// lib/discover/recency.js — "newest" means creation time (release blocker 0A-1).
// publicProduct keeps timestamps server-side by design, so discovery surfaces
// capture the creation instant before mapping a row into a card and strip it
// again before the response leaves the API boundary.

export function createdAtOf(item) {
  const at = Date.parse(item?.created_at ?? item?.createdAt ?? "");
  return Number.isFinite(at) ? at : null;
}

// The pg pool arrives newest-first already (listItems orders by created_at
// DESC), so the old slice().reverse() actually showed the OLDEST inventory
// first in production. Rows without a timestamp exist only in mem/seed mode,
// where reversed insertion order is the only recency signal available; a
// dated pool sinks undated rows below every dated one.
export function sortNewestFirst(items) {
  return items.some((item) => item._createdAt != null)
    ? items.slice().sort((a, b) => (b._createdAt ?? -Infinity) - (a._createdAt ?? -Infinity))
    : items.slice().reverse();
}

// The sort key never crosses the API boundary.
export function stripRecencyKey(items) {
  return items.map(({ _createdAt, ...item }) => item);
}
