# The catalog stops being synthetic — 12 September 2026

**What changed.** `items` held 915 rows and every one of them said
`source = 'Asilum synthetic seed'`. Real eBay listings are now in the same table
under `source_name='ebay'`, read through the official Browse API, gated, and
written by the same writer the admin sync route uses.

## Why this round happened

The owner asked for an honest reading of how ASILUM works. The answer was that
it is an unusually principled recommender that had never met a stranger: 97% of
all user_events (28,685 of 29,624) were written on one day — 3 August 2026 — by
4,026 seeded profiles, the co-engagement graph and popularity counters were
therefore reading invented behaviour, and the catalog those profiles browsed was
invented too. First light (10 Sep) proved Asterisk could READ real listings; it
wrote nothing, by design. The owner's instruction, same session: *"get real
listings into items you have the api keys."*

## ⚖ The ruling this run stands on

`docs/epn-terms-check-2026-08-22.md` ends: *"eBay ingest cannot be switched on
until the Prohibited AI Uses question is resolved, because switching it on
routes eBay Data into a recommender by design. That is a ruling, and rulings are
the owner's; this file does not make it."*

The owner has now made it twice — by keying the adapter on 10 September, and by
this instruction on 12 September. Recorded here with the date and the words, not
resolved: the five questions for counsel in that brief are still open, and the
brief is still accurate about the external risk.

**The sharper of the two clauses stays untouched by default.** Clause 1 (eBay
Data may not improve a recommender) is engaged by any ingest — that is the
owner's call above. Clause 2 (eBay Data may not be exposed to a foundation model
without eBay's prior written approval) is engaged only by the identification
step, so `scripts/ebay-ingest.mjs` runs the deterministic read by default and
puts the model behind an explicit `--deep`. The default ingest sends nothing to
any model.

## How it works

`npm run ebay:ingest` — dry by default, `--write` to fill the catalog.

1. **The plan** (39 queries, three lanes) — houses for the archive, garments for
   the wardrobe, eras for the way people look. `--lane`, `--query` and `--limit`
   override it.
2. **Stage one, free**: `summaryRefusal` reads the search summary. A title under
   12 characters, no image, no price, a price over $100,000, a lot or bundle,
   packaging sold on its own, a made-to-order piece, or a seller admitting a
   bootleg — refused before a detail call is spent on it.
3. **The read**: THE STREAM (`lib/asterisk/stream`) fetches the item detail,
   decodes the seller's own item specifics, and composes the tag object — ten
   canonical aesthetics plus descriptors. No model unless `--deep`.
4. **Stage two**: `catalogRefusal` reads the composed product. No source URL, no
   source id, no readable tags, or a description that admits a reproduction —
   refused. And the last rule is the checkout gate itself (`lib/purchasable.js`):
   a piece the ticket flow would refuse never enters as inventory.
5. **The write**: `persistProducts` — the items row, typed `product_tags`, the
   extra `product_images`, a `source_sync_logs` row, and (with `--deep`) the
   identification. One writer, shared with `/api/admin` sync and the ghosts run.

## Two honesty rules the ingest enforces, and why

- **No invented houses.** `normalizeEbayItem` falls back to the first two words
  of the title when no seller aspect names a brand, which on first light
  produced houses called "Vintage Helmut" and "Size 14". The ingest drops a
  title-derived brand; the row says `Unknown`, and `Unknown` is never written as
  a brand tag anyone could filter by.
- **No invented decades.** `guessEra` assumes `2020s` when a title carries no
  year, no season code and no "90s". Written into the catalog that assumption
  becomes a decade tag at confidence 0.6 on every undated listing, a 2020s
  filter that returns the whole archive, and a brain learning an era from a coin
  flip. `era.raw` is the evidence marker — no evidence, no era.

## Two defects this found

- **`addProductTags` wrote nothing where Postgres disagreed with memory.** The
  in-memory store skipped a duplicate `(tag, facet)` pair; Postgres takes the
  list into one `INSERT ... ON CONFLICT DO UPDATE` and throws *"cannot affect row
  a second time"*. Every test runs on the memory branch, so this was invisible
  until a real listing whose Material aspect said "Cotton" and whose descriptors
  carried `cotton` hit the real database — and it wrote the items rows while
  failing their tags. `dedupeTagRows` folds the list the way ON CONFLICT's
  GREATEST would, so the two branches now mean the same thing.
