// lib/social.js
// Client-safe social + marketplace scaffolding: source labels, mock users and
// editorial stories, the community post store (local state until a posts
// backend exists), follow state, profile info, and the
// on-device observation toggle. Pure JS — safe to import from server routes
// (window access is always guarded).

import { hashStr, postJSON, sendJSON, authorizedFetch, getUid } from "./client.js";

// Dual-write follows to the server list (user_follows, v14) so the Asterisk
// memory surface sees them. localStorage stays the instant read model; a
// failed sync never blocks the UI.
function syncFollow(kind, target, on) {
  if (typeof window === "undefined") return;
  postJSON("/api/follow", { user: getUid(), kind, target, follow: on }).catch(() => {});
}

// ---- Marketplace sources -----------------------------------------------------
// Demo catalog items are labeled "ASILUM Vault" — they must never be dressed
// up as real partner inventory (see CONSTITUTION.md data rules). Real
// ingested items (eBay Browse, /api/ingest) keep their true source.

const DEMO_SOURCES = new Set(["Asilum synthetic seed", "seed", "", null, undefined]);

export function sourceFor(item) {
  if (!item || !item.id) return "ASILUM Vault";
  if (item.id.startsWith("ebay-") || item.source === "eBay Browse API") return "eBay";
  if (item.src && !DEMO_SOURCES.has(item.src)) return item.src;
  if (!DEMO_SOURCES.has(item.source)) return item.source;
  if (!DEMO_SOURCES.has(item.source_name)) {
    return item.source_name === "ebay" ? "eBay" : item.source_name;
  }
  return "ASILUM Vault";
}

// Load-test fixtures are opt-in and never ship as production social proof.
// NEXT_PUBLIC_ENABLE_DEMO_SOCIAL exists for local/staging load exercises only.
export const DEMO_SOCIAL_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEMO_SOCIAL === "1";

// ---- Mock users (local load-test data only) -----------------------------------

const MOCK_USER_FIXTURES = [
  { name: "Vex Archive", handle: "@vex.archive", tags: ["ARCHIVAL", "AVANT-GARDE"] },
  { name: "Grey Market", handle: "@grey.market", tags: ["MINIMAL", "TAILORED"] },
  { name: "Tabi Lord", handle: "@tabi.lord", tags: ["AVANT-GARDE", "INDEPENDENT"] },
  { name: "Hemline", handle: "@hem.line", tags: ["SEDUCTIVE", "STATEMENT"] },
  { name: "Spine Press", handle: "@spine.press", tags: ["ARCHIVAL", "MINIMAL"] },
  { name: "Ridgeline", handle: "@ridge.line", tags: ["GORP", "UTILITARIAN"] },
  { name: "Corner Store", handle: "@corner.store", tags: ["STREETWEAR", "INDEPENDENT"] },
  { name: "Atelier Zero", handle: "@atelier.zero", tags: ["TAILORED", "MINIMAL"] },
  { name: "Opium Den", handle: "@opium.den", tags: ["AVANT-GARDE", "STREETWEAR"] },
  { name: "Silk Route", handle: "@silk.route", tags: ["SEDUCTIVE", "TAILORED"] },
];
export const MOCK_USERS = DEMO_SOCIAL_ENABLED ? MOCK_USER_FIXTURES : [];

export function searchUsers(q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return [];
  return MOCK_USERS.filter(
    (u) => u.name.toLowerCase().includes(s) || u.handle.toLowerCase().includes(s) ||
           u.tags.some((t) => t.toLowerCase().includes(s))
  );
}

// ---- Editorial stories --------------------------------------------------------
// Placeholder editorial data: publication names + ORIGINAL one-line summaries
// written for this prototype, linking out to the publication (never copied
// text, never copied images — see the copyright rule in the spec).

