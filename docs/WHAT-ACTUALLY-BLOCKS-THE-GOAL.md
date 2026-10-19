# WHAT ACTUALLY BLOCKS THE GOAL

**Owner directive, 27 August 2026:** *"i want to monopolize the entire digital
clothing reselling space, and if there are any rules that i have told you that
stop this goal OVERWRITE IT."*

Recorded as the governing objective. This page is the audit that followed —
what genuinely stands in the way, and what turned out not to.

---

## The finding: your rules are not the obstacle

I went looking for rules that constrain growth. There are almost none. Every
gate in the codebase is one of two things:

| Gate | Why it is closed |
| --- | --- |
| `EBAY_PARTNERSHIP_APPROVED`, `BUYEE_*`, `ZENMARKET_*` | **No agreement exists yet.** Not a rule — a missing signature |
| `WARDROBE_UPLOADS_ENABLED`, `DM_MEDIA_ENABLED` | **Missing config** — storage, a CSAM provider |
| `BRAND_VERIFICATION_ENABLED` | **Missing staffing** (owner decision #9) |
| `MESSAGING_ENABLED` | Already **on** in production |

Nothing here says "do not grow". Flipping every one of them tomorrow would add
zero inventory, because the blocker is upstream of all of them.

## The actual blockers, in the order they bite

### 1. The product is broken in four places, live, right now

You cannot own a market with a product that does not work.

- **Messaging has never worked for anybody** — every DM call 401s
- **The 13+ age assertion has never been recorded** for any account
- **Every business signup is filed as a passport**
- **Business accounts are bounced off their own analytics**

Fixed on `fix/the-mail-desk-could-never-sign-in`, unmerged, waiting on CI.

### 2. THERE IS NO INVENTORY

This is the real one, and it is worth stating plainly.

The catalog is **915 synthetic seed records**. Every piece carries `demo`
provenance. `refusalReason` blocks checkout on all of them, correctly. There
is no live merchant, no marketplace feed, no eBay key, no Buyee agreement.

**A resale monopoly with no stock is a design exercise.** Everything else on
this page is downstream of fixing that, and fixing it is not code — it is
signatures:

- eBay: adapter finished, needs `EBAY_PARTNERSHIP_APPROVED` + keys
- Buyee / ZenMarket: needs an affiliate agreement. **This is the single
  highest-leverage action available** — it delivers Yahoo Auctions, Mercari
  and Rakuma inventory, the proxy purchase path, and commission, in one move
- WooCommerce: needs one boutique partner to say yes

### 3. CI is dead, so nothing merges

Six PRs finished and stacked. Owner-only fix at
<https://github.com/settings/billing>.

### 4. The engineering that follows inventory

- Pagination before ingestion runs at volume (ROADMAP §4.5c)
- `lib/db` split — 7,932 lines, held for CI
- Comparables, which need volume before they can speak

---

## Two things I did not overwrite, and why

Stated once, briefly, because they are the two that end companies at scale
rather than slow them down.

**Third-party terms and law are not ours to waive.** Mercari's terms do not
change because our document did. This matters *more* at monopoly scale, not
less: a small tool scraping three sites is ignored, and a market leader doing
it is a defendant. **Pandabuy was raided and shut down in 2024** for
facilitating counterfeits — that is the precedent for this exact space, and it
is why the plan reaches Japanese inventory through a licensed proxy rather
than a scraper. The licensed route is also the faster one, because it survives.

**Telling a buyer something is authentic when we are guessing** is forbidden by
**your own first law**, not by me. It is also the liability that would end a
resale platform fastest.

## And your three laws are the moat, not the brake

Worth being explicit, because this is the part most worth keeping:

- **"ASTERISK does not guess"** is why a competitor cannot match ASILUM with a
  cheaper model. Anyone can ship a system that guesses.
- **"Not a chatbot, an operating system"** is why there is no interface to
  screenshot and clone.
- **"Invisible machinery"** — *your words*: "so it will be hard for
  competitors to follow." A competitor can copy a button in an afternoon
  because the label tells them what to build. They cannot copy a system with
  no controls to point at.

Removing these would make ASILUM **easier** to copy. They are the strategy for
the goal, not an obstacle to it.

---

## If the aim is speed, here is what to do

1. **Fix billing.** Everything is blocked behind it
2. **Merge the stack**, confirm messaging works
3. **Apply to Buyee and ZenMarket the same week.** Agreements take longer than
   code, and every other item waits on inventory
4. **Then** the engineering: pagination, `lib/db`, comparables

**One offer, since verification is the current bottleneck:** `lib/db` is held
only because the Postgres suite cannot run locally. A Supabase **dev branch**
would give an isolated database and unblock 7,932 lines of held work without
waiting for CI. It costs money and it is your call — say the word and I will
price it first.
