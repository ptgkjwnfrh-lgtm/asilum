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
async function ensureDeviceCookie() {
  if (!deviceReady) {
    deviceReady = fetch("/api/auth", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) throw new Error("device identity unavailable");
      const data = await res.json();
      if (!data?.uid) throw new Error("invalid device identity");
      return data.uid;
    }).catch((error) => {
      deviceReady = null;
      throw error;
    });
  }
  return deviceReady;
}

export async function authorizedFetch(url, options = {}) {
  const [deviceUid, auth] = await Promise.all([ensureDeviceCookie(), authorizationHeaders()]);
  if (!auth.Authorization) setUid(deviceUid);
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
