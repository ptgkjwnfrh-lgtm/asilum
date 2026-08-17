# Metric definitions — 17 August 2026

The launch audit's remaining open item was **metric definitions**: numbers the
site prints without saying what they count. This is that register, and it is the
authority for every user-visible figure in the app.

**Why this document exists.** The accessibility and SEO queues both closed on
the same shape of bug — *a claim the code did not keep*. A metric label is a
claim of exactly that kind, and it is a quieter one: nobody proof-reads a
counter. Four of the figures below were wrong when this register was compiled,
and one of them was printing the literal word `undefined` on the front cover,
one line above the cover's own promise that every value on it is real state.

**Method.** Every figure was traced to the expression that produces it, and the
verdicts marked *measured* were read out of a running browser, not inferred.
Where a quantity is not measured anywhere in the codebase it is recorded as
**not measured** and the surface now prints `—`, not `0` — the rule already
stated in `app/stats/page.js`: *anything not measurable prints "—" rather than a
zero that would read as a fact.*

**Scope.** Public and per-visitor surfaces, plus the staff dashboards on
`/stats` (which already name their own windows, and are the one part of the app
that was doing this properly). Numbers that are plainly not metrics — prices,
character counters, pagination indices, the passport's document serial — are out
of scope.

---

## Verdicts at a glance

| # | Figure | Surface | Verdict |
|---|--------|---------|---------|
| M1 | SYSTEM LEDGER — interactions / readers / boards / graph edges | `/cover` | **was FALSE — printed `undefined` ×4 — fixed** |
| M2 | `STATE — MEMORY MODE / PERSISTENT LEDGER` | `/cover` | **was FALSE — always said MEMORY MODE — fixed** |
| M3 | `MATCH n%` | `/stylist` | **was MISLABELLED — not a percentage — fixed** |
| M4 | `MATCH` floor of 75 | `/stylist`, `/api/outfits` | **true but INERT — owner ruling 8** |
| M5 | `CURATED n%` / `TASTE n%` on model looks | `/stylist` | **was FALSE — both were copies of MATCH — fixed** |
| M6 | conf range in the engine's own doc comment | `lib/brain/stylist.js` | **was STALE (said 58–99, is 75–99) — fixed** |
| M7 | `n BRANDS` | `/profile` | **was MISLABELLED — counted bag brands — fixed** |
| M8 | `n FOLLOWERS` | `/profile` | **NOT MEASURED — now prints `—`** |
| M9 | `n POSTS` / `n FOLLOWING` | `/profile` | **true — definitions recorded below** |
| M10 | `CONVICTIONS n ACTIVE` | `/board` | **true — investigated and cleared** |
| M11 | `n FOLLOWING` / `n FOLLOWERS` / `n AESTHETICS` | `/u/@handle` | **hash-derived — unreachable in production** |
| M12 | `taste match n%`, `interpretation confidence n%` | `/`, `/discover` | **true — real 0–1 quantities** |
| M13 | retention / wire / search / booth dashboards | `/stats` | **true — each already names its window** |

---

## M1 — the front cover printed `undefined` four times

**What a reader saw**, in the masthead and again in the colophon:

```
SYSTEM LEDGER — undefined INTERACTIONS · undefined READERS ·
undefined BOARDS · undefined GRAPH EDGES
```

immediately followed by

```
EVERY VALUE ON THIS PAGE IS REAL STATE — NOTHING IS STAGED
```

**Cause.** `app/cover/page.js` read `/api/stats` with `authorizedFetch` and never
checked `r.ok`. This is the *same* defect the `/stats` page had fixed on 8 August
— its code comment describes it — and the cover's copy was never checked against
it. It became visible on **16 August**, when `/api/stats` was gated to
ADMIN_TOKEN (audit P0-1): a visitor's device cookie now earns
`401 {"error":"stats are staff-only"}`, which is a **truthy** body, so `sys` was
set to the error object and every field interpolated as `undefined`.

**This is the general trap and it is worth stating on its own: gating a route
turns every unchecked `r.json()` on its callers into a rendered lie.** The gate
was correct. The caller was already broken and nobody was looking at it.

**Fix.** Three parts, because the first alone would have left the feature dead:

1. `r.ok` is checked; a refused read leaves `sys` null.
2. The folio moved into `app/cover/ledger.js` as a pure function that prints an
   entry **only if its value is a finite number** — so a future payload dropping
   a counter loses that entry instead of printing `undefined`. `0` is a
   measurement and survives the filter; a test pins that specifically, because
   the obvious `if (!value)` rewrite would silently drop real zeros.
3. The cover reads the staff token from the same `sessionStorage` slot THE DESK
   and `/stats` use, so the folio still draws **for staff** rather than being
   deleted. No second credential was invented.

