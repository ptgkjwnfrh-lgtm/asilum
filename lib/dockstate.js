// lib/dockstate.js — the control deck's live state, shared by the deck,
// the fixtures, the sheets and the roots without a React context (the
// shell mounts them as siblings of every page, so a context would have to
// wrap the whole app for one object). A module store with
// subscribe/snapshot for useSyncExternalStore; plain functions for
// everyone else. Client-only; on the server it is inert.
//
// What it holds (V.2 Blueprint, chapters 1 and 2; the 1 Oct brief §1–2
// where the blueprint is silent): the deck MODE (base | search), the scoped
// QUERY (kept per scope: each search keeps its own words), the three search
// TOGGLES, the Likes subtab, and THE POPUP — the tabs below — one
// stack of views: a popup opened over another keeps it underneath, Back
// returns to it, dismissing clears the stack. `sheet` is derived from it.
//
// THE TABS (owner, 27 Oct 2026: "lets get rid of the ten tabs that are
// hidden" — then: "the rules they had must still apply, so when i back out
// of a tab the tab must remain what i last left it as … i simply just dont
// want the session subtabs as a confusing feature"). The ten-session hub's
// face is gone — no carousel, no 01/10 counter, no New Session — and its
// laws stay, kept quietly: every popup belongs to a TAB, named by the view
// it was opened as (and what it was opened on); dismissing a tab keeps it
// exactly as it was, and opening it again resumes it — the detail that was
// up, the half-typed search, the scroll (SheetHost.jsx keeps each tab's
// views alive while the page lives; this store keeps where each tab was on
// this device, so after a reload it still resumes; nothing ever pops open
// by itself). A popup opened over another extends that tab (1.28), Back
// returns (1.2), and nothing is discarded but the oldest past TAB_MEMORY.

import { useSyncExternalStore } from "react";
import { toggleContent } from "./dock.js";

/** What the retired hub saved on this device (forgetSessions clears them). */
export const RETIRED_KEYS = Object.freeze(["asilum-sessions-v2", "asilum-session-previews"]);
/** Where each tab was, on this device. */
export const TABS_KEY = "asilum-tabs-v1";
/** How many tabs are remembered (the oldest beyond it is let go). */
export const TAB_MEMORY = 24;

const state = {
  mode: "base",
  q: "",
  toggles: { pieces: true, wire: true, asterisk: true },
  tabs: [],          // [{ key, stack: [{ view, props, scroll }] }], the most recent first
  active: null,      // the key of the tab on screen, or null when no popup is up
  scope: "global",   // which search the deck's field is (lib/dock.js scopeFor)
  words: {},         // the other scopes' words, kept: { [scope]: { q, pins } }
  hydrated: false,   // the tabs have been read from this device
  likesTab: "pieces",
  pins: [],          // tags pinned as filters on the current search (blueprint, Tag grammar: long-press)
  typing: false,     // the reader is typing — the ad strip pauses
};

// a tab's name: the view it was opened as and what it was opened on (the
// title is only a caption), in a stable spelling
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
export function tabKey(view, props = {}) {
  const { title, ...rest } = props || {};
  const id = stable(rest);
  if (id.length <= 240) return view + ":" + id;
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return view + ":#" + (h >>> 0).toString(36);
}
const activeTab = () => (state.active ? state.tabs.find((t) => t.key === state.active) || null : null);
function derivedSheet() {
  const tab = activeTab();
  const top = tab && tab.stack[tab.stack.length - 1];
  return top ? { id: top.view, key: tab.key, stack: tab.stack, top } : null;
}
function build() {
  return { ...state, toggles: { ...state.toggles }, pins: [...state.pins], tabs: state.tabs.map((t) => ({ ...t, stack: [...t.stack] })), sheet: derivedSheet() };
}
let snapshot = build();
const subs = new Set();
let saveTimer = null;
function save() {
  if (typeof window === "undefined" || !state.hydrated) return; // never overwrite what this device has not been read yet
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { window.localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: state.tabs, words: { ...state.words, [state.scope]: { q: state.q, pins: state.pins } } })); } catch {}
  }, 200);
}
function emit({ keep = true } = {}) {
  snapshot = build();
  for (const fn of subs) fn();
  if (keep) save();
}

