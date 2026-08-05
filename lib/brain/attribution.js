// lib/brain/attribution.js — examined-impression attribution (r19).
//
// r16 tunes the core blend on LIFT = engagement share ÷ impression share.
// Until this round an "impression" was a slot the server SENT. A feed page is
// 60 slots; nobody scrolls all 60. So bridges that fill deep slots banked
// impressions no eye ever reached, their lift was deflated by pure position,
// and tuning drifted weight away from them for reasons unrelated to taste.
// The audit that found r16 inert found this sitting underneath it.
//
// The fix is to count what was LOOKED AT. Two ways exist: model examination
// with a position-decay curve, or observe it. The client has observed it since
// the dwell work — an IntersectionObserver at 0.55 coverage — so this round
// reports those slots. A modelled curve's constants would be invented numbers
// with no evidence behind them; the house does not ship those.
//
// Declared bounds:
//   - a slot counts ONCE per page serve, no matter how often it re-enters view
//     (scrolling up and down is not extra evidence);
//   - the client may only report ids the server actually served, and the
//     BRIDGE comes from the server's own record of that serve — never from
//     the client, which may not label a slot's provenance;
//   - reports are idempotent per (user, serveId);
//   - BRAIN_EXAMINED_IMPRESSIONS=0 restores serve-counting without a deploy.

export function examinedImpressionsEnabled() {
  return process.env.BRAIN_EXAMINED_IMPRESSIONS !== "0";
}

/** Cap: one page serve can contribute at most this many examined slots. */
export const MAX_EXAMINED_PER_SERVE = 120;

/**
 * Reduce a client examination report to per-bridge counts, using the SERVER's
 * record of what each slot was. `servedBridges` maps itemId → bridge for the
 * serve being reported on; ids absent from it are dropped silently (a stale
 * page, or a client naming slots it was never sent).
 */
export function examinedBridgeCounts(examinedIds = [], servedBridges = {}) {
  const counts = {};
  const seen = new Set();
  let dropped = 0;
  for (const raw of examinedIds.slice(0, MAX_EXAMINED_PER_SERVE)) {
    const id = String(raw || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const bridge = servedBridges[id];
    if (!bridge) { dropped++; continue; }
    counts[bridge] = (counts[bridge] || 0) + 1;
  }
  return { counts, examined: seen.size - dropped, dropped };
}
