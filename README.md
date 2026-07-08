# asilum-brain

ASiLUM — a fashion moodboard whose feed is ranked by a six-bridge
personalization engine: content match, dominant trait, co-engagement taste
graph (Pinterest-style), popularity, exploration, and sponsored. Feeds are
zoned — pieces you already like, pieces you'll *probably* like (taste expanded
one hop through the aesthetic-affinity matrix), and a couple of deliberate
far-reach explorers. It learns from favorites, board saves, shares, skips
(fast skips count double), and on-screen dwell time.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

No database needed for local play — everything runs in memory (and resets on
restart).

## Deploy (persistence)

Set `DATABASE_URL` (Neon / Supabase / any Postgres) in the environment. The
schema (profiles, interactions, taste-graph edges, popularity counters, boards)
is created automatically on first request. Without it, all learning lives in
process memory and is lost on every restart or redeploy — fine for demos,
wrong for production.

## Ingesting real listings

`POST /api/ingest` pulls from **permitted sources only** (merchant/affiliate
feeds and official product APIs — never ToS-restricted retailers; see
`lib/ingest/sources.js`). Guard it by setting `INGEST_TOKEN` in the
environment, then:

```bash
curl -X POST https://<host>/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"token":"<INGEST_TOKEN>","merchantFeedUrl":"https://merchant.example/feed.json"}'
```

Wire that to a cron on the deploy platform for fresh inventory. The seed
catalog (1,000 items in `lib/ingest/catalog.json`) is used whenever the items
table is empty. `node scripts/fill-met-images.mjs` re-runs the Met open-access
enrichment (public-domain images + object links).

## Pages & API

- `/` — HOME: the big masonry feed (minimal cards; full detail on click),
  infinite scroll, filters, community posts woven in. First visit offers a
  coming-soon account-link prompt (`POST /api/connect` returns an honest
  unavailable message until real OAuth adapters are wired), else the moodboard
  + following jump-start.
- `/hotlist` — EDITORIAL/HOTLIST: live ranking from the popularity counters.
- `/stylist` — THE STYLIST: full outfits (taste + coherence + fit-gated via
  the size brain); "STYLE IT ✂" on any piece anchors every look around it.
- `/board` — MOODBOARD: view/rename/prune boards; share links
  (`/?board=<id>`) seed the feed of whoever opens them; FOLLOW makes a board
  a standing influence on your feed (`POST /api/follow`).
- `/orders` — every add-to-bag event, shown as purchase/ticket history for the prototype.
- `/stats` — the living brain viz (learns white, forgets red) + what the
  brain has learned. Idle profiles fade on the clock (6-day half-life,
  `lib/brain/memory.js`).
- API: `GET /api/feed`, `POST /api/train`, `POST /api/interaction` (actions:
  bag/share/save/favorite/dwell/skip/hide), `GET|POST|PATCH|DELETE /api/boards`,
  `GET /api/related`, `GET /api/outfits`, `POST /api/connect`,
  `POST /api/follow`, `GET /api/orders`, `GET /api/profile`, `GET /api/stats`,
  `GET /api/ebay` (official Browse API; needs EBAY_CLIENT_ID/SECRET env),
  `POST /api/ingest`.

## Stress test

```bash
npx next build && npx next start -p 3457 &
python3 tests/stress_test.py
```

1,000 simulated users across 10 taste archetypes; verifies personalization
convergence, taste-graph coherence, cross-account popularity transfer, board
taste transfer, archetype separation, and the zone mix.
