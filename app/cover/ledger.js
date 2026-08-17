// app/cover/ledger.js
// The FRONT COVER's system-ledger folio, as a pure function so it is testable
// without a browser (same reason /piece/[id]/handoff.js sits beside its page).
//
// It exists because of the Aug-17 metric-definition audit. The cover used to
// interpolate the /api/stats payload directly:
//
//   `${sys.interactions} INTERACTIONS · ${sys.users} READERS · …`
//
// and the read had no r.ok check. When /api/stats became STAFF-ONLY (Aug 16),
// every visitor's device cookie earned `401 {error:"stats are staff-only"}` —
// a TRUTHY body — so the masthead and the colophon both printed
//
//   SYSTEM LEDGER — undefined INTERACTIONS · undefined READERS ·
//   undefined BOARDS · undefined GRAPH EDGES
//
// one line above "EVERY VALUE ON THIS PAGE IS REAL STATE — NOTHING IS STAGED".
//
// So the rule here is per FIELD, not per payload: an entry is printed only if
// its value is actually a finite number. A refused read, an error body, or a
// future payload that drops a counter loses that entry rather than printing the
// word "undefined" underneath a real-state claim.

// Folio order is the printed order — do not re-sort for aesthetics; the
// masthead and the colophon must read identically.
const FOLIO = [
  ["interactions", "INTERACTIONS"],
  ["users", "READERS"],
  ["boards", "BOARDS"],
  ["edges", "GRAPH EDGES"],
];

export function systemLedger(sys) {
  if (!sys || typeof sys !== "object") return "";
  return FOLIO
    .filter(([key]) => Number.isFinite(sys[key]))
    .map(([key, label]) => `${sys[key]} ${label}`)
    .join(" · ");
}
