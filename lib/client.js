// lib/client.js
// Browser-side helpers: per-device identity, JSON POST, and deterministic
// SVG placeholder thumbnails so the moodboard is visual even for items whose
// sources don't permit image hotlinking.

import { EMPTY_MEASUREMENTS, measurementProfileForBrain } from "./brain/measurements.js";

export function getUid() {
  if (typeof window === "undefined") return null;
  try {
    let u = window.localStorage.getItem("asilum-uid");
    if (!u) {
      u = "u-" + (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
      window.localStorage.setItem("asilum-uid", u);
    }
    return u;
  } catch {
    return "guest";
  }
}

export function setUid(uid) {
  if (typeof window === "undefined" || typeof uid !== "string" || !uid) return false;
  try {
    const previous = window.localStorage.getItem("asilum-uid");
    window.localStorage.setItem("asilum-uid", uid);
    if (previous !== uid) {
      window.dispatchEvent(new CustomEvent("asilum:identity", { detail: { uid } }));
    }
    return true;
  } catch { return false; }
}

async function authorizationHeaders() {
  try {
    const { getSupabase } = await import("./supabase.js");
    const client = await getSupabase();
    if (!client) return {};
    const { data } = await client.auth.getSession();
    return data?.session?.access_token
      ? { Authorization: "Bearer " + data.session.access_token }
      : {};
  } catch { return {}; }
}

let deviceReady = null;
// Identity is a PREFERENCE, not a precondition. This used to throw when
// /api/auth was unavailable, and because every client surface goes through
// authorizedFetch, a single 429 on issuance blanked the whole product —
// including the endpoints the server is perfectly happy to serve anonymously
// (/api/discover, /api/search, /api/related, /api/suggest, /api/editorial).
// Resolving to null instead lets the request proceed without an identity and
// the experience degrade to un-personalized.
async function ensureDeviceCookie() {
  if (!deviceReady) {
    deviceReady = fetch("/api/auth", { cache: "no-store" }).then(async (res) => {
      // WHAT WAS WRONG (Aug 8, codebase audit). This returned null WITHOUT
      // clearing deviceReady, so an HTTP failure resolved the cached promise
      // and every later call reused it — for the lifetime of the page. The
      // "retry on the next call rather than caching the failure forever"
      // comment below is in the .catch, which only covers a THROWN error
      // (offline, DNS). The !res.ok path is the one that actually happens:
      // /api/auth answers 429 when GLOBAL_BUDGET_IDENTITY_ISSUE is exhausted
      // and 503 when DEVICE_COOKIE_SECRET is unset. A single 429 during a
      // burst left that visitor with no device cookie until they reloaded —
      // long after the limit cleared seconds later — so nothing personalized,
      // and every identity-bearing write 401'd. It also cascades: /api/stats
      // then returns 401 "identity required".
      if (!res.ok) { deviceReady = null; return null; }
      const data = await res.json().catch(() => null);
      if (!data?.uid) { deviceReady = null; return null; }
      return data.uid;
    }).catch(() => {
      // Retry on the next call rather than caching the failure forever.
      deviceReady = null;
      return null;
    });
  }
  return deviceReady;
}

export async function authorizedFetch(url, options = {}) {
  const [deviceUid, auth] = await Promise.all([ensureDeviceCookie(), authorizationHeaders()]);
  if (!auth.Authorization && deviceUid) setUid(deviceUid);
  return fetch(url, { ...options, headers: { ...(options.headers || {}), ...auth } });
}

export function postJSON(url, payload) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload)
    ? { operationId: newOperationId(), ...payload }
    : payload;
  return authorizedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function newOperationId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export { safeExternalUrl } from "./url.js";

