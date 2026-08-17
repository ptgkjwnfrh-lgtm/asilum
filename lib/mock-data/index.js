// lib/mock-data/index.js
// Single index of EVERY mock in the app, so demo data can never masquerade
// as real (constitution). This module points at existing mocks rather than
// duplicating them — remove an entry here when its real replacement ships.

export const MOCKS = [
  { what: "catalog", where: "lib/ingest/catalog.json", note: "915 synthetic marketplace-style items, labeled 'ASILUM Vault' only" },
  { what: "community users", where: "lib/social.js MOCK_USERS", note: "placeholder people; power who-to-follow + /u pages" },
  { what: "seed posts", where: "lib/social.js SEED_POSTS", note: "community scaffolding until real posts backend" },
  { what: "post quote tiles", where: "app/page.js QUOTES/HANDLES", note: "deterministic per feed position" },
  { what: "reading room", where: "lib/social.js READING_ROOM", note: "publications ASILUM reads + ASILUM's own line on their beat; links go to front pages. NEVER a claimed article title" },
  { what: "placeholder thumbs", where: "lib/client.js thumbFor", note: "deterministic SVG gradients until real imagery" },
  { what: "music seed tables", where: "lib/music-mapping GENRE_TAGS/ARTIST_TAGS", note: "curated seeds; every return is mockMarked" },
  { what: "ranking weights", where: "lib/feed RANKING_FACTORS", note: "hand-set starting points, not learned values" },
];
