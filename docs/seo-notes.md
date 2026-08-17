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

### og:image — shipped 17 August, and it is generated

Held back until there was something real to serve: a card declaring an image it
cannot serve renders broken, and inventing a placeholder to satisfy a checklist
is the same failure in miniature. Both halves moved together, as this section
always said they had to — `app/opengraph-image.js` draws a 1200×630 card and
`twitter:card` is now `summary_large_image`.

**Generated, not committed.** A PNG in `public/` is a second copy of the design
language that nothing keeps in step, and this palette moved twice in two days for
contrast (#216 `--sig`, #218/#219 `--red` and `--p2`) — a committed binary would
have kept the old colours silently. The route draws from the token values in
`app/globals.css`, and `tests/opengraph-image.test.js` **reads that stylesheet**
and fails if the two drift. Same discipline as `tests/theme-contrast.test.js`.

**What it says.** The phosphor palette, the red asterisk left of the wordmark,
and the same sentence the catalog banner shows a reader: *the taste engine is
real — the clothes are not*, over *A DEMO ARCHIVE OF SYNTHETIC SAMPLE RECORDS*.
A shared link is seen by people who have not reached the page yet, so the card
carries the disclosure rather than leaving it behind the click. A test forbids
"shop now", "in stock" and the rest.

**Type, honestly.** The brand faces (Share Tech Mono, Michroma) ship as WOFF2 and
Satori reads TTF/OTF/WOFF only. Converting them needs tooling this machine does
not have, so the card uses the generator's built-in face and leans on what
survives a font swap: palette, the asterisk, the rules, wide tracking. It does
not pretend to be the site's typeface. A `fontFamily` and a `fontWeight` were
written, seen to do nothing in the render, and **removed** — a test keeps them
out, because a declaration that does nothing describes a card that does not
exist. If the fonts are ever converted to TTF, pass them via `fonts`.

**Verified as an artifact, not just as source:** served from a running server it
returns `content-type: image/png`, a valid PNG signature, and 1200×630 read out
of the IHDR chunk. Next emits `og:image`, `:type`, `:width`, `:height` and `:alt`
absolutely, through `metadataBase`.

**Per-route cards are deliberately not built.** One card for the site is honest;
twelve near-identical ones are churn. `/piece/<id>` is the only route with a real
case for its own card, and it is `noindex` demo inventory — see §"Built —
option (a)".

## Open, and not decided here

- **Apex vs. www — the code half is SETTLED (17 August); one owner step is left.**
  See §"One canonical host" below.
- **Stable product URLs — investigated 17 August. It is an owner decision, and
  smaller than it sounds.** Details below.

---

## One canonical host — ruling 7, 17 August

**The apex was serving a complete, indexable copy of the site.** `A @ ->
76.76.21.21` points `asilummagazine.com` at the same Vercel project, and only
`asilum.vercel.app` was redirected. So two hosts served every page, and every
canonical on both named `www`. Google honours a canonical, so nothing was
*broken* — but the redirect rule's own comment already claimed "One canonical
host", and that claim was true of the alias and quietly false of the apex.

**What changed.**

1. **`lib/site.js` is the only place the origin appears.** It was hardcoded in
   nine: `app/layout.js` twice, four segment layouts, `sitemap.js`, `robots.js`,
   `piece/[id]/page.js`. That is why this ruling was expensive to settle — a
   nine-file sweep in which one missed file *is* an inconsistent canonical. It is
   one constant now, overridable with `SITE_ORIGIN` for a fork or staging domain.
2. **The apex redirects to `www`**, permanently, by the same mechanism already
   proven on the alias. Preview deployments are deliberately untouched.

**The emitted output is byte-identical** — `robots.txt`, `sitemap.xml` and the
`/cover` canonical and `og:url` were compared before and after.

### Verified by request, not by reading the docs

A `has` host value is matched **exactly**. That mattered enough to test against a
running server with `Host` headers, because a suffix match would send `www` to
`www` forever and take the site down:

| `Host:` | Result |
|---|---|
| `asilummagazine.com` | `308 → https://www.asilummagazine.com/discover?q=coat` — **query preserved** |
| `www.asilummagazine.com` | `200` — no loop |
| `asilum.vercel.app` | `308 →` www |
| `asilum-git-fix-x.vercel.app` | `200` — previews stay reachable |
| `notasilummagazine.com` | `200` — no suffix matching either |

`tests/canonical-host.test.js` holds all of it, and the self-redirect filter is
its own test: deleting that filter reddens three assertions.

### Auth is safe, and slightly better

Password reset uses `redirectTo: window.location.origin + "/profile?reset=1"`, so
once a visitor lands on `www` the origin they send **is** `www` — the flow gets
*more* consistent, not less. An older link naming the apex still works: the 308
preserves path and query (measured above), and the token exchange happens on
`supabase.co`, not here. Both origins remain allow-listed in Supabase.

### The one owner step left

**Supabase → Authentication → URL Configuration → Site URL is still the apex**
(`https://asilummagazine.com`). It is a dashboard field — an agent cannot change
it — and it is what `{{ .SiteURL }}` resolves to in every auth email. Set it to
`https://www.asilummagazine.com` and ruling 7 is closed.

If instead ASILUM should *be* the apex, do not edit nine files: change
`SITE_ORIGIN` in `lib/site.js`. The redirect list inverts itself — `www` starts
handing traffic to the apex — and a test proves that flip rather than assuming it.

---

## Stable product URLs: what is actually true (17 August)

The audit lists this as outstanding. Investigated, and it needs a ruling rather
than an implementation, for three reasons.

### 1. The share URL already works — verified, not assumed

`shareItem()` copies `/?item=<id>`, and that link **does** restore the piece:
loading `/?item=syn-0911` cold opens the item dialog on *Y/Project — slip dress*
and posts the notice "showing pieces connected to a shared item". The handler
lives at `app/page.js:324`. So sharing is not broken, and the URL is stable in
the sense that matters to a person: it survives being pasted.

What the audit wants is a **path** (`/piece/<id>`) rather than a query parameter.

### 2. The SEO argument for a path is currently inverted

A path-based product URL exists to be **canonicalised and indexed**. Every
product here is synthetic, and this document already refuses to court indexing
for sample data. **Building indexable product pages for fabricated products
would undo the decision above.** Any such route has to ship `noindex` while the
catalog is a demo — at which point the SEO benefit is nil and the remaining
benefit is a tidier URL.

The argument turns around the day the catalog holds real inventory. Not before.

### 3. It collides with an owner decree

`asilum-ui` rule 8: **"item depth belongs to the item modal (owner decree)."** A
per-product *page* is item depth living somewhere else. Two shapes respect the
decree, and picking between them is the owner's call:

- **(a) Deep link only.** `/piece/<id>` server-renders nothing but metadata and
  hands off to the catalog with the modal open. Depth stays in the modal, the URL
  gets tidier, and a shared link can finally carry the piece's own preview.
- **(b) A real page.** `/piece/<id>` renders the depth itself. Cleaner for
  crawlers and for a future real catalog — and a direct contradiction of rule 8
  until the owner amends it.

### The one genuine gap, and why it is not a quick fix

**A shared piece link previews as the generic site card.** Paste
`/?item=syn-0911` into any social surface and the preview reads
"*ASILUM — fashion intelligence OS" with `og:url` pointing at the homepage —
not the piece. That is a real shortcoming of a share button whose notice claims
the link "carries its taste graph".

Fixing it needs per-request metadata, and **`app/page.js` is a client component**
(`"use client"` on line 1), so it cannot export `generateMetadata`, and a segment
layout never receives `searchParams`. So this is not a metadata addition — it
requires either option (a) above or converting the catalog to a server component
wrapper around a client child.

**Recommendation:** option (a). It is the smallest change that respects rule 8,
tidies the URL, and closes the link-preview gap — and it keeps `noindex` honest
while the catalog is synthetic.

### Built — option (a), on the owner's ruling

`/piece/<id>` (`app/piece/[id]/page.js`) is a **server** component, which is the
whole point: it can export `generateMetadata`, and `/?item=<id>` never could.

- **Per-piece preview.** `/piece/syn-0911` serves
  `<title>Y/Project — slip dress · *ASILUM</title>`, a matching `og:title` and
  `og:url`, and a self-referential canonical.
- **The demo warning travels with the card.** The description reads
  *"dresses · 2020s. A synthetic sample record — not real inventory, not for
  sale."* A preview is a claim made to someone who has not seen the page, so it
  carries the same warning the catalog shows in its banner.
- **`noindex`, and NOT robots-disallowed.** Deliberate, and the two are different
  jobs: `noindex` keeps a synthetic product out of search results, while leaving
  the path crawlable is what lets a scraper fetch the page and read the card. A
  disallow would break the exact preview the route was built to fix.
- **Rule 8 intact.** The page renders a name, the honest description and a link —
  nothing else. It hands off to `/?item=<id>` and the modal opens there as
  always. `tests/piece-url.test.js` fails if `price`, `Favorite`, `Bag`,
  `related` or a thumbnail ever appear on it.
- **No link rot.** `shareItem()` now emits `/piece/<id>`, and the old
  `/?item=<id>` handler stays exactly as it was, so links already shared keep
  working.
- **A no-JavaScript reader still gets something true:** the piece's name, the
  demo note, and a real link into the catalog.

Verified running: the crawler view by reading the served tags, and the human path
by loading `/piece/syn-0911` and watching it land on `/?item=syn-0911` with the
dialog open on the right piece. The hand-off uses `router.replace`, so Back from
the catalog does not bounce forward again.