export function sendJSON(method, url, payload) {
  return authorizedFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Small deterministic hash — masonry aspect ratios, post-tile picks, etc.
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Masonry tile aspect, deterministic per item id — the ONE aspect table for
// every grid (owner order, Aug 12: feed images vary in size; a wide band,
// from tall 3/5 crops to just-past-square). Shared here so home and
// discover can never drift apart again.
export const ASPECTS = ["3 / 4", "1 / 1", "2 / 3", "4 / 5", "5 / 8", "7 / 8", "3 / 5", "21 / 20"];
export function aspectFor(id) {
  return ASPECTS[hashStr(String(id)) % ASPECTS.length];
}

// ---- Bag (client-side cart; adds are also a purchase-intent signal) ---------

const BAG_KEY = "asilum-bag";

export function bagList() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(BAG_KEY)) || []; } catch { return []; }
}
function bagSave(list) {
  try { window.localStorage.setItem(BAG_KEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new Event("asilum:bag"));
}
export function bagAdd(item) {
  const list = bagList();
  if (!list.some((x) => x.id === item.id)) {
    const { id, title, brand, price, currency, img, tags } = item;
    list.push({ id, title, brand, price, currency, img, tags });
    bagSave(list);
  }
  return list;
}
export function bagRemove(id) {
  bagSave(bagList().filter((x) => x.id !== id));
}

// ---- Fit profile ------------------------------------------------------------
// Cached on-device for instant cards and persisted through the authenticated
// first-party measurements API. Values are never placed in a URL or forwarded
// to a merchant/external model.

const FIT_KEY = "asilum-fit-profile";
export const EMPTY_FIT = EMPTY_MEASUREMENTS;

export function loadFitProfile() {
  if (typeof window === "undefined") return { ...EMPTY_FIT };
  try {
    const raw = window.localStorage.getItem(FIT_KEY);
    return raw ? { ...EMPTY_FIT, ...JSON.parse(raw) } : { ...EMPTY_FIT };
  } catch { return { ...EMPTY_FIT }; }
}
export function saveFitProfile(p) {
  const profile = { ...EMPTY_FIT, ...(p || {}) };
  try { window.localStorage.setItem(FIT_KEY, JSON.stringify(profile)); } catch {}
  window.dispatchEvent(new CustomEvent("asilum:fit", { detail: profile }));
  return profile;
}
export function clearFitProfile() {
  return saveFitProfile(EMPTY_FIT);
}
export function fitProfileForBrain(f) {
  return measurementProfileForBrain(f);
}

export async function loadServerFitProfile(user = getUid()) {
  const response = await authorizedFetch("/api/measurements?user=" + encodeURIComponent(user || ""));
  if (!response.ok) throw new Error("measurements unavailable");
  const data = await response.json();
  return { ...EMPTY_FIT, ...(data.profile || {}) };
}

export async function saveServerFitProfile(profile, user = getUid()) {
  const response = await sendJSON("PUT", "/api/measurements", { user, profile });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "measurements could not be saved");
  const saved = { ...EMPTY_FIT, ...(data.profile || {}) };
  saveFitProfile(saved);
  return saved;
}

// ---- Placeholder thumbnails -------------------------------------------------
// Deterministic per item: gradient from the item's dominant aesthetic tags plus
// a brand monogram, so cards are recognizable and the grid reads as a moodboard.