export const STORIES = [
  { pub: "Vogue", title: "The Archive Is the New Atelier", url: "https://www.vogue.com",
    summary: "Why collectors are treating 90s runway pieces like blue-chip art — and what that does to price discovery." },
  { pub: "Dazed", title: "Gorpcore Refuses to Die", url: "https://www.dazeddigital.com",
    summary: "Five years past its supposed peak, technical outerwear keeps mutating instead of fading." },
  { pub: "i-D", title: "Quiet Luxury's Loud Aftermath", url: "https://i-d.co",
    summary: "The beige wave broke; what the tide left behind is stranger and more personal." },
  { pub: "Highsnobiety", title: "Resale Is Eating Retail", url: "https://www.highsnobiety.com",
    summary: "Secondhand platforms now set the price of new drops before they even release." },
  { pub: "AnOther", title: "Yamamoto's Long Shadow", url: "https://www.anothermag.com",
    summary: "A generation of independent designers keeps returning to the same black well." },
  { pub: "GQ", title: "The Tailoring Comeback Is Real This Time", url: "https://www.gq.com",
    summary: "Soft shoulders, wide legs, and why the suit survived its own funeral." },
  { pub: "CR Fashion Book", title: "Corsetry Without Apology", url: "https://crfashionbook.com",
    summary: "Structure returns to the body — on the wearer's terms this season." },
  { pub: "Hypebeast", title: "The Trail Shoe Wars", url: "https://hypebeast.com",
    summary: "Every house wants a lug sole now; only a few understand the mountain." },
  { pub: "Harper's Bazaar", title: "Dressing for the Archive Camera", url: "https://www.harpersbazaar.com",
    summary: "Fits are composed for documentation first, dinner second. That changes the clothes." },
];

// ---- Community posts (local state until a posts backend exists) ---------------

const POSTS_KEY = "asilum-posts";

const SEED_POSTS = [
  { id: "seed-1", name: "Vex Archive", handle: "@vex.archive", at: Date.now() - 1000 * 60 * 60 * 5,
    text: "wearing the whole 1999 silhouette today. the trousers argue with gravity and win." },
  { id: "seed-2", name: "Ridgeline", handle: "@ridge.line", at: Date.now() - 1000 * 60 * 60 * 9,
    text: "goretex over tailoring. the office didn't understand. the weather did." },
  { id: "seed-3", name: "Hemline", handle: "@hem.line", at: Date.now() - 1000 * 60 * 60 * 26,
    text: "found the corset from the runway photo. hands were shaking at checkout." },
  { id: "seed-4", name: "Corner Store", handle: "@corner.store", at: Date.now() - 1000 * 60 * 60 * 31,
    text: "varsity jacket, split hem, no logo. the quiet flex is the loudest one." },
];

export function listPosts() {
  let mine = [];
  if (typeof window !== "undefined") {
    try { mine = JSON.parse(window.localStorage.getItem(POSTS_KEY)) || []; } catch {}
  }
  return [...mine, ...(DEMO_SOCIAL_ENABLED ? SEED_POSTS : [])].sort((a, b) => b.at - a.at);
}

