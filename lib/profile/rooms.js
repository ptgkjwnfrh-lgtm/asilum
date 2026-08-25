// lib/profile/rooms.js — MySpace-inspired profile rooms (handoff Feature E).
// A room is a signed-in user's OWN corner of the magazine: a claimed handle,
// a theme from the operator registry, and a small set of modules. Per
// ADR-002 rooms are a social/trust domain — rows key on the VERIFIED auth
// uuid (accountIdFromIdentity); device (u-) identities can never hold one.
//
// Honesty rules carried over from the rest of the app:
//   - `statement` and `soundtrack` are the ONLY stored content, and the
//     statement passes a deterministic sanitize + screen pipeline. A tripped
//     screen files a moderation task and parks the room under_review — the
//     owner still sees their draft; the public never sees an unreviewed flag.
//   - `top-pieces` and `brands` derive at read time from real signals
//     (user_events, user_follows) — the rails doctrine: content never drifts
//     from the source it cites.
//   - Themes are bounded visual tokens applied only inside the room wrapper.
//     The magazine shell is LOCKED and never re-themes.

import { CULTURE } from "../asterisk/culture.js";
import { resolveProducts, publicProduct } from "../products.js";
import { listEvents } from "../db/index.js";
import {
  listFollows,
  listProfileThemes, getProfileRoom, getProfileRoomByHandle, listProfileModules,
} from "../db/production.js";

export function profileRoomsEnabled() {
  return (process.env.PROFILE_THEMES_ENABLED ?? "1") !== "0";
}

export const STATEMENT_MAX = 600;
export const ANTHEM_MAX = 3;
export const TOP_PIECES_MAX = 6;
export const BRANDS_MAX = 12;

// Module catalog: which sections exist, their default order, and whether
// they store content or derive it live.
export const ROOM_MODULES = Object.freeze([
  { id: "statement", title: "STATEMENT", stores: true, defaultVisible: true, note: "your words, sanitized plain text" },
  { id: "soundtrack", title: "ROOM ANTHEM", stores: true, defaultVisible: true, note: "up to three picks from the culture catalog" },
  { id: "top-pieces", title: "TOP PIECES", stores: false, defaultVisible: false, note: "private until enabled; then derives live from favorites and saves" },
  { id: "brands", title: "BRANDS ON RECORD", stores: false, defaultVisible: false, note: "private until enabled; then derives live from followed brands" },
]);
export const MODULE_IDS = Object.freeze(ROOM_MODULES.map((m) => m.id));

// The handle vocabulary lives in handles.js — a constants-only module the
// CLIENT can import (this file reaches the database, so a client import of
// it puts `pg` in the browser bundle). Re-exported here so every existing
// importer keeps working and there is still one source of truth.
export { RESERVED_HANDLES, HANDLE_RE } from "./handles.js";
import { RESERVED_HANDLES, HANDLE_RE } from "./handles.js";

/**
 * Normalise and check a profile handle. THROWS on anything invalid or reserved.
 *
 * Throwing rather than returning null is deliberate here: a handle is an
 * identity, and a caller that forgot to check must not end up creating a room
 * at "" or at a reserved route name.
 */
export function validateHandle(raw) {
  const handle = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!HANDLE_RE.test(handle)) {
    throw new TypeError("handle must be 3-24 chars: lowercase letters, digits, hyphens");
  }
  if (RESERVED_HANDLES.includes(handle)) throw new TypeError("that handle is reserved");
  return handle;
}

// ── Statement pipeline ─────────────────────────────────────────────────────

