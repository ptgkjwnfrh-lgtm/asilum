# Database

Supabase Postgres (project ref jixztwahytvwxfzwimhi, ca-central-1) with a
full in-memory fallback when DATABASE_URL is absent — every feature must
work in both modes (stability law).

- Connection: SESSION POOLER URI only (direct connection is IPv6-only and
  fails on the dev network). pg import needs the `pgMod.default ?? pgMod`
  interop; NUMERIC comes back as string — normalize price to Number.
- Schema v2 (applied): 24 public tables. items = products extended
  (source/availability/moderation), product_images, product_tags (typed),
  search_mappings, search_logs, source_connections + sync logs,
  stylist_outfits, purchase_tickets, editorial_posts, mood_board_uploads,
  user_events, profiles, boards, edges (gamma graph), interactions.
- RLS on; server routes bypass as owner via DATABASE_URL. Client never
  holds service keys.
- Events persist BEFORE derived mutations (retry-safe); recordEvent throws
  on bad identity/type and >8KiB payloads — failures are loud by design.
- After ANY credential change verify /api/stats reports persistent:true —
  do not trust the host's "Ready".