const TAG_BASE = {
  "AVANT-GARDE": "#232326", SEDUCTIVE: "#3d1220", STATEMENT: "#4a2a06",
  TAILORED: "#1d2430", ARCHIVAL: "#2e2a20", MINIMAL: "#26262b",
  UTILITARIAN: "#26301f", STREETWEAR: "#12303a", GORP: "#1d3327",
  INDEPENDENT: "#33202e",
};
const TAG_ACCENT = {
  "AVANT-GARDE": "#8a8a95", SEDUCTIVE: "#c25a72", STATEMENT: "#d99a3d",
  TAILORED: "#7d93b5", ARCHIVAL: "#b5a878", MINIMAL: "#9fa3ad",
  UTILITARIAN: "#8fae6b", STREETWEAR: "#5db4c9", GORP: "#6dbb8a",
  INDEPENDENT: "#b07fae",
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function thumbFor(item) {
  const ranked = Object.entries(item.tags || {}).sort((a, b) => b[1] - a[1]);
  const t1 = ranked[0] ? ranked[0][0] : null;
  const t2 = ranked[1] ? ranked[1][0] : t1;
  const bg = TAG_BASE[t1] || "#1c1c22";
  const ac = TAG_ACCENT[t2] || "#3a3a44";
  const initials = esc(
    (item.brand || "?")
      .split(/\s+/)
      .map((w) => (/[a-z0-9]/i.test(w[0] || "") ? w[0] : ""))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
  const label = esc((t1 || "").toLowerCase());
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${bg}"/>` +
    `<stop offset="1" stop-color="${ac}" stop-opacity="0.5"/>` +
    `</linearGradient></defs>` +
    `<rect width="360" height="480" fill="url(#g)"/>` +
    `<circle cx="305" cy="66" r="95" fill="${ac}" opacity="0.16"/>` +
    `<text x="28" y="424" font-family="Georgia,serif" font-size="92" fill="${ac}" opacity="0.92">${initials}</text>` +
    `<text x="30" y="452" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="3" fill="#ffffff" opacity="0.45">${label}</text>` +
    `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// ---- Asterisk guidance mirror ----------------------------------------------
// The durable, cross-device preference lives in Asterisk memory. This small
// local mirror lets every open surface react immediately while the server
// remains authoritative for search, feed, Discover, and Stylist behavior.
export function brainEnabled() {
  try { return window.localStorage.getItem("asilum-brain-off") !== "1"; } catch { return true; }
}
export function setBrainEnabled(on) {
  try {
    if (on) window.localStorage.removeItem("asilum-brain-off");
    else window.localStorage.setItem("asilum-brain-off", "1");
    window.dispatchEvent(new Event("asilum:brain"));
  } catch {}
  return on;
}

// ---- Stale-response guards ---------------------------------------------------
// Surfaces that re-query on toggle, filter, or search changes must never let a
// slower older response overwrite a newer one — most importantly, a pending
// Asterisk-ON response must not land after guidance was paused. A surface owns
// one ref; claimRequest marks a new request generation (invalidating every
// slower in-flight response), watchRequest observes the current generation
// without invalidating it (pagination appends). Both return an isCurrent()
// the caller must check before applying a response.
export function claimRequest(ref) {
  const generation = (ref.current = (Number(ref.current) || 0) + 1);
  return () => ref.current === generation;
}

export function watchRequest(ref) {
  const generation = Number(ref.current) || 0;
  return () => (Number(ref.current) || 0) === generation;
}

export function clearLocalPersonalizationData() {
  if (typeof window === "undefined") return;
  const keys = [
    "asilum-posts", "asilum-follow-users", "asilum-follow-brands", "asilum-profile",
    "asilum-observe", "asilum-bag", "asilum-fit-profile", "asilum-brain-off",
    "asilum-onboarded", "asilum-ai-stylist-consent",
  ];
  try { for (const key of keys) window.localStorage.removeItem(key); } catch {}
  window.dispatchEvent(new Event("asilum:follow"));
  window.dispatchEvent(new Event("asilum:fit"));
  window.dispatchEvent(new Event("asilum:bag"));
  window.dispatchEvent(new Event("asilum:brain"));
}

// The sign-out notice, in ONE place because it was in two and they drifted.
//
// WHAT WAS WRONG (Aug 8). PR #148 corrected this string in app/shell.js after
// measuring that adoption MOVES taste — it deletes the device's profile row
// and reassigns its boards, interactions and follows to the account, leaving
// the device at {} / [] / []. The old wording, "device taste remains", told
// the user their taste was still there while the feed they got back was a
// cold start.
//
// app/profile/page.js had its own SIGN OUT handler publishing the SAME string,
// and #148 missed it: fixing one emitter and not grepping for the other. Both
// fire on sign-out (profile calls supabase signOut, which triggers shell's
// SIGNED_OUT listener), so the corrected message and the false one raced and
// whichever landed last won.
//
// A shared constant is the fix that cannot drift. Import it; do not retype it.
export const SIGN_OUT_NOTICE =
  "signed out — your taste stays with your account; this device starts fresh";
