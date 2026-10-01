// lib/studio/drafts.js — the Studio's DEVICE-LOCAL drafts (events, shops,
// promotion requests): one key, one reader, one writer, shared by the
// Studio that writes them and the control center's ad strip that reads
// the promotion drafts back (lib/placements.js). Nothing here is
// published: a draft lives in this browser until a directory and a review
// desk exist, and the strip labels it DRAFT to its author alone.
export const DRAFTS_KEY = "asilum-studio-drafts";
const DRAFTS_MAX = 50;

export function readDrafts() {
  try {
    const v = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function writeDrafts(list) {
  try { window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, DRAFTS_MAX))); } catch {}
}
