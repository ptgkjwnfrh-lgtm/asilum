// lib/asterisk/culture/provenance.js — WHERE A READING CAME FROM.
//
// Every interpretation in the catalog carries one of these, and the value is
// not decoration: it is the record of HOW the claim was arrived at, which is
// what lets a reader (and a reviewer) weigh it. A reading with no provenance
// is a reading nobody can audit.
//
// Shared by every catalog part so the strings cannot drift into near-copies.

// Brain tag space (lowercase; resolveTag canonicalizes): avant-garde,
// seductive, statement, tailored, archival, minimal, utilitarian, streetwear,
// independent, gorp.

export const P = "curated-editorial-v1";
// Records informed by a July 2026 web research pass (fashion press, aesthetic
// wikis, trend reports). Style claims stay editorial; trend phases carry a
// lastReviewed date so staleness is auditable, never hidden.
export const P2 = "curated-web-informed-2026-07";
// Records informed by an August 2026 study of fan-portrait photography (the
// owner-supplied concert-crowd portrait series): each reading describes what
// the FANS wear — the tribe's uniform, not the artist's stage costume.
// Derived by editorial observation of the supplied images, human-reviewed
// through PR like every curated record; no vision model was involved.
export const P3 = "curated-image-informed-2026-08";

/**
 * @typedef {object} CultureRecord
 * @property {string} kind   film | tv | music | figure | city | decade | aesthetic | concept | art
 * @property {string} name   the lowercased key this record is looked up by
 * @property {string[]} [aliases]  other lowercased spellings that resolve here
 * @property {string} [note]
 * @property {object[]} interpretations  the readings — kept SEPARATE, never blended
 */
