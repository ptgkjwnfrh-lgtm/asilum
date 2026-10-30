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

/** An artist to their style influence, from a CURATED seed table.
 *  Returns notImplemented for anything not in the table — never a guess, and
 *  hits are mock-marked so a caller can tell a seeded reading from a sourced
 *  one. */
export function mapArtist(name) {
  const hit = ARTIST_TAGS[String(name || "").toLowerCase()];
  return hit ? mockMarked(hit, "curated artist→influence seed table")
             : notImplemented("mapArtist:" + name, "extend ARTIST_TAGS or wire a music-knowledge source");
}

/** The curated artists a passenger may stamp by hand (V.2 §11, Spotify
 *  manual-only). ASILUM's own table — no provider is consulted. */
export function listArtists() {
  return Object.keys(ARTIST_TAGS).sort().map((name) => ({ id: "artist:" + name.replace(/\s+/g, "-"), name, descriptors: ARTIST_TAGS[name].descriptors || [], tags: ARTIST_TAGS[name].tags || {} }));
}
