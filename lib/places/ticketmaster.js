// lib/places/ticketmaster.js — LIVE EVENTS ON THE MAP: the Ticketmaster
// Discovery API (owner, 30 Oct 2026: "I need a ticket company API").
// SERVER-ONLY.
//
// WHAT THIS IS. Discovery is Ticketmaster's public, keyed, read-only catalog
// of events: the show, the venue and its coordinates, the dates, the price
// range when published, the event's own image, and the page where tickets
// are sold. Each event becomes a row in the same shape as the places
// register (lib/places/registry.js) — kind "concert", dated, `sample:
// false`, `live: true`, its `sourceUrl` the Ticketmaster page — so the map,
// the PLACE cards, the places panel and the BRDCST footer draw it as they
// draw any sourced row. ASILUM sells nothing here: TICKETS ↗ is a link out,
// exactly as the purchase-ticket lane links out (CONSTITUTION §2).
//
// HONEST OFF. Nothing runs without TICKETMASTER_API_KEY. Unkeyed, the places
// route answers the register alone and says `live.enabled: false` with the
// reason. The key's published quota is 5 000 calls a day and five a second;
// responses are cached in memory for ten minutes by centre and radius.

import { readJsonResponse } from "../security/http.js";
import { PLACE_STATUSES } from "./registry.js";

const TM_HOST = "https://app.ticketmaster.com";
const TM_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
const EVENT_CACHE_MAX = 64;

export const TICKETMASTER_SOURCE = "Ticketmaster Discovery API";

export function ticketmasterEnabled() {
  return !!process.env.TICKETMASTER_API_KEY;
}

const STATUS = Object.freeze({ onsale: "upcoming", offsale: "upcoming", cancelled: "canceled", canceled: "canceled", postponed: "postponed", rescheduled: "postponed" });

function bestImage(images) {
  const list = (Array.isArray(images) ? images : []).filter((i) => i && typeof i.url === "string" && /^https:\/\//.test(i.url));
  // a wide image, large enough for a card, the 3:2 the cards prefer first
  const score = (i) => (i.ratio === "3_2" ? 2 : i.ratio === "16_9" ? 1 : 0) * 10_000 + Math.min(Number(i.width) || 0, 2048);
  return list.filter((i) => (Number(i.width) || 0) >= 500).sort((a, b) => score(b) - score(a))[0]?.url || list[0]?.url || null;
}

/** One Discovery event → one places row, or null when it lacks a venue
 *  with coordinates, a date or a name — a pin needs a place to be. */
export function normalizeTicketmasterEvent(ev, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!ev || typeof ev !== "object" || !ev.id || !ev.name) return null;
  const venue = ev._embedded && Array.isArray(ev._embedded.venues) ? ev._embedded.venues[0] : null;
  const lat = venue && venue.location ? Number(venue.location.latitude) : NaN;
  const lng = venue && venue.location ? Number(venue.location.longitude) : NaN;
  const start = ev.dates && ev.dates.start ? ev.dates.start : null;
  const startsAt = start && typeof start.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start.localDate) ? start.localDate : null;
  if (!venue || !Number.isFinite(lat) || !Number.isFinite(lng) || !startsAt) return null;
  const end = ev.dates && ev.dates.end && typeof ev.dates.end.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ev.dates.end.localDate) ? ev.dates.end.localDate : null;
  const code = ev.dates && ev.dates.status && typeof ev.dates.status.code === "string" ? ev.dates.status.code.toLowerCase() : "";
  const status = STATUS[code] || "upcoming";
  const cls = Array.isArray(ev.classifications) ? ev.classifications[0] : null;
  const genre = cls && cls.genre && cls.genre.name && cls.genre.name !== "Undefined" ? String(cls.genre.name) : null;
  const acts = ev._embedded && Array.isArray(ev._embedded.attractions) ? ev._embedded.attractions.map((a) => a && a.name).filter(Boolean).slice(0, 4) : [];
  const price = Array.isArray(ev.priceRanges) && ev.priceRanges[0] && Number.isFinite(Number(ev.priceRanges[0].min))
    ? `${ev.priceRanges[0].currency || "USD"} ${Number(ev.priceRanges[0].min)}${Number.isFinite(Number(ev.priceRanges[0].max)) && Number(ev.priceRanges[0].max) !== Number(ev.priceRanges[0].min) ? "–" + Number(ev.priceRanges[0].max) : ""}`
    : null;
  const city = venue.city && venue.city.name ? String(venue.city.name) : null;
  const url = typeof ev.url === "string" && /^https:\/\//.test(ev.url) ? ev.url : null;
  const sold = code === "offsale";
  return {
    id: "tm-" + String(ev.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
    kind: "concert", dated: true, sample: false, live: true, source: TICKETMASTER_SOURCE,
    name: String(ev.name).slice(0, 160),
    organizer: ev.promoter && ev.promoter.name ? String(ev.promoter.name).slice(0, 120) : "Ticketmaster (the event's own listing)",
    city, region: city, country: venue.country && venue.country.name ? String(venue.country.name) : null,
    address: [venue.name, venue.address && venue.address.line1, city, venue.state && venue.state.stateCode].filter(Boolean).join(", ") || null,
    lat: +lat.toFixed(5), lng: +lng.toFixed(5), tz: venue.timezone || (ev.dates && ev.dates.timezone) || null,
    startsAt, endsAt: end || startsAt, time: start && typeof start.localTime === "string" ? start.localTime.slice(0, 5) : null,
    admission: sold ? "not on sale at the moment — the listing says" : "tickets on Ticketmaster",
    price,
    sourceUrl: url, image: bestImage(ev.images),
    imageStatus: "the event's own image, served by Ticketmaster with its listing",
    lastChecked: today,
    status: PLACE_STATUSES.includes(status) ? status : "upcoming",
    note: [acts.length ? acts.join(", ") : null, venue.name ? "at " + venue.name : null, genre].filter(Boolean).join(" · ") || "a listed event",
    tags: [],
    genre,
    acts,
  };
}

