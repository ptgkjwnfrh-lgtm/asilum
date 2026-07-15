// lib/wardrobe/index.js — the ownership model (handoff Feature C, Phase 3a).
// A wardrobe row exists ONLY because the user said so: manual add, a catalog
// piece they marked owned, or an "I bought it" purchase-ticket outcome. Bag
// and favorites are intent, never ownership — that invariant lives here.
// Everything is private; there is no sharing surface (owner decision #4
// pending). Photo uploads (source "upload", private Storage) are Phase 3b —
// gated OFF behind WARDROBE_UPLOADS_ENABLED until the bucket ships.

import { deduceProduct } from "../brain/index.js";
import { getItem } from "../db/index.js";
import { getTicket, createWardrobeItem, listWardrobeItems } from "../db/production.js";

// Register contract (docs/FEATURE-FLAGS.md): flags off → stylist behaves as
// today. Core wardrobe is real and dependency-free, so it defaults ON;
// uploads stay OFF until private Storage exists.
export function wardrobeEnabled() {
  return (process.env.WARDROBE_ENABLED ?? "1") !== "0";
}
export function wardrobeUploadsEnabled() {
  return process.env.WARDROBE_UPLOADS_ENABLED === "1";
}

// The stylist's slot vocabulary (lib/brain/stylist.js SLOTS) — a wardrobe
// piece must land in one of these to anchor a look.
export const WARDROBE_CATEGORIES = Object.freeze([
  "outerwear", "tops", "knitwear", "tailoring", "bottoms",
  "footwear", "accessories", "dresses",
]);

const MAX_TAGS = 24;

function cleanString(value, max) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

// Deterministic tag derivation for manual pieces: the same lexicon walk the
// moodboard filename path uses — never invented, conf comes from the brain's
// own token resolution. Catalog-sourced pieces keep their real item tags.
export function tagsFromDescription(text) {
  const tokens = String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const vec = deduceProduct(tokens);
  const entries = Object.entries(vec)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS)
    .map(([tag, w]) => [tag, +w.toFixed(4)]);
  return Object.fromEntries(entries);
}

// Validate + normalize one add request into a row shape, resolving catalog
// and ticket sources against their real records. Atomic: any bad field → error.
export async function normalizeWardrobeAdd(userId, input = {}) {
  const source = String(input.source || "manual");

  if (source === "catalog") {
    const itemId = cleanString(input.itemId, 80);
    if (!itemId) return { ok: false, error: "itemId required for catalog source" };
    const item = await getItem(itemId);
    if (!item) return { ok: false, error: "catalog item not found" };
    return {
      ok: true,
      row: {
        userId, source, sourceRef: `catalog:${item.id}`, catalogItemId: item.id,
        title: String(item.title || item.id).slice(0, 200),
        brand: item.brand || null,
        category: WARDROBE_CATEGORIES.includes(item.category) ? item.category : null,
        sizeLabel: cleanString(input.sizeLabel, 40),
        colors: Array.isArray(item.colors) ? item.colors.slice(0, 8) : [],
        tags: item.tags && typeof item.tags === "object" ? item.tags : {},
        acquiredAt: null,
      },
    };
  }

  if (source === "ticket") {
    const ticketId = cleanString(input.ticketId, 80);
    if (!ticketId) return { ok: false, error: "ticketId required for ticket source" };
    const ticket = await getTicket(ticketId);
    if (!ticket || ticket.userId !== userId) return { ok: false, error: "ticket not found" };
    if (ticket.userReportedOutcome !== "bought") {
      return { ok: false, error: "only tickets you reported as bought can join the wardrobe" };
    }
    const item = ticket.productId ? await getItem(ticket.productId).catch(() => null) : null;
    return {
      ok: true,
      row: {
        userId, source, sourceRef: `ticket:${ticket.id}`,
        catalogItemId: item ? item.id : null,
        title: String(item?.title || `piece via ${ticket.sourceName || "purchase ticket"}`).slice(0, 200),
        brand: item?.brand || null,
        category: item && WARDROBE_CATEGORIES.includes(item.category) ? item.category : null,
        sizeLabel: cleanString(input.sizeLabel, 40),
        colors: Array.isArray(item?.colors) ? item.colors.slice(0, 8) : [],
        tags: item?.tags && typeof item.tags === "object" ? item.tags : {},
        acquiredAt: ticket.outcomeReportedAt ? new Date(ticket.outcomeReportedAt) : null,
      },
    };
  }

  if (source === "manual") {
    const title = cleanString(input.title, 200);
    if (!title) return { ok: false, error: "title required (1-200 chars)" };
    const category = input.category == null ? null : String(input.category);
    if (category !== null && !WARDROBE_CATEGORIES.includes(category)) {
      return { ok: false, error: `category must be one of: ${WARDROBE_CATEGORIES.join(", ")}` };
    }
    const brand = input.brand == null ? null : cleanString(input.brand, 120);
    if (input.brand != null && brand === null) return { ok: false, error: "invalid brand" };
    return {
      ok: true,
      row: {
        userId, source, sourceRef: null, catalogItemId: null,
        title, brand, category,
        sizeLabel: cleanString(input.sizeLabel, 40),
        colors: [],
        tags: tagsFromDescription([title, brand, category].filter(Boolean).join(" ")),
        acquiredAt: null,
      },
    };
  }

  // source "upload" arrives in Phase 3b with private Storage + consent.
  return { ok: false, error: "source must be manual, catalog, or ticket" };
}

export async function addWardrobeItem(userId, input) {
  const normalized = await normalizeWardrobeAdd(userId, input);
  if (!normalized.ok) return normalized;
  const record = await createWardrobeItem(normalized.row);
  return { ok: true, item: record.item, duplicate: !!record.duplicate };
}

// Anchor synthesis for the stylist: an owned piece becomes an item-shaped
// anchor. buildOutfit slots it by category and never re-buys it (price 0,
// owned flag) — the look is built AROUND it.
export function wardrobeAnchor(row) {
  if (!row || row.status !== "active") return null;
  return {
    id: `wardrobe:${row.id}`,
    title: row.title,
    brand: row.brand || "your wardrobe",
    category: row.category || "accessories",
    tags: row.tags || {},
    price: 0,
    owned: true,
  };
}

export async function listWardrobe(userId, { status = "active" } = {}) {
  return listWardrobeItems(userId, { status });
}