- **Schema v51 was not applied.** The shared `upsertItems` writes
  `listing_kind`, which arrives with v51 (PR #465, still open). Applied to
  production on 12 September — additive, idempotent, `listing_kind` defaults to
  `'live'`, rollback documented in the migration header.

## Rollback

```sql
DELETE FROM items WHERE source_name = 'ebay';
```

`product_tags`, `product_images` and `asterisk_identifications` cascade or are
orphaned by item id; the seed's 915 rows are untouched by the ingest and by the
delete.

## The seed is gone (same day, owner's instruction: "just delete them, i don't care about the seeded history")

The 915 synthetic rows and everything the seeding run of 3 August created were
deleted from production in ONE atomic statement. **No foreign key anywhere
references `items`**, so a plain DELETE would have cascaded nothing and left
~87,000 rows pointing at ids that no longer exist — silently. The statement swept
them together:

| table | rows | why |
|---|---|---|
| items | 915 | the seed itself |
| product_tags | 20,713 | their tag rows |
| board_items | 6,087 | pins on seed pieces + every pin on a seeded board |
| popularity / popularity_contributors | 915 / 529 | the delta bridge's entire population |
| edges | 2,658 | the whole co-engagement graph — every edge had a seed id on at least one side |
| interactions | 29,578 | |
| user_events | 29,607 | |
| boards | 3,163 | the seeded profiles' boards |
| profiles | 4,027 | the synthetic people themselves |
| user_corrections / product_ai_tags / tag_reconciliations / purchase_tickets | 26 / 11 / 2 / 1 | |

A second statement removed 110 rows of older orphaned debris that predated this
round (`txn-item-*`, `syn-ad-*`, `r1-item` — ids left by tests that once ran
against production).

**Who the seeded profiles were.** Defined strictly: a user whose every event fell
inside the 3 August window. 4,027 of them, **none** of which is one of the six
real `auth.users` accounts, and none of whose events touched a real listing. The
52 real device ids and their 901 events were left alone — except where they acted
on a seed piece, which went with the piece (722 interactions, 1 board pin).

**Backups before anything was deleted**, restorable row-for-row:
`~/.local/asilum/seed-rows-backup-2026-09-12.json` (9.9 MB — the items and every
dependent row) and `~/.local/asilum/behaviour-backup-2026-09-12.json` (19.9 MB —
user_events, interactions, profiles, boards in full).

**After:** 897 items, all `source_name='ebay'`; 11,734 tag rows; 7,878 images;
**zero orphans in any table**. popularity, edges, interactions and board_items are
at 0 — they only ever held seeded behaviour. A cold feed is 40/40 real listings;
`/`, `/discover`, `/board` and `/hotlist` load with zero console errors; suite
1505/1428/0/77.

**What the brain lost, stated plainly.** The delta bridge (popularity) and the
gamma bridge (co-engagement) now have no population at all, and every `profiles`
row that remains belongs to a real device. Those two bridges score nothing until
real people act on real pieces. That is the honest state, and it is better than
the previous one, where they scored confidently from invented behaviour.

## What this does NOT do

- **It does not remove the seed from the repo.** `lib/ingest/catalog.json` is still
  imported at runtime by `lib/search/index.js` (designer phrases),
  `lib/search/typo.js` (the typo dictionary), `app/api/stats/route.js` and
  `app/api/orders/route.js` (id→title maps) and `lib/asterisk/explain.js` (a
  per-id fallback). None of them puts a seed piece in the feed or in search
  RESULTS — verified after the delete — but the seed's vocabulary is still in the
  search engine's head. `lib/products.js` and `lib/brain/index.js` fall back to it
  only when the database returns zero rows, which no longer happens. Removing the
  file is a separate change, and several offline instruments use it legitimately
  as a fixture.
- It does not keep listings fresh. A sold eBay listing stays `available` in the
  row until something re-checks it; `ebayAdapter.checkAvailability` exists and
  the ticket flow calls it at purchase time, but no sweep runs on a schedule yet.
- It does not make the brain's instruments honest. Those still measure against a
  simulated world; real signal needs real people, not real inventory alone.
