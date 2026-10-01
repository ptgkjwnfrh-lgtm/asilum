// lib/dockstate.js — the control center's live state, shared by the dock,
// the sheets and the roots without a React context (the shell mounts the
// dock and the sheet host as siblings of every page, so a context would
// have to wrap the whole app for one object). A module store with
// subscribe/snapshot for useSyncExternalStore; plain functions for
// everyone else. Client-only; on the server it is inert.
//
// What it holds (V.2 brief §1–2): the dock MODE (base | search), the
// scoped QUERY, the three search TOGGLES, the one SHEET that may be open
// (with its inner stack for Back), and the Likes subtab. Nothing here is
// persisted — session memory of positions belongs to lib/viewstate.js, and
// message text never enters browser state.

import { useSyncExternalStore } from "react";
import { toggleContent } from "./dock.js";

const state = {
  mode: "base",
  q: "",
  toggles: { pieces: true, wire: true, asterisk: true },
  sheet: null,       // { id: "likes" | "search" | "messages" | "detail", stack: [ {view, props} ] }
  likesTab: "pieces",
  typing: false,     // the reader is typing — the ad strip pauses
};
let snapshot = { ...state };
const subs = new Set();

function emit() {
  snapshot = { ...state, toggles: { ...state.toggles }, sheet: state.sheet ? { ...state.sheet, stack: [...state.sheet.stack] } : null };
  for (const fn of subs) fn();
}

export function getDock() { return snapshot; }
export function subscribeDock(fn) { subs.add(fn); return () => subs.delete(fn); }
export function useDock() { return useSyncExternalStore(subscribeDock, getDock, getDock); }

export function setMode(mode) { state.mode = mode === "search" ? "search" : "base"; emit(); }
export function setQuery(q) { state.q = String(q || "").slice(0, 200); emit(); }
export function setTyping(on) { state.typing = !!on; emit(); }
export function flipToggle(id) { state.toggles = toggleContent(state.toggles, id); emit(); }
export function setLikesTab(tab) { state.likesTab = ["pieces", "wire", "sold"].includes(tab) ? tab : "pieces"; emit(); }

/** Open the one sheet. Opening another replaces it — never two stacked
 *  translucent sheets. Entering Likes or Messages also enters search mode
 *  (the brief), without the keyboard. */
export function openSheet(id, props = {}) {
  state.sheet = { id, stack: [{ view: id, props }] };
  if (id === "likes" || id === "messages" || id === "search") state.mode = "search";
  emit();
}
/** A detail inside the open sheet — Back returns to what was there. */
export function pushSheet(view, props = {}) {
  if (!state.sheet) { openSheet(view, props); return; }
  state.sheet.stack.push({ view, props });
  emit();
}
export function backSheet() {
  if (!state.sheet) return;
  if (state.sheet.stack.length > 1) state.sheet.stack.pop(); else state.sheet = null;
  emit();
}
export function closeSheet() {
  state.sheet = null;
  emit();
}
/** Leave search mode: the field clears, the sheet closes, the tabs return. */
export function closeSearch() {
  state.mode = "base"; state.q = ""; state.sheet = null; state.typing = false;
  emit();
}
