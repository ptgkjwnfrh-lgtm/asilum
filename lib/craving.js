// lib/craving.js — THE CURRENT CRAVING, one for the app (owner, 29 Oct 2026: "current cravings should live in search
// tab"). It was a fold on the Feed's row; it is set now in the DISCOVER popup (app/components/DiscoverSheet.jsx), the
// search tab's browse-without-typing face, and the Feed (app/page.js) follows it. It steers the Feed for this visit
// and never rewrites the long-term taste (the server says so when it applies one), so it is kept in sessionStorage,
// never localStorage, and told to the open pages by a window event.

export const CRAVING_KEY = "asilum-craving";
export const CRAVING_EVENT = "asilum:craving";
export const CRAVING_MAX = 240;

export const OCCASIONS = Object.freeze(["everyday", "work", "date", "night", "event", "travel", "outdoors"]);
export const MOODS = Object.freeze(["quiet", "sharp", "romantic", "experimental", "nostalgic", "practical"]);
export const NOVELTIES = Object.freeze([["safe", "safe bet"], ["discovery", "discovery"], ["wildcard", "wildcard"]]);

export const EMPTY_CRAVING = Object.freeze({ text: "", occasion: "", mood: "", novelty: "discovery" });

/** A craving made whole: its words trimmed and capped, each choice one the Feed knows or none. */
export function normalCraving(v) {
  const c = v && typeof v === "object" ? v : {};
  return {
    text: String(c.text || "").trim().slice(0, CRAVING_MAX),
    occasion: OCCASIONS.includes(c.occasion) ? c.occasion : "",
    mood: MOODS.includes(c.mood) ? c.mood : "",
    novelty: NOVELTIES.some(([k]) => k === c.novelty) ? c.novelty : "discovery",
  };
}

/** Whether a craving steers anything (the default, discovery and nothing else, does not). */
export function cravingActive(v) {
  const c = normalCraving(v);
  return !!(c.text || c.occasion || c.mood || c.novelty !== "discovery");
}

/** The craving this visit holds (sessionStorage), or none. A broken value is none. */
export function readCraving(storage) {
  try {
    const raw = storage && storage.getItem(CRAVING_KEY);
    return raw ? normalCraving(JSON.parse(raw)) : { ...EMPTY_CRAVING };
  } catch {
    return { ...EMPTY_CRAVING };
  }
}

/** Point the way: keep the craving for this visit (or forget it when it steers nothing) and tell the open pages. */
export function pointCraving(v, { storage, target } = {}) {
  const c = normalCraving(v);
  const store = storage !== undefined ? storage : (typeof window !== "undefined" ? window.sessionStorage : null);
  try {
    if (store) { if (cravingActive(c)) store.setItem(CRAVING_KEY, JSON.stringify(c)); else store.removeItem(CRAVING_KEY); }
  } catch { /* a private window: the open Feed still hears it */ }
  const t = target !== undefined ? target : (typeof window !== "undefined" ? window : null);
  if (t && typeof t.dispatchEvent === "function" && typeof CustomEvent === "function") t.dispatchEvent(new CustomEvent(CRAVING_EVENT, { detail: c }));
  return c;
}
