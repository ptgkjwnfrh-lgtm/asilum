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

## The numbers

| Measure | At the start | Now |
| --- | ---: | ---: |
| Source files | 307 | 317 |
| Files over 1,200 lines | 5 | **4** (3 of them `lib/db`) |
| Files with no header | 38 (87.6%) | **0 — 100% documented** |
| Exported functions | 877 | 880 |
| …with no label | 417 (52.5%) | **116 (86.8% labelled)** |

**The 116 unlabelled are exactly `lib/db`.** Everything outside the held layer
is done.

### Two of the original numbers were my own measurement error

Worth recording, because it changed what got worked on:

- The audit looked only at the first three non-empty lines, so every
  `"use client"` component scored as headerless — **76% reported, 87.5% real**.
- Fixed that, and it then failed to skip a `#!` shebang, so all 30
  `measure-*` harnesses scored as headerless — every one of which opens with a
  thorough header on the next line. **89.6% reported, 99.3% real.**

An audit that **over**-reports is not the safe direction to err in: it sends
someone to fix files that need nothing, and the noise buries the real gaps.
Both detector bugs are fixed in `scripts/audit-navigability.mjs`.


## 1. Oversized files

A file a newcomer cannot hold in their head is the single biggest tax on a
handover. Five files are over 1,200 lines.

| File | Lines | What it holds | Status |
| --- | ---: | --- | --- |
| `lib/db/production.js` | 4,461 | CRUD for ~20 production tables | 🔒 **HELD** — Postgres suite only |
| `lib/db/dm.js` | 1,747 | The mail desk's whole store | 🔒 **HELD** — Postgres suite only |
| `lib/search/index.js` | 1,735 | `searchProducts` is 1,283 of these lines | ⚠️ **partially split** |
| `lib/db/index.js` | 1,724 | Persistence layer + in-memory fallback | 🔒 **HELD** — Postgres suite only |
| ~~`lib/asterisk/culture.js`~~ | 1,826 → **141** | Curated cultural knowledge | ✅ **done** |

### ✅ `lib/asterisk/culture.js` — done, 1,826 → 141

Split into `lib/asterisk/culture/`. **Not by kind**, which was the obvious move
and would have been wrong: order is behaviour (`cultureIndex()` lets a later
record's name overwrite an earlier one's) and the sections interleave, so
grouping by kind would have reordered 607 records and silently changed which
reading some queries resolve to. The parts are contiguous slices named for the
expansion that added them.

Verified by serialising `CULTURE`, the full index key list and the suggestion
view before and after — all three byte-identical.
`tests/culture-catalog-assembly.test.js` pins the order so the next re-split
fails loudly; confirmed non-tautological by swapping two parts and watching it
go red.

### ⚠️ `lib/search/index.js` — partially split, 1,870 → 1,735

Three modules lifted out: `search/tokens.js` (how a query becomes words),
`search/vocabulary.js` (grammar words, garment nouns, and the null-prototype
tables), `search/intent.js` (what kind of question this is). `index.js`
re-exports all of it, so no caller changed.

**It is still oversized and cannot stop being oversized without decomposing
`searchProducts`, which is 1,283 lines on its own.** That is a real
behavioural change to the most complex function in the codebase, and it waits
for CI for the same reason `lib/db` does.

**A near-miss worth knowing about.** `npm run search:snapshot` serialises the
engine's answers for a query corpus so a refactor can be proved inert. During
this split it reported **IDENTICAL while the code was broken** — moving the
intent layer left `brandMatch` unimported inside `searchProducts`, a
ReferenceError on a live path that none of the 28 queries happened to reach.
Five tests in the suite caught it instantly. A corpus proves the paths it
walks and says nothing about the rest: it is a supplement to `npm test`, never
a substitute.

### 🔒 `lib/db/*` — held for CI

7,932 lines across three files, every one verified by the 72-test Postgres
integration suite, which cannot run locally (no Postgres, no Docker, no
Homebrew on this machine). Splitting them blind is the change most likely to
introduce a silent fault in the layer where a silent fault costs the most.

The seams are obvious and already implied by the table groups — `products`,
`tags`, `tickets`, `identity`, `measurements`, `brands`. This is a mechanical
job the day the suite can run, and the same before/after identity discipline
should be applied to it.


## 2. Unlabelled exported functions — 116, all of them `lib/db`

Started at 417 across the whole tree. Everything outside the held database
layer is now labelled, and what a label says is the DISTINCTION a reader
cannot recover from a signature — why the obvious simplification is wrong, what
a null return means, which of two near-identical functions to reach for.

| Area | Unlabelled | Note |
| --- | ---: | --- |
| `lib/db` | **116** | 🔒 Held. Best done *during* the split rather than twice |
| everything else | **0** | ✅ |

**When the `lib/db` split happens, label as you go.** Those functions are the
CRUD sitting inside the three oversized files; labelling them first and
splitting later would mean touching every one of them twice.

## 3. Files with no header — 0

Was 38 (really 8 — see the measurement-error note above). All written.

The two that genuinely had none and mattered:

- **`lib/ingest/inferTags.js`** — the single text-to-taste bridge every
  ingestion path shares. The header now says what breaks if somebody inlines
  it "just for one adapter": two sources start disagreeing about what the same
  garment is, and both answers look reasonable in isolation.
- **`app/api/measurements/route.js`** — first-party-only body measurements.
  The header states the rule the route exists to keep: they never reach a
  merchant, a model, or a URL.


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

What still works on a laptop: the **1,303-test unit suite** (`npm test`) and
the production build (`npm run build`). Those genuinely cover the pure
modules — which is why the work ran from `culture.js` (no database, fully
verifiable today) to `lib/db/*` (verifiable only by CI, held).

**Reorganizing the persistence layer while the instrument that checks it is
offline would be the single worst-timed change available.** It is held
deliberately, not forgotten.

### What "held" costs, so the trade is visible

`lib/db` is 7,932 lines across three files and 116 unlabelled functions — the
largest single block of remaining debt, and the one a new CTO will feel most.
Holding it is a judgement, not a rule, and it rests on one fact: the only
thing that can tell whether a `lib/db` refactor broke something is the
Postgres suite, and it cannot run here.

The search split is the evidence for that caution rather than an argument
against it. A green unit suite and a 35-query identity corpus both said the
extraction was inert; it had a `ReferenceError` on a live path, and only the
suite caught it. In `lib/search` the suite is deep enough to catch that. In
`lib/db` the equivalent depth is exactly what is offline.

**The day CI runs, this is a mechanical afternoon** — the seams are listed
above, and `npm run search:snapshot` is the pattern for proving it inert.