// Deterministic sanitize: plain text only. Angle brackets go entirely —
// there is no markup in a statement, so none survives to be misrendered.
export function sanitizeStatement(raw, max = STATEMENT_MAX) {
  if (typeof raw !== "string") throw new TypeError("statement must be a string");
  const text = raw
    .replace(/\r\n?/g, "\n")
    // control characters except newline
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (text.length > max) {
    throw new TypeError(`statement is capped at ${max} characters`);
  }
  return text;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const URL_RE = /https?:\/\//gi;

// Deterministic screen — no models, no guesses. A flag does not block the
// owner's draft; it parks the PUBLIC room under review and files a
// moderation task for a human.
export function screenStatement(text) {
  const flags = [];
  if (EMAIL_RE.test(text)) flags.push("contact-email");
  if (PHONE_RE.test(text)) flags.push("contact-phone");
  if ((text.match(URL_RE) || []).length > 2) flags.push("link-heavy");
  return flags;
}

// ── Anthem (soundtrack module) ─────────────────────────────────────────────

function musicIndex() {
  const byKey = new Map();
  for (const rec of CULTURE) {
    if (rec.kind !== "music") continue;
    byKey.set(rec.name.toLowerCase(), rec);
    for (const alias of rec.aliases || []) byKey.set(alias.toLowerCase(), rec);
  }
  return byKey;
}

/** The music entities a room may pick as its soundtrack — REAL culture-catalog
 *  records only, sorted. Free text is not accepted: an anthem is stored as a
 *  canonical name so the room can render its reading live. */
export function anthemChoices() {
  return CULTURE.filter((rec) => rec.kind === "music").map((rec) => rec.name).sort();
}

// Anthem picks must be REAL culture-catalog music entities — stored as
// canonical names so the room can render their readings live.
export function validateAnthem(entities) {
  if (!Array.isArray(entities) || entities.length > ANTHEM_MAX) {
    throw new TypeError(`soundtrack takes an array of up to ${ANTHEM_MAX} entities`);
  }
  const index = musicIndex();
  const canonical = [];
  for (const raw of entities) {
    const rec = typeof raw === "string" ? index.get(raw.trim().toLowerCase()) : null;
    if (!rec) throw new TypeError(`unknown music entity: ${String(raw).slice(0, 60)}`);
    if (!canonical.includes(rec.name)) canonical.push(rec.name);
  }
  return canonical;
}

function anthemCards(entities) {
  const index = musicIndex();
  return (entities || []).map((name) => {
    const rec = index.get(String(name).toLowerCase());
    if (!rec) return null;
    const interp = (rec.interpretations || [])[0] || {};
    return { name: rec.name, note: rec.note || null, label: interp.label || null, tags: interp.tags || [] };
  }).filter(Boolean);
}

// ── Assembly ───────────────────────────────────────────────────────────────

async function deriveModuleContent(moduleId, storedContent, accountId) {
  const textUid = "sb-" + accountId;
  if (moduleId === "statement") {
    return { text: typeof storedContent?.text === "string" ? storedContent.text : "" };
  }
  if (moduleId === "soundtrack") {
    return { entities: anthemCards(storedContent?.entities) };
  }
  if (moduleId === "top-pieces") {
    const signals = ["USER_FAVORITED_ITEM", "USER_SAVED_ITEM", "USER_ADDED_TO_BAG"];
    const events = await listEvents(textUid, 300);
    const ids = [];
    for (const event of events) {
      const itemId = event.payload?.itemId;
      if (!signals.includes(event.type) || !itemId || ids.includes(itemId)) continue;
      ids.push(itemId);
      if (ids.length >= TOP_PIECES_MAX) break;
    }
    const resolved = await resolveProducts(ids);
    const items = ids.map((id) => resolved.get(id)).filter(Boolean).map(publicProduct).filter(Boolean);
    return { items, basis: "your most recent favorites, saves, and bags" };
  }
  if (moduleId === "brands") {
    const follows = await listFollows(textUid);
    const brands = follows.filter((f) => f.kind === "brand").slice(0, BRANDS_MAX).map((f) => f.target);
    return { brands, basis: "brands you follow" };
  }
  return {};
}

function themeCard(theme) {
  return theme ? { id: theme.id, name: theme.name, tokens: theme.tokens || {} } : null;
}

async function assemble(room, { includeHidden }) {
  const [themes, moduleRows] = await Promise.all([
    listProfileThemes(),
    listProfileModules(room.accountId),
  ]);
  const stored = new Map(moduleRows.map((row) => [row.module, row]));
  const modules = [];
  for (const def of ROOM_MODULES) {
    const row = stored.get(def.id);
    const visible = row ? row.visible : def.defaultVisible;
    if (!visible && !includeHidden) continue;
    modules.push({
      module: def.id,
      title: def.title,
      position: row?.position ?? ROOM_MODULES.findIndex((m) => m.id === def.id) * 10 + 10,
      visible,
      content: await deriveModuleContent(def.id, row?.content, room.accountId),
    });
  }
  modules.sort((a, b) => a.position - b.position || a.module.localeCompare(b.module));
  const theme = themeCard(themes.find((t) => t.id === room.themeId && t.enabled)
    || themes.find((t) => t.id === "asilum") || themes[0]);
  return {
    handle: room.handle || null,
    theme,
    published: room.published,
    moderationStatus: room.moderationStatus,
    modules,
    updatedAt: room.updatedAt || null,
  };
}

// The owner's view: full room including hidden modules, plus the registry
// and catalogs the editor needs.
export async function ownRoomView(accountId) {
  const room = await getProfileRoom(accountId);
  const themes = await listProfileThemes();
  return {
    room: room ? await assemble(room, { includeHidden: true }) : null,
    themes: themes.filter((t) => t.enabled).map(themeCard),
    moduleCatalog: ROOM_MODULES,
    anthemChoices: anthemChoices(),
    statementMax: STATEMENT_MAX,
  };
}

// The public view: only published rooms whose moderation status is visible,
// only visible modules. Anything else is a plain null — not a hint.
export async function publicRoomView(handle) {
  const room = await getProfileRoomByHandle(handle);
  if (!room || !room.published || room.moderationStatus !== "visible") return null;
  return assemble(room, { includeHidden: false });
}