export function getDock() { return snapshot; }
export function subscribeDock(fn) { subs.add(fn); return () => subs.delete(fn); }
export function useDock() { return useSyncExternalStore(subscribeDock, getDock, getDock); }

/** Clear what the retired session hub saved on this device: its sessions
 *  and its preview preference. */
export function forgetSessions() {
  if (typeof window === "undefined") return;
  for (const k of RETIRED_KEYS) { try { window.localStorage.removeItem(k); } catch {} }
}

/** Read where each tab was on this device. Called once, on the client,
 *  after mount; it never opens a popup — a tab resumes when it is opened. */
export function hydrateTabs() {
  if (state.hydrated || typeof window === "undefined") return;
  state.hydrated = true;
  forgetSessions();
  try {
    const saved = JSON.parse(window.localStorage.getItem(TABS_KEY) || "null");
    if (saved && Array.isArray(saved.tabs)) {
      const live = new Set(state.tabs.map((t) => t.key));
      const kept = saved.tabs.filter((t) => t && typeof t.key === "string" && Array.isArray(t.stack) && t.stack.length && t.stack.every((e) => e && typeof e.view === "string") && !live.has(t.key));
      state.tabs = [...state.tabs, ...kept].slice(0, TAB_MEMORY);
    }
    if (saved && saved.words && typeof saved.words === "object") {
      for (const [scope, w] of Object.entries(saved.words)) {
        if (!w || typeof w.q !== "string" || state.words[scope]) continue;
        state.words[scope] = { q: w.q.slice(0, 200), pins: Array.isArray(w.pins) ? w.pins.slice(0, 6) : [] };
      }
      const mine = state.words[state.scope];
      if (mine && !state.q) { state.q = mine.q; state.pins = [...mine.pins]; delete state.words[state.scope]; }
    }
  } catch {}
  emit({ keep: false });
}

/** Where a view in a tab was scrolled to — kept quietly (no re-render). */
export function rememberScroll(key, index, top) {
  const tab = state.tabs.find((t) => t.key === key);
  if (!tab || !tab.stack[index]) return;
  tab.stack[index] = { ...tab.stack[index], scroll: Math.max(0, Math.round(top)) };
  save();
}

/** Search mode. The query and its pins were never cleared (closeSearch):
 *  entering it again finds the half-typed words in the field and, when
 *  there were words, the search tab resumed with its results as they were. */
/** A scope's words, whether or not the deck's field is on it now — the
 *  search popup reads the global search's, so a tab kept out of sight never
 *  sees another scope's words pass through the field (and its results and
 *  its scroll stay as they were). */
export function wordsOf(dock, scope) {
  if (dock.scope === scope) return { q: dock.q, pins: dock.pins };
  return (dock.words && dock.words[scope]) || { q: "", pins: [] };
}
/** The deck's field is now this scope's search: the words typed in the
 *  last one are kept, and this one's own come back. */
export function setScope(scope) {
  const next = String(scope || "global");
  if (next === state.scope) return;
  state.words = { ...state.words, [state.scope]: { q: state.q, pins: [...state.pins] } };
  const mine = state.words[next] || { q: "", pins: [] };
  state.q = mine.q; state.pins = [...mine.pins];
  const { [next]: _, ...rest } = state.words;
  state.words = rest;
  state.scope = next;
  emit();
}
export function setMode(mode) {
  state.mode = mode === "search" ? "search" : "base";
  if (state.mode === "search" && state.scope === "global" && state.q.trim() && !state.active) { openSheet("search"); return; }
  emit();
}
export function setQuery(q) { state.q = String(q || "").slice(0, 200); emit(); }
export function setTyping(on) { state.typing = !!on; emit(); }
export function flipToggle(id) { state.toggles = toggleContent(state.toggles, id); emit(); }
/** Pin a tag as a filter chip on the current search (long-press). Six at
 *  most; a pin already there is left alone. `tag` is a grammar tag or a
 *  parsed query — anything with `left` and `right`. */
