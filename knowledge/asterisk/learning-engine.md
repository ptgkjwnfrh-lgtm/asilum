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

## The feed contract
Rotation (seen items down-ranked), max 2 items per brand per page, zoned:
core (known taste) / discovery every 5th slot (one hop out via expandTaste,
prefers bridge pieces) / 2 far-reach explorer slots (alpha sim < 0.15;
5 slots when bored). Boredom = skip-fatigue threshold.

## Cross-user layer
similarUsers: compute-on-read cosine over profiles (scan cap 500).
crossUserCandidates: neighbors' weighted events × similarity, seen-items
excluded. Live but deliberately not yet wired into /api/feed.
