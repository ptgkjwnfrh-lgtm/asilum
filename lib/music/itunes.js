// lib/music/itunes.js — THE SONG PREVIEWS: Apple's iTunes Search API
// (owner, 30 Oct 2026: "I need websites that have easy APIs so I can have
// songs on the site"). SERVER-ONLY.
//
// WHAT THIS IS. The iTunes Search API is Apple's public, keyless catalog
// lookup: a song's title, artist, album, year, sleeve art, a store link and
// a 30-SECOND PREVIEW file. It is not Apple Music (MusicKit) and it is not
// a connected account — no user token, no library, no full-length playback,
// no profiling (lib/connectors/index.js keeps those seams as they are). The
// Apple Music / iTunes affiliate terms ask that catalog content link back
// to the store, so every record carries `url` and the card prints it.
//
// HONEST OFF. Nothing here runs unless ITUNES_SEARCH_ENABLED=1 — the kill
// switch the constitution asks of every external source. Off, the model's
// SAMPLE songs stay exactly what they were: real titles labelled SAMPLE,
// no art, no link, no playback. On, a sample resolves to the real record
// when the catalog has it, and stays a sample when it does not.
//
// The API's published limit is about twenty calls a minute; resolved songs
// are cached in memory for six hours so the Feed costs one call per song
// per instance, not one per reader.

import { readBytes } from "../security/http.js";

const ITUNES_HOST = "https://itunes.apple.com";
const ITUNES_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SONG_CACHE_MAX = 500;

export const ITUNES_SOURCE = "iTunes Search API";

export function itunesEnabled() {
  return process.env.ITUNES_SEARCH_ENABLED === "1";
}

/** One iTunes track → the SONG card's record. Null without a preview: a
 *  song that cannot be heard is not offered as one that can. */
export function normalizeItunesTrack(raw) {
  if (!raw || typeof raw !== "object" || raw.wrapperType && raw.wrapperType !== "track") return null;
  const id = raw.trackId != null ? String(raw.trackId) : "";
  const previewUrl = typeof raw.previewUrl === "string" && /^https:\/\//.test(raw.previewUrl) ? raw.previewUrl : null;
  if (!id || !raw.trackName || !previewUrl) return null;
  const art100 = typeof raw.artworkUrl100 === "string" && /^https:\/\//.test(raw.artworkUrl100) ? raw.artworkUrl100 : null;
  const year = typeof raw.releaseDate === "string" && /^\d{4}/.test(raw.releaseDate) ? Number(raw.releaseDate.slice(0, 4)) : null;
  return {
    id: "itunes-" + id,
    sample: false,
    provider: "itunes",
    source: ITUNES_SOURCE,
    title: String(raw.trackName).slice(0, 160),
    artist: String(raw.artistName || "").slice(0, 160),
    album: String(raw.collectionName || "").slice(0, 160) || null,
    year,
    // the 100px sleeve the API names, asked for at 600px — the same CDN path
    art: art100 ? art100.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null,
    previewUrl,
    previewMs: 30_000,
    durationMs: Number.isFinite(Number(raw.trackTimeMillis)) ? Number(raw.trackTimeMillis) : null,
    url: typeof raw.trackViewUrl === "string" && /^https:\/\//.test(raw.trackViewUrl) ? raw.trackViewUrl : null,
    explicit: raw.trackExplicitness === "explicit",
  };
}

async function callSearch(term, limit) {
  const url = `${ITUNES_HOST}/search?media=music&entity=song&limit=${Math.max(1, Math.min(25, limit | 0 || 10))}&term=${encodeURIComponent(term)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(ITUNES_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`iTunes search ${res.status}`);
  // iTunes answers JSON under `text/javascript` (checked 30 Oct 2026), which
  // readJsonResponse rightly refuses from anyone else; here the body is read
  // size-capped and parsed as the JSON it is
  const data = JSON.parse(new TextDecoder().decode(await readBytes(res, MAX_RESPONSE_BYTES)));
  return (Array.isArray(data.results) ? data.results : []).map(normalizeItunesTrack).filter(Boolean);
}

/** Catalog search: songs with previews, in the API's own order. Throws
 *  when disabled — the route answers 503 before it gets here. */
export async function searchSongs(term, { limit = 10 } = {}) {
  if (!itunesEnabled()) throw new Error("ITUNES_SEARCH_ENABLED is not 1");
  const q = String(term || "").trim().slice(0, 200);
  if (!q) return [];
  return callSearch(q, limit);
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Of a search's results, the one that is this title by this artist: the
 *  artist must match (one way or the other, loosely), the title must start
 *  the same — else null, never "close enough". */
export function pickMatch(results, { title, artist }) {
  const t = norm(title), a = norm(artist);
  let best = null, bestScore = Infinity;
  for (const r of results || []) {
    const rt = norm(r.title), ra = norm(r.artist);
    const artistOk = !a || ra.includes(a) || a.includes(ra);
    const titleOk = rt === t || rt.startsWith(t) || t.startsWith(rt);
    if (!artistOk || !titleOk) continue;
    // the record itself before a live take, a remaster or a medley that
    // starts the same (the Feed read "Boys in the Better Land (Live)" first)
    // only the words the store ADDED count against it — "Live Forever" has "live" in its own name
    const extra = rt.startsWith(t) ? rt.slice(t.length) : "";
    const score = (rt === t ? 0 : Math.abs(rt.length - t.length)) + (/\b(live|remaster(ed)?|demo|acoustic|version|edit|mix)\b/.test(extra) ? 100 : 0);
    if (score < bestScore) { best = r; bestScore = score; }
  }
  return best;
}

const cache = new Map(); // key → { at, song|null }

function remember(key, song) {
  if (cache.size >= SONG_CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), song });
  return song;
}

/** The real record for a title and an artist, or null when the catalog has
 *  no preview for it. Cached; a miss is cached too, so a song the store
 *  lacks is not asked for on every read. A network failure is NOT cached
 *  and resolves null for this read alone. */
export async function resolveSong({ title, artist }) {
  if (!itunesEnabled()) return null;
  const key = norm(title) + "|" + norm(artist);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.song;
  try {
    const results = await callSearch(`${title} ${artist}`.trim(), 10);
    return remember(key, pickMatch(results, { title, artist }));
  } catch {
    return null;
  }
}

/** The model's songs with the catalog's records in place of the samples it
 *  holds — each row either the live record or the sample it was. */
export async function resolveSongs(samples) {
  const rows = Array.isArray(samples) ? samples : [];
  if (!itunesEnabled()) return rows.map((s) => ({ ...s }));
  return Promise.all(rows.map(async (s) => {
    const live = await resolveSong({ title: s.title, artist: s.artist });
    return live ? { ...live, modelId: s.id } : { ...s };
  }));
}

/** For tests and the admin status board. */
export function _resetItunesCache() { cache.clear(); }