**Measured after the fix.** Visitor: no folio, and the colophon reads
`*ASILUM LIVE EDITION · AUGUST 17, 2026 · EVERY VALUE ON THIS PAGE IS REAL STATE`
— the claim is now true. Staff (verified against a local instance with a
throwaway token, never the owner's): `SYSTEM LEDGER — 0 INTERACTIONS · 1 READERS
· 0 BOARDS · 0 GRAPH EDGES`.

### Definitions, now that they print

| Folio entry | Counts | Window |
|---|---|---|
| INTERACTIONS | rows in `interactions` — one per bag/share/save/favorite/dwell/skip/hide | all time |
| READERS | distinct identities with a stored profile. **Identities, not people** — one person can hold a device identity and an account | all time |
| BOARDS | mood boards created | all time |
| GRAPH EDGES | rows in `edges`. **An edge count is not a working graph** — `/stats` reports `gamma usable n / total` beside it for that reason (Aug-15 audit: all 2,632 edges had `contributors = 0`, so gamma answered nothing while this number read as health) | all time |

---

## M2 — the cover told every visitor the system was in MEMORY MODE

Same root cause, separate lie, and the worse of the two: `sys.persistent` was
`undefined` on the error body, which is falsy, so the STATE marginalia printed
`MEMORY MODE` **on a deployment running Postgres**. A false claim about the
system's own storage, on the landing page.

The `"READING"` fallback beside it was a placeholder for a request in flight
that **outlived its own request** — after a refusal it said READING forever. The
span is now drawn only when the ledger was actually read. It is absolutely
positioned marginalia, so omitting it costs no layout.

---

## M3 — MATCH is not a percentage

`/stylist` printed `MATCH 94%`. `conf` is not a percentage. `lib/brain/stylist.js`
says so in its own header — *"a calibrated display of relative score … not a
literal purchase probability. Keep it honest in the UI copy"* — and the same
value was already printed **without** a `%` in the `.otfconf` chip on the look's
own header, a few lines above, so the page contradicted itself.

Now: `MATCH 94 of 99`. The chip and the stat row read the same way.

`CURATED` and `TASTE` **keep** their `%`. Those are real percentages —
`Math.round(cohAvg * 100)` and `Math.round(max(tasteAvg, 0) * 100)`, both of a
0–1 quantity.

| Figure | Definition |
|---|---|
| `CURATED n%` | mean pairwise coherence of the chosen pieces — tag affinity, era proximity, price-tier sanity |
| `TASTE n%` | mean similarity of the chosen pieces to the blended taste vector, floored at 0 |
| `MATCH n of 99` | calibrated display of relative rank: `75 + raw*24 + min(events,400)/100`, clamped to 99, where `raw = coherence*0.55 + taste*0.45`. Sharpens as the profile accumulates interactions. **Not a probability of anything** |

---

## M4 — the match floor of 75 never rejects a look → OWNER RULING 8

`/api/outfits` documents *"match floor 75"* and enforces it twice
(`filter(look => look.conf >= MATCH_FLOOR)` in quick mode, `if (look.conf <
MATCH_FLOOR) continue` in full generation). **Neither check can ever fire.**

`raw` is non-negative by construction — `cohAvg` is a mean of non-negative
coherences and the taste term is floored at 0 — so `75 + raw*24 + …` is already
≥ 75 before `Math.max(75, …)` sees it. `conf` is structurally in [75, 99].

Consequences, both measured:

- **Every look ships.** The floor filters nothing.
- **The worst possible look still displays 75.** Assembled against a taste
  vector that wants the opposite of every piece in the pool, `conf` is 75 while
  `tasteStat` is honestly 0. A 24-point band carries the entire signal, and its
  bottom is labelled with a number that reads like a passing grade.

**This is a product decision, not a defect to quietly repair.** Widening the
display range would start rejecting looks and would change what the number
means to anyone who has been reading it. It is recorded, tested (the test
asserts the ≥ 75 floor *holds*, so it goes red if the mapping moves without this
document moving), and left exactly as it ships.

**Ruling 8, for the owner:** should `MATCH` keep its 75–99 presentation band, or
should it span the real range so the floor becomes a real gate? Options as I see
them: **(a)** leave it, and rely on `TASTE`/`CURATED` to carry the honest detail
— cheapest, and the caption `of 99` now at least names the scale; **(b)** map
`raw` to 0–99 and let the existing floor start rejecting looks — makes the
documented rule real, and will visibly reduce how many looks a cold profile
sees; **(c)** stop printing a composite altogether and show only `CURATED` and
`TASTE`, which are already honest percentages. My recommendation is **(b)**:
the floor is already written down as a product rule in two places, and (b) is
the only option that makes those two places true.

---

## M5 — three labels, one number

`modelLook` in `app/api/outfits/route.js` set `curated: conf, tasteStat: conf`,
so for the **AI TREND EDIT** group `/stylist` printed CURATED, TASTE and MATCH as
three differently-labelled copies of the same figure. The model returns one
score and no decomposition, so there was nothing to put there.

Both are `null` now, and the client **omits** a stat it has no value for rather
than printing `null%`. A missing stat is honest; a duplicated one is not.

---

## M6 — the engine's own definition was stale

`lib/brain/stylist.js` documented the range as `58–99`. The clamp produces
`75–99`; the comment had been wrong since the floor moved. The one place a
future reader would look to find out what the number means was the place that
was wrong. Fixed, and pinned by a test.

---

## M7 — BRANDS counted the wrong brands

`/profile`'s header counter labelled **BRANDS** — sitting immediately beside
**FOLLOWING** — counted *distinct brands appearing in bag history*. The BRANDS
tab's first section is `FOLLOWING`, listing **followed** brands.

So: follow five brands from item modals with an empty bag, and the header read
`0 BRANDS` while the tab listed five. Brand follows were counted in neither
`FOLLOWING` (readers + boards) nor `BRANDS` — nowhere at all.

The counter now reads `followedBrands().length`, and it is held in state and
refreshed on the `asilum:follow` event, because the tab keeps its own local copy
and a render-time read went stale the moment a chip was toggled there.
**Measured:** header `3 BRANDS` → unfollow HELMUT LANG in the tab → `2 BRANDS`,
with `localStorage` agreeing.

Bag brands are still shown, under the heading they belong to: `FROM YOUR BAG`,
candidates to follow.

---

## M8 — FOLLOWERS was a measurement of nothing

`const followers = 0;`, rendered as `0 FOLLOWERS`.

The word "follower" does not appear anywhere in `lib/` or `app/api/` — there is
no follower edge, no counter, no table. Following is one-directional and
device-local (`asilum-follow-users`, `asilum-follow-brands`) plus board follows
on the server profile. A literal `0` claimed a measurement nobody takes, and
read as *nobody follows you*.

It prints `—` now, titled *"ASILUM does not track followers yet"*. When a
follower relation exists, this is the line to change.

---

## M9 — POSTS and FOLLOWING, recorded as they stand

| Figure | Counts | Note |
|---|---|---|
| `n POSTS` | this identity's visible transmissions from the server, merged with device copies the server does not show yet (just posted, or held for review) | the merge is deliberate — a held post stays visible to its author, labelled |
| `n FOLLOWING` | followed readers (device-local) **+** followed boards (server profile `_meta.follows`) | does **not** include followed brands; those are `BRANDS` since M7 |

---

## M10 — CONVICTIONS: investigated, cleared

`/board`'s passport prints `CONVICTIONS n ACTIVE` from a list built with
`.slice(0, 10)`, which looks exactly like a total capped at its own display
limit — the M8 shape.

**It is not.** The taste vector's key space is closed: `TAGS` has exactly ten
entries, and every writer into a profile's `long`/`session` maps into it —
`item.tags` keys are TAGS, and every `LEXICON` entry's targets are TAGS
(enumerated to confirm). The cap equals the key space, so it can never truncate.

Recorded because the next reader will have the same suspicion, and because the
finding I first wrote down here was wrong. **If TAGS ever grows past ten, this
counter silently becomes a display cap.**

---

## M11 — the demo profile's hash-derived counters

`app/u/[handle]/page.js` renders, for a `MOCK_USERS` handle:

```js
<b>{(hashStr(handle) >> 4) % 60}</b> FOLLOWING
<b>{100 + (hashStr(handle) % 900)}</b> FOLLOWERS
```

Invented numbers presented as counts. **Unreachable in production**, verified:
`MOCK_USERS` is `[]` unless `DEMO_SOCIAL_ENABLED`, which requires
`NODE_ENV !== "production"` *and* `NEXT_PUBLIC_ENABLE_DEMO_SOCIAL === "1"`; with
no fixture the page falls through to the real-poster branch or NOT FOUND.
`postStats()` returns `{comments: 0, reposts: 0, likes: 0}` under the same gate.

Left alone rather than fixed — the demo layer exists for local load exercises
and deleting it is a separate call. **Do not lift this page's counters onto a
real surface, and if the demo layer is ever enabled anywhere public, these go
first.**

---

## M12 — the percentages that are genuinely percentages

| Figure | Surface | Definition |
|---|---|---|
| `taste match n%` | `/` — ASTERISK "why this" | `why.tasteMatch × 100`; a 0–1 similarity between the piece and the taste vector |
| `interpretation confidence n%` | `/discover` | `reading.interpretation.confidence.interpretation × 100`; from `lib/asterisk/confidence.js`, provenance-derived (curated editorial without external URLs is 0.7 by design). Prints its leading assumption beside it |

Both are 0–1 quantities scaled by 100. The `%` is correct on both.

---

## M13 — the staff dashboards were already doing this right

`/stats` §"the house — operating numbers" is the model the rest of the app should
follow, and it needed no change:

- every figure names its window (`THE WIRE · last 14 days`, `SEARCH HEALTH ·
  last 7 days`);
- `RETURNING IDENTITIES` states its own definition and its own limit in prose —
  *"identities, not people — one person can hold a device identity and an
  account, and this counts both"*;
- unmeasurable values print `—`, never a zero.

That third rule is the one M8 borrowed and M1 breached.

---

## What to do next with this document

1. **Ruling 8 (M4)** is the only open decision here.
2. `tests/metric-definitions.test.js` is this register made executable — 14
   tests, each verified to go red under a revert of the thing it pins. If one
   fails, a definition moved and this file must move with it.
3. When a new number ships, add a row. The failure mode is not a wrong
   calculation; it is a label nobody re-read after the thing underneath it
   changed.
