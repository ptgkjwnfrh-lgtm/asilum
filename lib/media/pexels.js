// lib/media/pexels.js — LICENSED MOTIONS: the Pexels Video API (owner, 30
// Oct 2026: short vertical video on the site for the demo). SERVER-ONLY.
//
// WHAT THIS IS. Pexels is a library of free-to-use video under the Pexels
// License; its API searches it by keyword and orientation and hands back
// the files, a poster frame, and the videographer to credit. Each result
// becomes a MOTION post in the model's own shape (lib/model/media.js
// SAMPLE_POSTS: `sample: true` — not a passenger's post, not a listing —
// plus `licensed`: who made it, where it lives, under what license), so the
// VIDEOS YOU MAY LIKE row, the stream and the media popup draw it as they
// draw the generated test pattern, with the credit where the test pattern's
// label was. TikTok and Instagram expose no video of other people's to any
// API (lib/connectors/index.js tiktok: Display API = your own, after
// approval), which is why the demo's motion is licensed stock and says so.
//
// HONEST OFF. Nothing runs without PEXELS_API_KEY; the motion route answers
// no posts and the reason, and the generated test pattern stays. Pexels
// asks that API content show a link to Pexels and credit the videographer:
// the caption and the popup's credit line do both. Results are cached an
// hour; the API allows 200 calls an hour and 20 000 a month.

import { readJsonResponse } from "../security/http.js";

const PEXELS_HOST = "https://api.pexels.com";
const PEXELS_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;

export const PEXELS_SOURCE = "Pexels Video API";
export const PEXELS_LICENSE = "Pexels License";

export function pexelsEnabled() {
  return !!process.env.PEXELS_API_KEY;
}

// The lanes a demo row is filled from: a query, the taste tags its results
// carry into the Feed's packer. PEXELS_QUERIES (comma-separated) overrides
// the queries; the tags then fall to the first lane's.
export const PEXELS_LANES = Object.freeze([
  { query: "street fashion", tags: ["STREETWEAR", "STATEMENT"] },
  { query: "fashion model walking", tags: ["TAILORED", "SEDUCTIVE"] },
  { query: "vintage clothing store", tags: ["ARCHIVAL", "INDEPENDENT"] },
  { query: "sneakers", tags: ["STREETWEAR", "UTILITARIAN"] },
  { query: "interior design furniture", tags: ["MINIMAL", "ARCHIVAL"] },
]);

export function pexelsLanes() {
  const env = String(process.env.PEXELS_QUERIES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!env.length) return PEXELS_LANES;
  return env.slice(0, 8).map((query, i) => ({ query, tags: (PEXELS_LANES[i] || PEXELS_LANES[0]).tags }));
}

/** The file to play: an MP4, portrait, no wider than 1080 — the largest of
 *  those, else the largest MP4 of any shape. Null without an MP4. */
export function pickFile(files) {
  const mp4 = (Array.isArray(files) ? files : []).filter((f) => f && f.file_type === "video/mp4" && typeof f.link === "string" && /^https:\/\//.test(f.link) && Number(f.width) > 0 && Number(f.height) > 0);
  const portrait = mp4.filter((f) => Number(f.height) >= Number(f.width) && Number(f.width) <= 1080);
  const pool = portrait.length ? portrait : mp4;
  return pool.sort((a, b) => Number(b.width) * Number(b.height) - Number(a.width) * Number(a.height))[0] || null;
}

/** One Pexels video → one licensed MOTION post, or null without a playable
 *  file, a videographer or a page to credit. */
export function normalizePexelsVideo(raw, { tags = [] } = {}) {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  const file = pickFile(raw.video_files);
  const by = raw.user && typeof raw.user.name === "string" ? raw.user.name.slice(0, 80) : "";
  const page = typeof raw.url === "string" && /^https:\/\/www\.pexels\.com\//.test(raw.url) ? raw.url : null;
  if (!file || !by || !page) return null;
  const id = "pexels-" + String(raw.id).replace(/\D/g, "").slice(0, 16);
  const durationMs = Math.round((Number(raw.duration) || 0) * 1000) || null;
  return {
    id, sample: true,
    licensed: { source: "Pexels", license: PEXELS_LICENSE, by, byUrl: raw.user && typeof raw.user.url === "string" && /^https:\/\//.test(raw.user.url) ? raw.user.url : null, url: page },
    intent: "curate", category: "style",
    handle: "pexels", name: by, avatar: null,
    title: "",
    text: `video by ${by} · Pexels license`,
    tags: Array.isArray(tags) ? tags.slice(0, 3) : [],
    video: {
      id, url: file.link, poster: typeof raw.image === "string" && /^https:\/\//.test(raw.image) ? raw.image : null,
      durationMs, width: Number(file.width), height: Number(file.height), rotation: 0,
      codec: "avc1", container: "mp4", audio: false, captions: [],
      // the CDN serves the file plainly; the housing must not ask for CORS it would refuse
      cors: false,
    },
  };
}

let cached = null; // { at, posts, reason }

/** The demo's licensed motions: up to `perLane` per lane, every lane, in
 *  one cached batch. [] with the reason when off or when every lane fails. */
export async function licensedMotions({ perLane = 4 } = {}) {
  if (!pexelsEnabled()) return { enabled: false, posts: [], reason: "licensed motions are off — set PEXELS_API_KEY to read the Pexels Video API" };
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { enabled: true, posts: cached.posts, cached: true, reason: cached.reason };
  const posts = [];
  const seen = new Set();
  const errors = [];
  for (const lane of pexelsLanes()) {
    try {
      const u = new URL(PEXELS_HOST + "/videos/search");
      u.searchParams.set("query", lane.query);
      u.searchParams.set("orientation", "portrait");
      u.searchParams.set("size", "medium");
      u.searchParams.set("per_page", String(Math.max(1, Math.min(15, perLane | 0 || 4))));
      const res = await fetch(u, { headers: { Authorization: process.env.PEXELS_API_KEY, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS) });
      if (!res.ok) { errors.push(`${lane.query}: ${res.status}`); continue; }
      const data = await readJsonResponse(res, { maxBytes: MAX_RESPONSE_BYTES });
      for (const v of Array.isArray(data.videos) ? data.videos : []) {
        const p = normalizePexelsVideo(v, { tags: lane.tags });
        if (p && !seen.has(p.id)) { seen.add(p.id); posts.push(p); }
      }
    } catch (e) {
      errors.push(`${lane.query}: ${String(e && e.message || e).slice(0, 80)}`);
    }
  }
  const reason = errors.length ? "some lanes failed — " + errors.join("; ") : null;
  if (posts.length) cached = { at: Date.now(), posts, reason };
  return { enabled: true, posts, reason: posts.length ? reason : (reason || "Pexels returned no portrait MP4 for the lanes") };
}

export function _resetPexelsCache() { cached = null; }
