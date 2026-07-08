// ASiLUM brain — LEXICON: maps non-clothing signals to aesthetic tag vectors.
// This is what lets the moodboard 'think' — turning a color, a music genre, a
// place, a mood word, or a texture into a fashion aesthetic reading.

// Each entry is a partial tag vector (weights 0..1). Absent tags = 0.
export const LEXICON = {
  // --- colors ---
  black:      { 'AVANT-GARDE': 0.5, MINIMAL: 0.4, SEDUCTIVE: 0.3 },
  olive:      { UTILITARIAN: 0.7, GORP: 0.5, STREETWEAR: 0.3 },
  beige:      { MINIMAL: 0.6, TAILORED: 0.4 },
  crimson:    { SEDUCTIVE: 0.6, STATEMENT: 0.5 },
  neon:       { STATEMENT: 0.7, STREETWEAR: 0.5 },
  earth:      { GORP: 0.6, UTILITARIAN: 0.5, ARCHIVAL: 0.3 },
  // --- moods ---
  techwear:   { UTILITARIAN: 0.8, STREETWEAR: 0.5, 'AVANT-GARDE': 0.4 },
  'mob wife': { SEDUCTIVE: 0.8, STATEMENT: 0.7, TAILORED: 0.3 },
  deconstructed: { 'AVANT-GARDE': 0.8, ARCHIVAL: 0.5, INDEPENDENT: 0.4 },
  opium:      { 'AVANT-GARDE': 0.6, STATEMENT: 0.6, STREETWEAR: 0.5 },
  quiet:      { MINIMAL: 0.8, TAILORED: 0.6 },
  grunge:     { INDEPENDENT: 0.6, STREETWEAR: 0.5, ARCHIVAL: 0.4 },
  // --- music ---
  ambient:    { MINIMAL: 0.6, 'AVANT-GARDE': 0.3 },
  drill:      { STREETWEAR: 0.7, STATEMENT: 0.5 },
  jazz:       { TAILORED: 0.6, ARCHIVAL: 0.4, SEDUCTIVE: 0.3 },
  hyperpop:   { STATEMENT: 0.7, 'AVANT-GARDE': 0.5, STREETWEAR: 0.4 },
  // --- places ---
  berlin:     { UTILITARIAN: 0.6, 'AVANT-GARDE': 0.5, MINIMAL: 0.4 },
  tokyo:      { 'AVANT-GARDE': 0.5, STREETWEAR: 0.5, INDEPENDENT: 0.4 },
  milan:      { TAILORED: 0.7, SEDUCTIVE: 0.5 },
  alps:       { GORP: 0.8, UTILITARIAN: 0.5 },
  // --- textures / materials ---
  leather:    { SEDUCTIVE: 0.5, STATEMENT: 0.4 },
  nylon:      { UTILITARIAN: 0.7, GORP: 0.5 },
  wool:       { TAILORED: 0.6, MINIMAL: 0.4 },
  distressed: { INDEPENDENT: 0.6, ARCHIVAL: 0.5 },
  // --- garment / gear language (helps ingest tagging: eBay titles etc.) ---
  goretex:    { GORP: 0.8, UTILITARIAN: 0.6 },
  'gore-tex': { GORP: 0.8, UTILITARIAN: 0.6 },
  gorp:       { GORP: 0.9, UTILITARIAN: 0.5 },
  shell:      { GORP: 0.6, UTILITARIAN: 0.5 },
  cargo:      { UTILITARIAN: 0.7, STREETWEAR: 0.4 },
  selvedge:   { ARCHIVAL: 0.5, INDEPENDENT: 0.4, UTILITARIAN: 0.3 },
  vintage:    { ARCHIVAL: 0.7, INDEPENDENT: 0.3 },
  archive:    { ARCHIVAL: 0.9, 'AVANT-GARDE': 0.4 },
  runway:     { STATEMENT: 0.6, 'AVANT-GARDE': 0.5, ARCHIVAL: 0.4 },
  tactical:   { UTILITARIAN: 0.8, GORP: 0.5 },
  oversized:  { STREETWEAR: 0.5, 'AVANT-GARDE': 0.4 },
  boxy:       { MINIMAL: 0.4, 'AVANT-GARDE': 0.4 },
  asymmetric: { 'AVANT-GARDE': 0.7, INDEPENDENT: 0.4 },
  hoodie:     { STREETWEAR: 0.6 },
  trail:      { GORP: 0.7, UTILITARIAN: 0.4 },
  hiking:     { GORP: 0.8, UTILITARIAN: 0.4 },
  workwear:   { UTILITARIAN: 0.8, ARCHIVAL: 0.3 },
  varsity:    { STREETWEAR: 0.6, ARCHIVAL: 0.3 },
  mesh:       { STREETWEAR: 0.4, UTILITARIAN: 0.4 },
  silk:       { SEDUCTIVE: 0.6, TAILORED: 0.4 },
  pinstripe:  { TAILORED: 0.8 },
  corset:     { SEDUCTIVE: 0.8, STATEMENT: 0.4 },
  puffer:     { GORP: 0.6, STREETWEAR: 0.5 },
  fleece:     { GORP: 0.7, STREETWEAR: 0.3 },
  denim:      { STREETWEAR: 0.4, ARCHIVAL: 0.4, UTILITARIAN: 0.3 },
};

// Resolve a single free-text token to its partial tag vector, or null.
export function lexiconVector(token) {
  const entry = LEXICON[String(token || '').trim().toLowerCase()];
  return entry ? { ...entry } : null;
}