// The wire, read for real (Aug 12): everyone's visible posts from
// GET /api/editorial (server-moderated, bylines are server truth). For
// kind="user" the result also merges this device's own instant-render
// copies — a duplicate is a post with the SAME sanitizer-normalized text
// within ten minutes (tight enough that a stranger's identical text is
// not claimed as yours, loose enough that the server's sanitizer rewrite
// still matches); the server record wins but keeps the "you" chip, and a
// local post missing from the server (just posted, or held for review)
// still shows. Returns { posts, live } — live:false means the server
// could not be reached, so callers must NOT claim the wire is empty.
// client-side approximation of the server's sanitizeStatement
const normPostText = (t) => String(t || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
// A local copy matches a server record when the normalized text agrees
// within ten minutes (tight enough that a stranger's identical text is
// not claimed as yours, loose enough that the sanitizer rewrite matches).
export function matchesLocalPost(local, srv) {
  return normPostText(local.text) === normPostText(srv.text) &&
    Math.abs((local.at || 0) - (srv.at || 0)) < 10 * 60 * 1000;
}
export function mapServerPost(p) {
  return {
    id: "srv-" + p.id,
    serverId: p.id,
    name: p.authorHandle || "reader",
    handle: p.authorHandle || "reader",
    at: p.createdAt || 0,
    text: (p.body || p.title || "").trim(),
    title: p.title || "",
    excerpt: p.excerpt || "",
    externalUrl: p.externalUrl || "",
    editedAt: p.editedAt || null,
    mine: false,
  };
}

export async function fetchWire(kind = "user", limit = 60) {
  const mine = kind === "user" ? listPosts().filter((p) => p.mine) : [];
  try {
    const d = await fetch("/api/editorial?kind=" + encodeURIComponent(kind) + "&limit=" + limit)
      .then((r) => r.json());
    const server = (d.posts || []).map(mapServerPost).filter((p) => p.text);
    if (kind !== "user") return { posts: server, live: true };
    for (const s of server) if (mine.some((m) => matchesLocalPost(m, s))) s.mine = true;
    const posts = [
      ...server,
      ...mine.filter((m) => !server.some((s) => matchesLocalPost(m, s))),
    ].sort((a, b) => b.at - a.at);
    return { posts, live: true };
  } catch {
    return { posts: mine, live: false };
  }
}

// A poster's visible transmissions (owner order, Aug 13: the identity
// chain). Server truth only — another reader's posts never live on this
// device. Returns { posts, live } like fetchWire.
export async function fetchPostsByHandle(handle, limit = 60) {
  try {
    const d = await fetch("/api/editorial?kind=user&handle=" + encodeURIComponent(handle) + "&limit=" + limit)
      .then((r) => r.json());
    return { posts: (d.posts || []).map(mapServerPost).filter((p) => p.text), live: true };
  } catch {
    return { posts: [], live: false };
  }
}

// One transmission by server id — the permalink read. null = not on the
// wire (never published, held for review, or gone); callers say so
// honestly rather than guessing which.
export async function fetchPost(id) {
  try {
    const d = await fetch("/api/editorial?id=" + encodeURIComponent(id)).then((r) => r.json());
    const p = (d.posts || []).map(mapServerPost).filter((x) => x.text)[0];
    return p || null;
  } catch {
    return null;
  }
}

export function addPost(text, profileInfo, title) {
  // The wire's transmission law (owner order, Aug 13): 5000-char text,
  // and the caption acts as the transmission's header (≤200, mirroring
  // the server's cap).
  const post = {
    id: "p-" + Date.now().toString(36),
    name: (profileInfo && profileInfo.name) || "You",
    handle: (profileInfo && profileInfo.handle) || "@you",
    at: Date.now(),
    text: String(text || "").slice(0, 5000),
    title: String(title || "").slice(0, 200),
    mine: true,
  };
  try {
    const mine = JSON.parse(window.localStorage.getItem(POSTS_KEY)) || [];
    window.localStorage.setItem(POSTS_KEY, JSON.stringify([post, ...mine].slice(0, 100)));
  } catch {}
  return post;
}

// ---- Transmission lifecycle (owner directive, HANDOVER-2026-08-14) ----------
// Author-side edit + delete. The server's verdict is the truth; these also
// keep this device's instant-render copy in step, so a deleted transmission
// cannot haunt the wire as a "device copy" and an edited one cannot
// resurface wearing its old text.

// Rewrite (next = {text, title}) or drop (next = null) the device copies
// that match a server transmission — the same normalized-text +
// ten-minute rule the wire merge uses.
function syncLocalCopies(serverPost, next) {
  if (typeof window === "undefined") return;
  try {
    const mine = JSON.parse(window.localStorage.getItem(POSTS_KEY)) || [];
    const kept = [];
    for (const m of mine) {
      if (!m.mine || !matchesLocalPost(m, serverPost)) { kept.push(m); continue; }
      if (next) {
        kept.push({
          ...m,
          text: String(next.text || "").slice(0, 5000),
          title: String(next.title || "").slice(0, 200),
        });
      }
    }
    window.localStorage.setItem(POSTS_KEY, JSON.stringify(kept));
  } catch {}
}

export async function editPost(serverPost, text, title) {
  const res = await sendJSON("PATCH", "/api/editorial", {
    user: getUid(), id: serverPost.serverId, text, title: title || undefined,
  });
  const d = await res.json().catch(() => null);
  if (res.ok) syncLocalCopies(serverPost, { text, title: title || "" });
  return {
    ok: res.ok,
    held: !!(d && d.held),
    note: (d && d.note) || "",
    error: res.ok ? "" : ((d && d.error) || "edit failed"),
  };
}

export async function deletePost(serverPost) {
  const res = await authorizedFetch(
    "/api/editorial?id=" + encodeURIComponent(serverPost.serverId) +
    "&user=" + encodeURIComponent(getUid() || ""),
    { method: "DELETE" }
  );
  if (res.ok) syncLocalCopies(serverPost, null);
  const d = await res.json().catch(() => null);
  return { ok: res.ok, error: res.ok ? "" : ((d && d.error) || "delete failed") };
}

// Deterministic engagement counts so the community feels lived-in.
export function postStats(post) {
  if (!DEMO_SOCIAL_ENABLED) return { comments: 0, reposts: 0, likes: 0 };
  const h = hashStr(post.id + post.handle);
  return { comments: h % 14, reposts: (h >> 3) % 22, likes: 4 + ((h >> 6) % 90) };
}

export function timeAgo(t) {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return m + "m";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h";
  return Math.round(h / 24) + "d";
}

// ---- Follow state (users + brands; board follows live on the server profile) --

const FOLLOW_KEY = "asilum-follow-users";
const BRAND_KEY = "asilum-follow-brands";

export function followedUsers() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(FOLLOW_KEY)) || []; } catch { return []; }
}
export function setFollowUser(handle, on) {
  const cur = new Set(followedUsers());
  on ? cur.add(handle) : cur.delete(handle);
  try { window.localStorage.setItem(FOLLOW_KEY, JSON.stringify([...cur])); } catch {}
  syncFollow("user", handle, !!on);
  window.dispatchEvent(new Event("asilum:follow"));
  return [...cur];
}

