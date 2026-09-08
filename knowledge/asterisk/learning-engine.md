# ASTERISK — the learning engine

ASTERISK is **deterministic taste arithmetic**, not a generative model. The
public honesty statement on /settings is a product commitment: no LLM
produces content in this app; if that ever changes, the surface will say so.

## The six bridges (lib/brain/)
| bridge | signal | mechanism |
|---|---|---|
| alpha | content match | tag-vector similarity between item and profile |
| beta | dominant trait | the profile's strongest standing aesthetic |
| gamma | co-engagement | Pinterest-style item-item graph (`edges` table) |
| delta | popularity | engagement/impression counters |
| epsilon | exploration | novelty injection; auto-fires on skip fatigue |
| ad | sponsored slot | reserved; inert |

## Signals, strongest first
bag 0.7 > share 0.6 > save > favorite 0.4 > open 0.1 (the reader opened the
record — once per piece per page) > dwell; fast skip (< 1.2 s) is a stronger
negative than a slow skip. Every card carries Favorite / Pass / Add to bag,
so the brief's like / pass / buy loop closes without opening the record. Client batches dwell time. The event
layer (user_events) mirrors this with EVENT_WEIGHT: bag 2 / share 1.5 /
board 1.3 / save 1.2 / fav 1 / view 0.2 / skip −0.5 / reject −1.

## The feed contract (chunks, 6 Sep 2026)
A serve is a CHUNK (`limit` 12–60, default 60; the client asks for 24 as it
scrolls) cut to the shares in lib/brain/chunk.js. Rotation (seen items down-ranked — GRADED by ring recency, 0.3 for the
newest-served, 0.4 for the oldest, so a ring that holds the whole pool still
cycles) and max 2 items per brand per chunk still hold across every zone.

| zone | share | what |
| --- | --- | --- |
| catalog | **25%, fixed** | the listing in listing order (created_at desc, id), continued by an opaque `cursor`; taste-free; a brand-capped listing ENDS the lane for the chunk and is the resume key (`chunk.catalog.deferred`), never dropped, never repeated; served ids are skipped |
| core | 45% | the six-bridge ranking on the taste as it stands at request time |
| discovery | 20% | one hop out via expandTaste, prefers bridge pieces (10% in safe mode) |
| reach | 10% | far (alpha sim < 0.15), 15% when bored (skip fatigue), 0 in safe mode |

Cold readers (no taste) get the lane plus core; discovery and reach need a
taste to be adjacent to or far from. Every zone is spread through the chunk
(floor(k·n/(q+1)), bumped past taken slots) so no zone is a block. The
discovery + reach + catalog shares are the ANTI-MONOCULTURE CLAUSE: at least
55% of a chunk with taste was not chosen by "more of what you just did"
(tests/catalog-chunks.test.js C13 pins a hyper-concentrated taste at ≤75%
one dominant tag). The lane's cursor comes back as `chunk.catalog.nextCursor`
and ends with `exhausted: true` rather than wrapping. Hard filters
(category/maxPrice/fit) narrow the listing the cursor pages through.

Rotation between chunks: the opaque cursor carries a SERVED FILTER — a
Bloom filter of every id earlier chunks served (1 KB; false positives
~0.01% at 300 ids, ~1.3% at 900; a false positive costs one item a turn,
nothing is ever lost) — and every lane skips what it holds, in every
consent state. `chunk.rotation` says whether the server ALSO remembers
(`memory`, OBSERVE: the seen penalty) or only the cursor does (`cursor`,
GENERAL and anonymous — D4). Ids, not positions: a taste that moves between
chunks, a brand cap, a bigger pool or a consent switch cannot turn the memory
into skipped-forever items or repeats (the first design, per-lane offsets into
the ranking, failed on all four). Only a dry pool fills a page with repeats,
and that fill ROTATES (cursor field `f`) — a dry pool cycles through the whole
ranking, and an item the filter wrongly calls served is reached there, late
but never lost. The lane skips what THIS session served, never the profile's
historical seen ring: a reader once served the whole pool still gets the 25%
lane on every later visit. The seen ring is capped at the whole discoverable
pool, not the request's filtered slice.
A re-chunk after actions is an ordinary chunk request: ranked on the taste as
it now stands, minus what the reader has seen.

Learning between chunks: every /api/interaction lands on the profile before
the next /api/feed is built, so each chunk is generated from the reader's
actions so far. The client (app/page.js, lib/feed/rechunk.js) regenerates
the cards the reader has NOT reached after 3 deliberate actions
(favourite/bag/share/skip/hide): cards entirely below the fold that were never
examined — geometry, because the grid flows column-major and list position
says nothing about reach — when at least 8 of them exist; otherwise the next
scroll fetches a fresh chunk. The replacement is IN PLACE (applyRechunk):
each planned card is swapped for a fresh one at the same position, so the
balanced multi-column breaks — and the cards on screen — do not move, and a
card inserted or removed while the chunk was in flight keeps its place. A
re-chunk waits for a reload in flight, runs under the CURRENT filters, counts
only actions the server accepted (bag counts once, after its POST), and never
grows the list past the rendered ceiling. `BRAIN_CATALOG_LANE=0` restores the
legacy layout (discovery every 5th slot, 2 spread reaches, 5 when bored, no
lane) — layout only; equal scores break on an id hash in both modes.

A page is several serves: the first load and every chunk after it. The
profile keeps a ring of recent serves (`_meta.serves`, `lastServe` = the
newest) bounded by cards (the 300 rendered ceiling), entries (16) and bytes
(64 KB); the page's first load (a request with no cursor) is PINNED and
survives the card bound — on a full page the first re-chunk is the twelfth
serve and used to evict it. `serveContextFor` finds a card in the newest
serve that holds it; the examination beacon reports each serve once against
its own id, decided inside the profile lock; per-bridge examination counts
are per serve (a card served twice and seen twice is two impressions for the
tuning denominator) while global exposure counts one person once per item.
The client posts beacons with keepalive and flushes them on pagehide, since
every destination is a full-page link. Chunk requests are sized to what can
still render under the ceiling, so a served card is not struck from the
reader's listing walk unseen.

The catalog grid is explicit columns with a memory (placeInColumns): a card
keeps the column it was first placed in, a newcomer takes the shortest, and
cards keep list order within a column — a PASS shortens only its own column,
a replacement lands where the old card stood. The column count follows the
design console's `--ed-grid-cols` and `--ed-grid-colw` (at most N columns,
each at least W wide, from the grid's width; two at ≤760px).

## Cross-user layer
similarUsers: compute-on-read cosine over profiles (scan cap 500).
crossUserCandidates: neighbors' weighted events × similarity, seen-items
excluded. Live but deliberately not yet wired into /api/feed.
