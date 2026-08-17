# SEO notes — 16 August 2026

What ASILUM tells crawlers, and — more importantly — **what it deliberately does
not tell them.** The launch audit listed canonical URLs, OpenGraph, JSON-LD and
per-route titles as outstanding. Three of those four are now shipped. The fourth
is refused on purpose, and this document is the reason.

## The constraint everything here follows

**The catalog is a demo.** Every piece is a synthetic sample record with
placeholder imagery — not real inventory, not for sale, no real prices or
availability (owner ruling, #212). The page says so to a reader's face in a
red-bordered banner on `/`, `/discover` and `/stylist`.

Search metadata is the same promise made to a machine. So the rule is: **a
crawler must not be told anything the page would not tell a person.**

## What shipped

- **`metadataBase`** on the root layout. Without it every relative canonical and
  `og:url` resolves relative and is worthless to a crawler.
- **A title template** — `%s · *ASILUM`. Before this, 13 of 17 routes inherited
  the root title, so every page in a search result read
  "*ASILUM — fashion intelligence OS" with no way to tell them apart.
- **Canonicals on every route.** Public routes point at themselves; so do the
  personal ones (see below).
- **OpenGraph on the four public destinations** — `/cover`, `/discover`,
  `/hotlist`, `/stylist` — with descriptions that name the catalog as synthetic.
- **`noindex, nofollow` on the eight personal surfaces**: `/board`, `/profile`,
  `/settings`, `/orders`, `/asterisk`, `/upload`, `/stats`, `/admin`.
- **`/cover` added to the sitemap.** It is a public destination and was
  crawlable but unlisted.
- **`/upload` added to the robots disallow list.** It was `noindex` in metadata
  but absent from `robots.txt` — the two lists disagreed. `tests/seo.test.js`
  now fails if they drift apart again.

## Why personal routes carry noindex AND a robots.txt disallow

They do different jobs. **`robots.txt` is advisory and governs fetching** — a
well-behaved crawler will not request the page, but a URL discovered elsewhere
can still be indexed *without being fetched*, on the strength of inbound links
alone. **A meta `noindex` is what actually keeps it out**, and it is only seen
if the page is fetched. Belt and braces, deliberately.

Their canonicals are **self-referential, not inherited**. Left inherited, each
one pointed at `/` — telling a crawler "my content really lives at the homepage"
while also saying "do not index me". Two contradictory signals about one URL.

## What is deliberately NOT here

### Product JSON-LD — refused

Structured `Product` data is what puts a price, an availability and a rating
into a search result and into Google Shopping. **Every product on this site is
fabricated.** Emitting `Product` markup would push invented prices and invented
availability into a shopping index — the most consequential possible version of
the fake this project's constitution forbids, and unlike a labelled page a rich
result carries no banner explaining itself.

`WebSite` or `Organization` JSON-LD would be honest and is a reasonable future
addition. **`Product` stays out until the catalog is real inventory.**

### og:image — absent, not forgotten

There is no image asset in `public/`. Declaring `og:image` pointing at a file
that does not exist renders a broken preview, and inventing a placeholder to
satisfy a checklist is the same failure in miniature. `twitter:card` is
`summary` rather than `summary_large_image` for the same reason: a large-image
card with no image is worse than a small one. **Upgrade both the day a real
cover image ships.**

## Open, and not decided here

- **Apex vs. www is still an owner ruling** (register of pending rulings, #7).
  Everything in this repo — `sitemap.js`, `robots.js`, and now every canonical —
  uses `https://www.asilummagazine.com`. Supabase's Site URL uses the apex.
  Nothing is broken, but **canonicals are exactly where this inconsistency would
  start costing ranking**, so it is worth settling.
- **Stable product URLs remain deferred.** Items open at `/?item=<id>` — a query
  parameter on the catalog, not a route — so there is no product URL to
  canonicalise. That is also *why* the JSON-LD question stays theoretical: there
  is no per-product page to attach it to.
