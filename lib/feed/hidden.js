// lib/feed/hidden.js — PASS on a card that is not a piece (owner's feed
// sketch, 25 Oct 2026: the × on its bar sits on every card). A piece's PASS
// is a real signal the brain learns from (lib/feed/actions.js pass). A post,
// a BRDCST or a song set aside is remembered on this device only — it leaves
// this Feed and stays gone after a reload, and nothing claims it told the
// author or trained anything. Client-safe: every call survives a missing or
// blocked localStorage.

export const HIDDEN_KEY = "asilum-feed-hidden";
export const HIDDEN_EVENT = "asilum:feed-hidden";
const HIDDEN_MAX = 500;

export function readHidden() {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(HIDDEN_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch { return new Set(); }
}

export function hideCard(id) {
  if (id == null) return;
  const set = readHidden();
  set.add(String(id));
  try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set].slice(-HIDDEN_MAX))); } catch {}
  try { window.dispatchEvent(new CustomEvent(HIDDEN_EVENT, { detail: { id: String(id) } })); } catch {}
}
