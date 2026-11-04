// lib/passport/pages.js — PAGES and NOTES (owner, 3 Nov 2026: "lets edit the system in pinterest terms you can
// stamp anything and you can put those stamps on a page. a stamp is a pin and a page is a board"). A STAMP is
// the one save (lib/save.js, keyed `kind:id`); a PAGE is a named set of stamps the passenger makes; either can
// carry a NOTE. Kept on this device, as the stamps' fast copy is — the server's record store (user_records)
// takes only the kinds its table allows, and a page there needs a migration of its own; until then the
// surfaces say pages live on this device.
//
// Pure apart from the storage it is handed (window.localStorage by default), so the tests run it on a stand-in.

export const PAGES_KEY = "asilum-pages-v1";
export const NOTES_KEY = "asilum-stamp-notes-v1";
export const PAGE_NAME_MAX = 60;
export const NOTE_MAX = 280;
export const stampKey = (s) => `${s.kind}:${s.id}`;

const store = (s) => s || (typeof window !== "undefined" ? window.localStorage : null);
function readJSON(st, key, fallback) { try { const v = JSON.parse(st.getItem(key) || "null"); return v == null ? fallback : v; } catch { return fallback; } }
function writeJSON(st, key, v) { try { st.setItem(key, JSON.stringify(v)); } catch {} }
function emit() { try { window.dispatchEvent(new CustomEvent("asilum:pages")); } catch {} }
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const newId = () => "pg-" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

export function listPages(storage) {
  const st = store(storage); if (!st) return [];
  const pages = readJSON(st, PAGES_KEY, []);
  return Array.isArray(pages) ? pages.filter((p) => p && p.id) : [];
}
function savePages(st, pages) { writeJSON(st, PAGES_KEY, pages); emit(); }
const update = (storage, id, fn) => {
  const st = store(storage); if (!st) return null;
  let out = null;
  const pages = listPages(st).map((p) => (p.id === id ? (out = fn({ ...p, stamps: [...(p.stamps || [])] })) : p));
  if (out) savePages(st, pages);
  return out;
};

export function createPage(name, storage) {
  const st = store(storage); if (!st) return null;
  const page = { id: newId(), name: clean(name, PAGE_NAME_MAX) || "untitled page", note: "", stamps: [], createdAt: new Date().toISOString() };
  savePages(st, [page, ...listPages(st)]);
  return page;
}
export const renamePage = (id, name, storage) => update(storage, id, (p) => ({ ...p, name: clean(name, PAGE_NAME_MAX) || p.name }));
export const setPageNote = (id, note, storage) => update(storage, id, (p) => ({ ...p, note: clean(note, NOTE_MAX) }));
export function deletePage(id, storage) {
  const st = store(storage); if (!st) return false;
  const pages = listPages(st);
  if (!pages.some((p) => p.id === id)) return false;
  savePages(st, pages.filter((p) => p.id !== id));
  return true;
}
/** Put a stamp on a page (newest first) — once; a stamp already there stays where it is. */
export const addToPage = (id, key, storage) => update(storage, id, (p) => (p.stamps.includes(key) ? p : { ...p, stamps: [key, ...p.stamps] }));
export const removeFromPage = (id, key, storage) => update(storage, id, (p) => ({ ...p, stamps: p.stamps.filter((k) => k !== key) }));
export const pagesWith = (key, storage) => listPages(storage).filter((p) => (p.stamps || []).includes(key)).map((p) => p.id);

export function stampNotes(storage) {
  const st = store(storage); if (!st) return {};
  const n = readJSON(st, NOTES_KEY, {});
  return n && typeof n === "object" && !Array.isArray(n) ? n : {};
}
export function setStampNote(key, note, storage) {
  const st = store(storage); if (!st) return;
  const notes = stampNotes(st), v = clean(note, NOTE_MAX);
  if (v) notes[key] = v; else delete notes[key];
  writeJSON(st, NOTES_KEY, notes); emit();
}

// A PAGE'S COVER: up to four of its stamps' pictures in one of six layouts, chosen for the page by its id —
// random across pages ("they all shouldnt be big right card two small left cards stacked let it be random"),
// the same every time one page opens. Each layout is CSS grid areas; `tiles` is how many it shows.
export const COVER_LAYOUTS = Object.freeze([
  { id: "left", tiles: 3 }, { id: "top", tiles: 3 }, { id: "four", tiles: 4 },
  { id: "one", tiles: 1 }, { id: "right", tiles: 3 }, { id: "row", tiles: 3 },
]);
export function coverLayout(pageId) {
  let h = 2166136261;
  for (const c of String(pageId)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return COVER_LAYOUTS[(h >>> 0) % COVER_LAYOUTS.length];
}