export function pinTag(tag) {
  if (!tag || !tag.left) return;
  const left = String(tag.left).toUpperCase().trim(), right = tag.right ? String(tag.right).toUpperCase().trim() : null;
  const key = left + ":" + (right || "");
  if (state.pins.some((p) => p.key === key) || state.pins.length >= 6) return;
  state.pins = [...state.pins, { key, left, right, text: right ? `${left}: ${right}` : `${left}:` }];
  emit();
}
export function unpinTag(key) { state.pins = state.pins.filter((p) => p.key !== key); emit(); }
export function setLikesTab(tab) { state.likesTab = ["pieces", "wire", "sold"].includes(tab) ? tab : "pieces"; emit(); }

/** Open a popup. Over a popup it extends that tab (1.28); otherwise it
 *  resumes the tab of that name exactly as it was left, or starts it. Only
 *  the search popup enters search mode: the deck rises for its bar when
 *  SEARCH is pressed, and any other key leaves it (the owner's fixture
 *  sketch and word, 19 Oct 2026 — superseding the brief's "entering Likes or
 *  Messages enters search mode"). Pressing SEARCH over Likes or Messages
 *  still gives that popup's scoped search. */
export function openSheet(id, props = {}) {
  hydrateTabs();
  const open = activeTab();
  if (open) {
    open.stack = [...open.stack, { view: id, props }];
  } else {
    const key = tabKey(id, props);
    const was = state.tabs.find((t) => t.key === key);
    const tab = was || { key, stack: [{ view: id, props }] };
    state.tabs = [tab, ...state.tabs.filter((t) => t !== was)].slice(0, TAB_MEMORY);
    state.active = key;
  }
  if (id === "search") state.mode = "search";
  emit();
}
/** A detail inside the open popup — Back returns to what was there. */
export function pushSheet(view, props = {}) {
  const open = activeTab();
  if (!open) { openSheet(view, props); return; }
  open.stack = [...open.stack, { view, props }];
  emit();
}
/** Go to a view in the open popup: back to it when the popup already holds it (its props renewed), a step added
 *  otherwise, a popup opened when none is up. Bug run, 29 Oct 2026: DISCOVER pressed again, or a rail tapped in
 *  DISCOVER over search, stacked a second live copy — every step stays mounted, and each SEARCH ran its own requests
 *  on every keystroke. */
export function goSheet(view, props = {}) {
  const open = activeTab();
  if (!open) { openSheet(view, props); return; }
  const at = open.stack.findIndex((s) => s.view === view);
  if (at < 0) { pushSheet(view, props); return; }
  open.stack = [...open.stack.slice(0, at), { view, props }];
  if (view === "search") state.mode = "search";
  emit();
}
/** Back: the view underneath; from the tab's first view it dismisses (1.2),
 *  and the tab is kept as it is. */
export function backSheet() {
  const open = activeTab();
  if (!open) return;
  if (open.stack.length > 1) open.stack = open.stack.slice(0, -1);
  else state.active = null;
  emit();
}
/** Dismiss: the tab goes out of sight, kept exactly as it was (1.3). */
export function closeSheet() { state.active = null; emit(); }
/** Pressing any other fixture key leaves search (owner, 19 Oct 2026:
 *  "clicking another button should exit the search out"); a no-op when the
 *  deck is not searching, so it never closes a popup that is not search's. */
export function leaveSearch() { if (state.mode === "search") closeSearch(); }

/** Leave search mode: the popup closes and the keys return; the words and
 *  the pins stay for the next time SEARCH is pressed (only search mode
 *  reads them: Likes and the map filter by them only while it is on). */
export function closeSearch() {
  state.mode = "base"; state.typing = false;
  state.active = null;
  emit();
}
