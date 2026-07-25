# ASTERISK — memory

Two-timescale profiles: `{ long, session, _meta{recent, seen} }`. Older
flat profiles migrate on read (migrateProfile).

Clock forgetting: 6-day half-life decay (lib/memory.js) so lapsed interests
fade instead of haunting the feed; `_meta.activity` ring buffer feeds the
"recently forgotten" surface on PASSPORT. memory.js is client-safe and must
NEVER import brain/index.js (it would drag the catalog into the client
bundle).

Identity: server-issued HttpOnly device cookie (u-<uuid>); on sign-in the
anon profile is adopted under sb-<uid> once, via bearer-verified /api/auth.
