# V.2 slice 15 — the demo sources (30 October 2026)

The owner's word (30 Oct 2026): V.2 is going to yield a two-minute product
demo, and "ASILUM does more than just clothes" — furniture, jewelry, rugs,
shoes, watches, figurines, table ornaments; songs on the site; short video
for the demo; a ticket company. "This doesn't have to all the way work
properly, I just need it to kind of work." The no-faking law is untouched by
that: every source here is a real public API behind its own env switch, and
each surface says what it is while the switch is off.

## What landed

| Need | Where | Status |
| --- | --- | --- |
| Products beyond clothes, from the key the owner already holds | `lib/ingest/ebay.js` `EBAY_CATEGORIES` (eBay's top-level lanes: fashion, jewelry, home, collectibles, antiques, art), `EBAY_DEMO_LANES` (thirteen queries, each in its lane, with a catalog-category hint for bare titles), `browseSearchUrl`, `guessCategory` learns furniture · rugs · watches · jewelry · objects; `normalize.js` keeps a source's own catalog category; `/api/ebay?cat=`, `/api/admin sync.run { category, hint, only }`; `scripts/sync-demo-sources.mjs` (dry by default, `--write` folds the sweep into the catalog) | shipped. **Dry-run against the production Browse API, 30 Oct 2026: 130 distinct listings, 129 with images — 27 furniture, 23 objects, 20 footwear, 20 rugs, 14 outerwear, 11 watches, 9 jewelry.** The default lane is still fashion, so nothing that searched before searches differently |
| Songs | `lib/music/itunes.js` (Apple's iTunes Search API — no key — a 30-second preview, the sleeve at 600 px, the store link the terms ask for), `/api/music?model=1` (the model's ten songs resolved to real records) and `?q=`, `SongCard.jsx` (the art is the play key; APPLE MUSIC ↗), the player's second source kind `song` (`lib/music/player.js`, `panelFor`), the circle's panel link | shipped behind `ITUNES_SEARCH_ENABLED=1`. **Verified in the browser: all ten model songs resolve, the preview plays, the Music Circle holds it.** Off, the SAMPLE cards are exactly what they were |
| Short vertical video | `lib/media/pexels.js` (the Pexels Video API: portrait MP4 ≤ 1080 wide, poster, the videographer), `/api/motion`, the posts ride the stream and VIDEOS YOU MAY LIKE as `sample: true` + `licensed` (credited on the card and in the popup), `lib/model/licensed.js` so the popup can open one by id, the housing asks no CORS of the CDN | shipped behind `PEXELS_API_KEY` — **not exercised against the live API (no key on this machine)**; built and tested against the documented response shape |
| A ticket company | `lib/places/ticketmaster.js` (the Discovery API: the show, the venue's coordinates, dates, price range, the event's image, the ticket page), `/api/places` folds live rows in under the register's filters (`live=0` reads the register alone; the composer and the ad ticker ask for that, since a BRDCST must attach a register row), `PlaceCard` hands a live row to the map popup | shipped behind `TICKETMASTER_API_KEY` — **not exercised against the live API (no key on this machine)**; built and tested against the documented response shape. TICKETS ↗ links out; ASILUM sells nothing |
| TikTok / Instagram video of other people | the rights register | **not possible by any API** (TikTok Display = your own videos after app review; Instagram's API = your own business account). The demo's motion is licensed stock and the owner's own uploads; recorded as BLOCKED BY DESIGN |
| Apple Maps | — | not in this slice: the map runs on OpenStreetMap with no key. MapKit JS needs the Apple Developer Program (which also unlocks MusicKit) — an owner signup |

## Decisions recorded (the owner may overrule)

1. **A licensed motion is model-shaped, not a passenger's post.** It carries
   `sample: true` so nothing counts it, likes it or links it as a person's,
   and `licensed` so the credit prints where the test pattern's label did.
2. **A live event is never a BRDCST's attachment.** The composer and the
   ticker read `live=0`; the server resolves an event from the register.
3. **The record itself before a live take.** `pickMatch` prefers the exact
   title, then the nearest, and counts only the words the store added
   against a result ("Live Forever" has "live" in its own name).
4. **Ordering without a centre**: the register's sourced rows, then the live
   listings, then the labelled fixtures — the Feed's first twelve PLACE
   cards are real before they are fictional.

## Honest gaps

- Ticketmaster and Pexels are proven against the documented shapes only;
  the first keyed run is the first live run.
- "Starburster" resolves to the live medley: the store's search does not
  return the studio single in its first ten for the artist.
- The eBay sweep is a script the owner runs; nothing schedules it.
- A live event's I WAS THERE claim names an id the attendance law cannot
  find in the register; it refuses as it would any unknown event.

## Proof

`tests/demo-sources.test.js` (12 tests; the five eBay ones FAIL with the
lane change reverted — checked); `npm test`, `npm run build` green.
