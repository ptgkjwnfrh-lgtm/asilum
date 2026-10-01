// lib/viewstate.js — THE VIEW-STATE REGISTRY (V.2 brief, owner, 1 Oct 2026,
// §2 "State and feed parking").
//
// Every root, sheet route and subtab keeps its state for the active
// session, keyed by viewer + route + subtab + normalised query + filters
// (lib/dock.js stateKey). What is kept: the visible item id and its offset
// from the top of the viewport, the feed cursor/snapshot the page hands
// in, and a fallback pixel position. On return the page renders its cached
// order first, restores the anchor, then fetches new data WITHOUT
// inserting above the reader — new items wait behind a "New pieces/posts"
// button (the page's job; this module only remembers). A removed anchor
// restores to the nearest surviving neighbour (restoreAnchor).
//
// Storage is sessionStorage: it lasts until the tab closes, survives a
// background/foreground transition, and is wiped on sign-out or account
// switch (clearViewer). Message text never enters it — the Messages sheet
// stores only its scroll anchor. Everything here is a convenience; a page
// must render correctly with none of it (private windows throw).

import { stateKey } from "./dock.js";

const PREFIX = "asilum-view:";
const MAX_ENTRIES = 60;
const MAX_ORDER = 400;

function store() {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

function readAll() {
  const s = store();
  if (!s) return [];
  const out = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k);
    }
  } catch {}
  return out;
}

/** Remember a surface's state. `order` is the list of visible item ids in
 *  their served order (capped), `anchor` the id at the top of the viewport
 *  and `offset` its distance from the viewport top in px. */
export function saveView(keyParts, { anchor = null, offset = 0, cursor = null, order = [], y = 0, extra = null } = {}) {
  const s = store();
  if (!s) return false;
  const key = PREFIX + stateKey(keyParts);
  const record = {
    at: Date.now(), anchor: anchor == null ? null : String(anchor), offset: Math.round(Number(offset) || 0),
    cursor: cursor == null ? null : cursor, order: Array.isArray(order) ? order.slice(0, MAX_ORDER).map(String) : [],
    y: Math.round(Number(y) || 0), extra: extra && typeof extra === "object" ? extra : null,
  };
  try {
    s.setItem(key, JSON.stringify(record));
    // bound the registry: drop the oldest entries past the cap
    const keys = readAll();
    if (keys.length > MAX_ENTRIES) {
      const aged = keys.map((k) => { let at = 0; try { at = JSON.parse(s.getItem(k) || "{}").at || 0; } catch {} return [k, at]; })
        .sort((a, b) => a[1] - b[1]);
      for (const [k] of aged.slice(0, keys.length - MAX_ENTRIES)) s.removeItem(k);
    }
    return true;
  } catch { return false; }
}

/** The remembered state for a surface, or null. */
export function readView(keyParts) {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + stateKey(keyParts));
    if (!raw) return null;
    const r = JSON.parse(raw);
    return r && typeof r === "object" ? r : null;
  } catch { return null; }
}

/** Forget one surface. */
export function clearView(keyParts) {
  const s = store();
  if (!s) return;
  try { s.removeItem(PREFIX + stateKey(keyParts)); } catch {}
}

/** Forget everything a viewer had — sign-out and account switch. */
export function clearViewer(viewer = null) {
  const s = store();
  if (!s) return 0;
  let n = 0;
  for (const k of readAll()) {
    const inner = k.slice(PREFIX.length);
    if (viewer == null || inner.startsWith(String(viewer) + "|")) { try { s.removeItem(k); n++; } catch {} }
  }
  return n;
}

/**
 * Which id to scroll to after a return. The remembered anchor if it still
 * exists; otherwise the nearest surviving neighbour in the remembered order
 * (the one just before it, then the one just after); null when nothing of
 * the old order survived. Pure, so a test can hand it lists.
 */
export function restoreAnchor(record, presentIds) {
  if (!record) return null;
  const present = new Set((presentIds || []).map(String));
  if (record.anchor && present.has(record.anchor)) return record.anchor;
  const order = Array.isArray(record.order) ? record.order : [];
  const at = record.anchor ? order.indexOf(record.anchor) : -1;
  if (at < 0) return order.find((id) => present.has(id)) || null;
  for (let d = 1; d < order.length; d++) {
    const before = order[at - d], after = order[at + d];
    if (before != null && present.has(before)) return before;
    if (after != null && present.has(after)) return after;
  }
  return null;
}

/**
 * The ids that arrived since the remembered order — the ones a page holds
 * behind "New pieces/posts" instead of inserting above the reader. Order
 * is the fresh served order; the answer is the prefix of it that was not
 * known before the remembered anchor's position.
 */
export function newAbove(record, freshIds) {
  if (!record || !Array.isArray(record.order) || !record.order.length) return [];
  const known = new Set(record.order);
  const out = [];
  for (const id of freshIds || []) {
    const s = String(id);
    if (known.has(s)) break;
    out.push(s);
  }
  return out;
}

/** The scroll anchor of a scrolling element right now: the first child
 *  with a data-id at or below the top, and its offset. */
export function currentAnchor(container, selector = "[data-id]") {
  if (typeof document === "undefined") return { anchor: null, offset: 0, y: 0 };
  const root = container || document.documentElement;
  const y = container ? container.scrollTop : (window.scrollY || 0);
  const top = container ? container.getBoundingClientRect().top : 0;
  const nodes = root.querySelectorAll(selector);
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.bottom - top > 0) return { anchor: n.getAttribute("data-id"), offset: Math.round(r.top - top), y };
  }
  return { anchor: null, offset: 0, y };
}

/** Scroll so the anchor sits where it was. Returns true when it found it. */
export function scrollToAnchor(record, container, selector = "[data-id]") {
  if (typeof document === "undefined" || !record) return false;
  const root = container || document;
  const id = record.anchor;
  const node = id ? root.querySelector(`${selector.replace("]", "")}="${CSS.escape(id)}"]`) : null;
  if (!node) {
    if (container) container.scrollTop = record.y || 0; else window.scrollTo(0, record.y || 0);
    return false;
  }
  const r = node.getBoundingClientRect();
  const top = container ? container.getBoundingClientRect().top : 0;
  const delta = r.top - top - (record.offset || 0);
  if (container) container.scrollTop += delta; else window.scrollBy(0, delta);
  return true;
}
