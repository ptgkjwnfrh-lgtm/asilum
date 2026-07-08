// lib/music-mapping/index.js
// Music-to-Fashion Brain: music taste as an aesthetic signal.
// The mapping table below is CURATED MOCK DATA (marked as such in every
// return) — a seed vocabulary proving the pipeline shape. Real coverage
// comes later from a music-knowledge source + the Spotify connector
// (lib/connectors, opt-in OAuth only; no API is called today).
//
// Output speaks the Alpha Learning Bridge's language: {TAG: weight} maps in
// the shared tag space, so a music profile can train the live brain through
// the exact path moodboard text already uses (/api/train).

import { mockMarked, notImplemented } from "../ai/contract.js";

// Genre → aesthetic tag weights (shared vocabulary: lib/brain/tags.js).
const GENRE_TAGS = {
  "alt-rock":   { "AVANT-GARDE": 0.3, STREETWEAR: 0.3, ARCHIVAL: 0.2 },
  shoegaze:     { MINIMAL: 0.4, "AVANT-GARDE": 0.3, ARCHIVAL: 0.2 },
  "nu-metal":   { STREETWEAR: 0.5, UTILITARIAN: 0.3, STATEMENT: 0.2 },
  techno:       { UTILITARIAN: 0.4, MINIMAL: 0.4, "AVANT-GARDE": 0.2 },
  "r&b":        { SEDUCTIVE: 0.5, TAILORED: 0.3, MINIMAL: 0.2 },
  jazz:         { TAILORED: 0.5, ARCHIVAL: 0.3, INDEPENDENT: 0.2 },
  hyperpop:     { STATEMENT: 0.5, STREETWEAR: 0.3, "AVANT-GARDE": 0.2 },
  folk:         { INDEPENDENT: 0.4, GORP: 0.3, ARCHIVAL: 0.2 },
  ambient:      { MINIMAL: 0.5, GORP: 0.2, "AVANT-GARDE": 0.2 },
  punk:         { STATEMENT: 0.4, INDEPENDENT: 0.3, STREETWEAR: 0.3 },
};

// Artist → influence profile. The Deftones row is the canonical example from
// the product spec: moody, sensual, metallic, distressed, dark, soft
// aggression — expressed here in the shared tag space + free descriptors.
const ARTIST_TAGS = {
  deftones:      { tags: { SEDUCTIVE: 0.4, "AVANT-GARDE": 0.3, STREETWEAR: 0.2, STATEMENT: 0.2 },
                   descriptors: ["moody", "sensual", "metallic", "distressed", "alt-rock", "dark", "soft aggression"] },
  "the cure":    { tags: { "AVANT-GARDE": 0.4, ARCHIVAL: 0.3, STATEMENT: 0.2 },
                   descriptors: ["romantic", "gothic", "80s", "eyeliner"] },
  sade:          { tags: { TAILORED: 0.4, SEDUCTIVE: 0.4, MINIMAL: 0.2 },
                   descriptors: ["polished", "gold", "silk", "quiet luxury"] },
  "aphex twin":  { tags: { UTILITARIAN: 0.4, "AVANT-GARDE": 0.4, GORP: 0.2 },
                   descriptors: ["clinical", "technical", "unsettling"] },
};

export function mapGenre(genre) {
  const hit = GENRE_TAGS[String(genre || "").toLowerCase()];
  return hit ? mockMarked(hit, "curated genre→tag seed table")
             : notImplemented("mapGenre:" + genre, "extend GENRE_TAGS or wire a music-knowledge source");
}

export function mapArtist(name) {
  const hit = ARTIST_TAGS[String(name || "").toLowerCase()];
  return hit ? mockMarked(hit, "curated artist→influence seed table")
             : notImplemented("mapArtist:" + name, "extend ARTIST_TAGS or wire a music-knowledge source");
}

// Aggregate a listening snapshot into one trainable {TAG: weight} map.
// Album-cover visual influence joins later through lib/vision.
export function musicProfile({ artists = [], genres = [] } = {}) {
  const agg = {};
  let hits = 0;
  for (const g of genres) {
    const m = mapGenre(g);
    if (m.ok) { hits++; for (const [t, w] of Object.entries(m.data)) agg[t] = (agg[t] || 0) + w; }
  }
  for (const a of artists) {
    const m = mapArtist(a);
    if (m.ok) { hits++; for (const [t, w] of Object.entries(m.data.tags)) agg[t] = (agg[t] || 0) + w; }
  }
  for (const t of Object.keys(agg)) agg[t] = +(agg[t] / Math.max(1, hits)).toFixed(4);
  return mockMarked({ tags: agg, coverage: hits, of: artists.length + genres.length },
    "aggregated from curated seed tables — trainable via /api/train");
}
