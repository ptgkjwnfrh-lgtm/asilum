# DEBT REGISTER — what is not yet organized, and why

**Audience: the incoming CTO.** A handover that shows only the tidy parts is
not a handover. This is the list of everything a newcomer will trip over,
measured rather than estimated, with a plan and a reason for each.

Regenerate the numbers at any time:

```bash
npm run audit:nav
```

Nothing here is a mystery or a "we should look into it". Every item has a
known cause and a known fix. The only reason the largest ones are still open
is stated in **Why this is not all done already** at the bottom — and it is not
a technical reason.

---

## The numbers, as of main @ ed316d8

| Measure | State |
| --- | --- |
| Source files | 307 |
| Files over 1,200 lines | **5** |
| Files with no header comment | **38** (87.6% documented) |
| Exported functions | 877 |
| …with no label | **417** (52.5% labelled) |

**Read that second number correctly.** 87.6% of files explain themselves at the
top, and many of them explain themselves unusually well — this codebase's house
style is a header that gives the *reason* a module exists, not just its name.
The gap is concentrated, not spread thin, and the table below says exactly
where.

---

## 1. Oversized files

A file a newcomer cannot hold in their head is the single biggest tax on a
handover. Five files are over 1,200 lines.

| File | Lines | What it holds | Split risk |
| --- | ---: | --- | --- |
| `lib/db/production.js` | 4,461 | CRUD for ~20 production tables in one module | **HIGH** — verified only by the Postgres suite |
| `lib/search/index.js` | 1,870 | Query parse → retrieve → rank → rack assembly | Medium — well covered by unit tests |
| `lib/asterisk/culture.js` | 1,826 | Curated cultural knowledge (films, music, cities, decades) | **LOW** — mostly a data table |
| `lib/db/dm.js` | 1,747 | The mail desk's whole store | **HIGH** — Postgres suite only |
| `lib/db/index.js` | 1,724 | Persistence layer + in-memory fallback | **HIGH** — Postgres suite only |

### The proposed split

**`lib/asterisk/culture.js` → do this first.** It is largely a static data
table with a few readers. Separating the data (`culture/films.js`,
`culture/music.js`, `culture/cities.js`, `culture/decades.js`) from the reading
logic (`culture/index.js`) is close to risk-free and removes 1,800 lines from
the "scary files" list immediately.

**`lib/search/index.js` → second.** It already has natural seams — parse,
retrieve, rank, assemble racks. Those are four modules. The 1,299-test unit
suite genuinely covers this path, so the split is verifiable on a laptop with
no database.

**`lib/db/*` → last, and only with CI green.** These three files are 7,932
lines together and every one of them is verified by the 72-test Postgres
integration suite, which cannot run locally (no Postgres, no Docker on the
current machine). Splitting them blind is the one change most likely to
introduce a silent fault in the layer where a silent fault costs the most.
The seams are obvious and already implied by the table groups — `products`,
`tags`, `tickets`, `identity`, `measurements`, `brands` — so this is a
mechanical job the day the suite can run.

## 2. Unlabelled exported functions — 417

Concentrated, not scattered:

| Area | Unlabelled | Note |
| --- | ---: | --- |
| `lib/db` | 115 | Largely the CRUD in the oversized files above — best fixed *during* the split, not twice |
| `app/api` | 64 | Route handlers. `GET`/`POST` tell you the verb and nothing about the contract |
| `lib/brain` | 23 | The ranking engine — the highest-value labels in the repo |
| `lib/search` | 21 | Same seam as the split above |
| `lib/client.js` | 20 | Browser-side helpers |
| `lib/asterisk` | 19 | |
| `lib/social.js` | 18 | |
| `app/components` | 17 | React components; several are self-evident from the name |
| `lib/security` | 10 | **Do these first regardless of size** — see below |

**`lib/security/` is the priority despite being only 10 functions.** It has no
file headers at all and holds the primitives everything else trusts:
`bearerToken`, `secureTokenEqual`, request identity, JSON parsing limits. A
newcomer who misreads one of these introduces a security fault, not a bug.

## 3. Files with no header — 38

Thirty of the thirty-eight are `scripts/measure-*.mjs`, the evaluation
harnesses. They are consistent with each other and low-traffic, so they are
real but cheap debt. The eight that matter:

```
app/components/ProductSignals.jsx      lib/identity.js
app/api/measurements/route.js          lib/brain/measurements.js
lib/security/request.js                lib/ingest/inferTags.js
lib/security/json.js
lib/security/http.js
```

`lib/identity.js` and the three `lib/security/*` files are the ones to fix
first, for the reason given above.

## 4. Documentation that had drifted

`docs/ARCHITECTURE-MAP.md` described "schema v12" while production ran **v48** —
it was written by hand in Phase 0 and never regenerated. It is now marked with
its staleness at the top and superseded by `docs/CODE-MAP.md`, which is
generated by `npm run docs:codemap` and cannot drift the same way.

**The general lesson, and it is the reason for the two new scripts:** a
hand-written map decays silently. Anything that describes the *shape* of the
codebase should be derived from the codebase.

---

## Why this is not all done already

**CI has been down since 24 August on a billing failure**, and it is the only
thing that runs the 72-test Postgres integration suite. Every job since then
fails in 2–6 seconds with zero steps and this annotation:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

The fix is owner-only, at <https://github.com/settings/billing>.

What still works on a laptop: the 1,299-test unit suite (`npm test`) and the
production build (`npm run build`). Those genuinely cover the pure modules —
which is why the split order above runs from `culture.js` (no database, fully
verifiable today) to `lib/db/*` (verifiable only by CI, held).

**Reorganizing the persistence layer while the instrument that checks it is
offline would be the single worst-timed change available.** It is held
deliberately, not forgotten.