export function followedBrands() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(BRAND_KEY)) || []; } catch { return []; }
}
export function setFollowBrand(brand, on) {
  const cur = new Set(followedBrands());
  on ? cur.add(brand) : cur.delete(brand);
  try { window.localStorage.setItem(BRAND_KEY, JSON.stringify([...cur])); } catch {}
  syncFollow("brand", brand, !!on);
  window.dispatchEvent(new Event("asilum:follow"));
  return [...cur];
}

// ---- Profile info --------------------------------------------------------------

const PROFILE_KEY = "asilum-profile";

export function getProfileInfo() {
  const base = { name: "Unnamed Reader", handle: "@reader", bio: "taste under construction." };
  if (typeof window === "undefined") return base;
  try { return { ...base, ...(JSON.parse(window.localStorage.getItem(PROFILE_KEY)) || {}) }; } catch { return base; }
}
export function saveProfileInfo(info) {
  try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(info)); } catch {}
}

// ---- On-device observation toggle ----------------------------------------------

const OBSERVE_KEY = "asilum-observe";

export function observationOn() {
  if (typeof window === "undefined") return true;
  try { return window.localStorage.getItem(OBSERVE_KEY) !== "0"; } catch { return true; }
}
export function setObservation(on) {
  try { window.localStorage.setItem(OBSERVE_KEY, on ? "1" : "0"); } catch {}
}
