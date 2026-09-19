// lib/location.js — the three location concepts, on the device (V.2).
//
//   base city      persistent, USER-CONFIRMED. Never detected: the control
//                  offers cities and a free field; nothing is written until
//                  the person confirms. (IP suggestion is a production step
//                  — VPNs and cellular routing make it a guess.)
//   current area   optional and TEMPORARY: a browser-geolocation read rounded
//                  to two decimals, kept in sessionStorage for nearby
//                  discovery only, never persisted, never published.
//   public location an INDEPENDENT profile field: what others may see
//                  ("Based in", never "Live in"), at a detail the person
//                  chose, to an audience the person chose. Off by default.
//
// Map discoverability is its own switch, off by default. When city
// visibility is off, the public Passport draws no recognizable map.
//
// Device-local by design for the model: no location column exists in the
// database (audited 17 Sep) and ADR-006 forbids a precise identity from
// ever leaving the device. Production adds the server-side field with its
// own visibility rule; this module's shape is what it would store.

import { CITIES } from "./places/registry.js";

const LOCATION_KEY = "asilum-location";
const AREA_KEY = "asilum-current-area";

export const PUBLIC_DETAILS = Object.freeze(["none", "country", "city", "borough"]);
export const AUDIENCES = Object.freeze(["me", "followers", "everyone"]);

export const DEFAULT_LOCATION = Object.freeze({
  baseCity: null,           // { name, lat, lng, country, region, tz } once confirmed
  confirmedAt: null,
  publicDetail: "none",     // none | country | city | borough
  borough: "",
  audience: "me",           // me | followers | everyone
  mapDiscoverable: false,
});

export function getLocation() {
  try {
    const raw = window.localStorage.getItem(LOCATION_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return { ...DEFAULT_LOCATION, ...(v && typeof v === "object" ? v : {}) };
  } catch { return { ...DEFAULT_LOCATION }; }
}

export function setLocation(patch) {
  const next = { ...getLocation(), ...patch };
  if (!PUBLIC_DETAILS.includes(next.publicDetail)) next.publicDetail = "none";
  if (!AUDIENCES.includes(next.audience)) next.audience = "me";
  next.mapDiscoverable = !!next.mapDiscoverable;
  try { window.localStorage.setItem(LOCATION_KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new CustomEvent("asilum:location", { detail: next })); } catch {}
  // THE RECORD IS REAL (v52): the base city and its visibility mirror to the
  // reader's own private row so they follow a sign-in; the device copy stays
  // the fast path. Best-effort, never blocking — the current AREA
  // (sessionStorage) is deliberately NOT sent: it is never persisted anywhere.
  mirrorLocation(next);
  return next;
}

/** Confirm a base city by its name in CITIES, or a free-text city with a
 *  country and no coordinates (the map then centres on nothing and says so). */
export function confirmBaseCity(name, extra = {}) {
  const known = CITIES[name];
  const baseCity = known
    ? { name, lat: known.lat, lng: known.lng, country: known.country, region: known.region, tz: known.tz }
    : { name: String(name || "").slice(0, 80), lat: null, lng: null, country: String(extra.country || "").slice(0, 60), region: null, tz: null };
  return setLocation({ baseCity, confirmedAt: new Date().toISOString() });
}

export function clearBaseCity() {
  return setLocation({ baseCity: null, confirmedAt: null, mapDiscoverable: false, publicDetail: "none" });
}

/** The "Based in" line a viewer may see, or null. `viewer` is "me",
 *  "follower" or "everyone". */
export function basedInLine(loc, viewer = "everyone") {
  if (!loc || !loc.baseCity) return null;
  const rank = { me: 0, followers: 1, everyone: 2 };
  const allowed = viewer === "me" || rank[viewer === "follower" ? "followers" : viewer] <= rank[loc.audience];
  if (!allowed) return null;
  const c = loc.baseCity;
  switch (loc.publicDetail) {
    case "country": return c.country ? `Based in ${c.country}` : null;
    case "city": return `Based in ${c.name}${c.country ? ", " + c.country : ""}`;
    case "borough": return `Based in ${loc.borough ? loc.borough + ", " : ""}${c.name}`;
    default: return null;
  }
}

/** May a public surface draw a recognizable map of the base city? Only when
 *  the city itself is visible to that viewer. */
export function cityMapAllowed(loc, viewer = "everyone") {
  if (viewer === "me") return !!(loc && loc.baseCity);
  const line = basedInLine(loc, viewer);
  return !!line && loc.publicDetail !== "country";
}

// ---- current area (session only) ----------------------------------------

export function getCurrentArea() {
  try {
    const raw = window.sessionStorage.getItem(AREA_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch { return null; }
}

export function clearCurrentArea() {
  try { window.sessionStorage.removeItem(AREA_KEY); } catch {}
  try { window.dispatchEvent(new CustomEvent("asilum:location")); } catch {}
}

/** Ask the browser once, with consent, and keep only two decimals (~1 km). */
export function requestCurrentArea() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const area = { lat: +pos.coords.latitude.toFixed(2), lng: +pos.coords.longitude.toFixed(2), at: new Date().toISOString() };
        try { window.sessionStorage.setItem(AREA_KEY, JSON.stringify(area)); } catch {}
        try { window.dispatchEvent(new CustomEvent("asilum:location")); } catch {}
        resolve(area);
      },
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 },
    );
  });
}

/** Where nearby discovery centres: the current area if the person asked for
 *  it this session, else the confirmed base city, else nothing. */
export function discoveryCenter() {
  const area = getCurrentArea();
  if (area) return { lat: area.lat, lng: area.lng, label: "your current area", kind: "area" };
  const loc = getLocation();
  if (loc.baseCity && Number.isFinite(loc.baseCity.lat)) return { lat: loc.baseCity.lat, lng: loc.baseCity.lng, label: loc.baseCity.name, kind: "base" };
  return null;
}

// Fire-and-forget mirror of the location record (v52). Kept at the bottom so
// the reading side of this module stays free of any network reference.
function mirrorLocation(next) {
  if (typeof window === "undefined") return;
  import("./records/client.js")
    .then((m) => m.putRecord("location", "base", next))
    .catch(() => {});
}