const cache = new Map(); // key → { at, rows }

function cacheKey({ near, size, keyword }) {
  return JSON.stringify([near ? [+(near.lat).toFixed(2), +(near.lng).toFixed(2), Math.round(near.km)] : null, size, keyword || ""]);
}

/** The Discovery request for a centre (or the country, with none). Exported
 *  so a test can see the parameters without a network. */
export function discoveryUrl({ near = null, size = 20, keyword = null, apikey = process.env.TICKETMASTER_API_KEY || "" } = {}) {
  const u = new URL(TM_HOST + "/discovery/v2/events.json");
  u.searchParams.set("apikey", apikey);
  u.searchParams.set("classificationName", "music");
  u.searchParams.set("size", String(Math.max(1, Math.min(50, size | 0 || 20))));
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    u.searchParams.set("latlong", `${(+near.lat).toFixed(4)},${(+near.lng).toFixed(4)}`);
    u.searchParams.set("radius", String(Math.max(1, Math.min(500, Math.round(near.km || 80)))));
    u.searchParams.set("unit", "km");
    u.searchParams.set("sort", "date,asc");
  } else {
    u.searchParams.set("countryCode", process.env.TICKETMASTER_COUNTRY || "US");
    u.searchParams.set("sort", "relevance,desc");
  }
  if (keyword) u.searchParams.set("keyword", String(keyword).slice(0, 80));
  return u.toString();
}

/** Live events as places rows: [] when the seam is off or the call fails
 *  (the places route reports which). Cached ten minutes. */
export async function liveEvents({ near = null, size = 20, keyword = null } = {}) {
  if (!ticketmasterEnabled()) return { enabled: false, rows: [], reason: "live events are off — set TICKETMASTER_API_KEY to read the Ticketmaster Discovery API" };
  const key = cacheKey({ near, size, keyword });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { enabled: true, rows: hit.rows, cached: true };
  try {
    const res = await fetch(discoveryUrl({ near, size, keyword }), { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(TM_TIMEOUT_MS) });
    if (!res.ok) return { enabled: true, rows: [], reason: `Ticketmaster answered ${res.status}` };
    const data = await readJsonResponse(res, { maxBytes: MAX_RESPONSE_BYTES });
    const events = data && data._embedded && Array.isArray(data._embedded.events) ? data._embedded.events : [];
    const seen = new Set();
    const rows = events.map((e) => normalizeTicketmasterEvent(e)).filter((r) => r && !seen.has(r.id) && seen.add(r.id));
    if (cache.size >= EVENT_CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), rows });
    return { enabled: true, rows };
  } catch (e) {
    return { enabled: true, rows: [], reason: "Ticketmaster could not be reached: " + String(e && e.message || e).slice(0, 120) };
  }
}

export function _resetTicketmasterCache() { cache.clear(); }
