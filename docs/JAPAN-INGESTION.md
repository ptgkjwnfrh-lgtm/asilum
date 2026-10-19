# JAPANESE MARKETPLACE INGESTION — the spec, and how to finish it

**Status: the READING is built and tested. The FETCHING is blocked on an
agreement, not on code.**

That split is deliberate and it is the whole strategy: the hard, slow,
compounding half — teaching the system to read Japanese listings — needed no
partner and no permission, so it is done. The day a feed exists, this becomes
a fetch and a map.

---

## 1. The decision that shapes everything

SwagSearch monitors Yahoo! JAPAN Auctions, Mercari and Rakuma. **None of them
has a usable public API** — Mercari and Rakuma have none at all, Yahoo's is
restricted. Whatever they are doing, ASILUM cannot copy it and stay
licensable.

**So the proxy IS the data source.**

Buyee (Tenso Co.) and ZenMarket already aggregate *exactly those three
marketplaces*. They already handle purchase, consolidation, customs and
international shipping. They already run affiliate programmes.

One licensed integration therefore delivers:

| | |
| --- | --- |
| ✅ **Ingestion** | The same inventory, licensed |
| ✅ **The proxy problem** | Solved — they *are* the proxy |
| ✅ **Monetization** | Affiliate commission, not a $25/month subscription |
| ✅ **ASTERISK's first law** | Data we can point at |

Strictly better than scraping three sites and linking out, and defensible to a
partner, a merchant and a lawyer.

## 2. What is built

### `lib/ingest/japan/vocabulary.js` — the archivalist register

Seven tables, every row written down by a person: houses (katakana), garments,
materials, colours, condition grades, departments, authenticity claims.

**Why a table and not a translator.** A machine translation of
「ヘルムートラング パンツ」 is a guess with no provenance — plausible, usually
right, unattributable when wrong. A mapping has somebody to ask.

Two design notes that matter:

- **Katakana only for houses.** Latin spellings already resolve through
  `lib/search/intent.js`; duplicating them would create a second register to
  keep in sync.
- **Condition grades are kept, not flattened.** Japanese resale distinguishes
  美品 from 中古 from Aランク, and a reader who cares about archive pieces
  cares about exactly that difference. Flattening to "used" throws away the
  most reliable information in the listing.

### `lib/ingest/japan/read.js` — the reader

Pure. No network, no database, no model. A title in, facets out — **and the
words it could not read, out separately.**

```
「【中古】ディオール シルク スカーフ ネイビー Aランク」
  → { brand: "Dior", garment: "scarf", material: "silk", condition: "excellent" }
    merchantColor: "navy"     ← a CLAIM, for colorEvidence to corroborate
    unread: []
```

**It never guesses.** A katakana run not in the tables is not transliterated,
not fuzzy-matched to the nearest house, not sent to a model. It is reported as
unread. A wrong brand on a ¥77,000 listing is worse than an unread one, and
unlike a guess it is fixable.

### The archivalist loop

`unreadFromTitles(titles)` returns unread terms **ordered by frequency**, so an
hour of a person's time buys the most reading. That ordering is the value: the
word on ninety listings outranks the word on one.

This is the same shape `lib/asterisk/unknownQueries.js` already uses for
search, and it is what "trained via ASILUM archivalists" means in practice.

### The invisible part

**There is no language control.** No translate button, no flag icon, no
"source language" filter. A reader searches `helmut lang trousers` and a Yahoo
listing titled 「ヘルムートラング パンツ」 comes back — because the system read
it, not because anybody asked.

A competitor can add a translate button in an afternoon; the label tells them
what to build. What they cannot copy is a catalog that was already legible.
See `docs/INVISIBLE-MACHINERY.md`.

## 3. Where it connects to what already exists

The systems compound rather than sitting side by side:

| Reads | Feeds |
| --- | --- |
| `sellerClaim: "declared-replica"` | **`lib/authenticity/evidence.js`** — a seller admission is the strongest evidence readable from a listing |
| `merchantColor` | `lib/ingest/colorEvidence.js` — corroborated against photographs like any colour claim |
| facet values | The tag layer, so search cannot tell a Japanese listing from an English one |
| source name | `lib/provenance.js` — marketplace stock is labelled `unverified`, per the owner's ruling |

**The one that matters most:** 「スーパーコピー」 on a listing is a seller
saying their own item is a copy. That is an admission against interest, and
therefore real evidence rather than an inference. A seller asserting 「正規品」
(genuine) is worth nothing and is deliberately met with **silence** — repeating
it back would turn a claim into an endorsement.

## 4. What is blocked, and on what

| Blocked | Waiting on |
| --- | --- |
| `buyeeAdapter` | A Buyee affiliate agreement covering display, caching and aggregation |
| `zenmarketAdapter` | The same from ZenMarket |
| Live listings | Either of the above |
| Price comparables | Volume — the model is silent below n=3 |

Both adapters are **registered and honestly disabled**, so `adapterStatuses()`
reports them with the agreement they await. A stub returning fake listings is
the thing this codebase refuses to do.

## 5. Finishing it — the procedure

1. **Get the agreement.** Buyee and ZenMarket both run affiliate programmes;
   ask explicitly about display, caching, aggregation and source labelling.
2. **Add rights-register rows** — `docs/RIGHTS-REGISTER.md`, one per source,
   with a kill switch.
3. **Replace `disabledAdapter`** in `lib/ingest/adapters/index.js` with a real
   adapter on the existing interface (`getSourceName`, `enabled`,
   `fetchProducts`) — `woocommerceAdapter.js` is the closest model.
4. **Map each listing through `readJapaneseTitle`.** Facets to the tag layer,
   `merchantColor` to the colour-evidence path, `sellerClaim` onto the item.
5. **Stand up the archivalist queue** from `unreadFromTitles`. Expect the first
   batch to be large; that is the system telling you what it does not know.
6. **Keep the gate**: `BUYEE_AFFILIATE_APPROVED=1`, like eBay and WooCommerce.

### Growing the vocabulary

Append rows. Every table is null-prototype and longest-key-first, so
「新品未使用」 beats 「新品」 without special handling. `tests/japan-reading.test.js`
asserts every emitted facet is one the scorer knows — a typo would otherwise
create a private vocabulary search cannot see.

## 6. What must NOT be built

- ❌ **Scraping Yahoo, Mercari or Rakuma.** No public API is not an invitation
- ❌ **Transliteration or fuzzy brand matching** — that is guessing, on money
- ❌ **A model translating listings.** No provenance, nobody to ask when wrong
- ❌ **A stub adapter returning plausible listings**
- ❌ **A language control.** The catalog is legible or it is not

## 7. Also decided

**Taobao is a separate path** and is already ruled on: ingest it, label it
`unverified-origin`, never hide it (`OWNER-DECISIONS.md` §11). It needs its own
agreement — Alibaba's open platform, or an agent-proxy partner — and shares
none of the Japanese proxy work except this reader's shape.
