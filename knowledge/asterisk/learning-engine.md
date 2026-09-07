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
bag 0.7 > share 0.6 > save > favorite > dwell; fast skip (< 1.2 s) is a
stronger negative than a slow skip. Client batches dwell time. The event
layer (user_events) mirrors this with EVENT_WEIGHT: bag 2 / share 1.5 /
board 1.3 / save 1.2 / fav 1 / view 0.2 / skip −0.5 / reject −1.

## The feed contract (chunks, 6 Sep 2026)
A serve is a CHUNK (`limit` 12–60, default 60; the client asks for 24 as it
scrolls) cut to the shares in lib/brain/chunk.js. Rotation (seen items
down-ranked) and max 2 items per brand per chunk still hold across every zone.

| zone | share | what |
| --- | --- | --- |
| catalog | **25%, fixed** | the listing in listing order (created_at desc, id), continued by an opaque `cursor`; taste-free; a brand-capped listing is deferred to the next chunk (cursor resumes AT it, carrying the ids taken after it as `skip`), never dropped; served ids are skipped, never repeated |
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

Rotation between chunks has two modes, reported as `chunk.rotation`:
`memory` when the server persists served ids (OBSERVE consent — the seen
penalty rotates the taste lanes, as always) and `cursor` when it persists
nothing (GENERAL, anonymous — D4). Under `cursor` the SAME opaque cursor also
carries how far each taste lane (core / discovery / reach) was consumed, plus
a bounded list of candidates passed for the brand cap alone (retried first
next chunk); everything earlier chunks walked past in any lane is excluded
from every lane, so a scroll never repeats an item until the pool is dry —
then, and only then, the page is filled with repeats. `?rechunk=1` (the
client's re-chunk after actions) restarts the taste lanes at the top of the
NEW ranking while the listing lane keeps its place. The server remembers
nothing in either case that it did not before.

Learning between chunks: every /api/interaction lands on the profile before
the next /api/feed is built, so each chunk is generated from the reader's
actions so far. The client (app/page.js, lib/feed/rechunk.js) regenerates
the cards the reader has NOT reached after 3 deliberate actions
(favourite/bag/share/skip/hide): cards entirely below the fold that were never
examined — geometry, because the grid flows column-major and list position
says nothing about reach — when at least 8 of them exist; otherwise the next
scroll fetches a fresh chunk. `BRAIN_CATALOG_LANE=0` restores the legacy
layout (discovery every 5th slot, 2 spread reaches, 5 when bored, no lane).

## Cross-user layer
similarUsers: compute-on-read cosine over profiles (scan cap 500).
crossUserCandidates: neighbors' weighted events × similarity, seen-items
excluded. Live but deliberately not yet wired into /api/feed.
