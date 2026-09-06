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
| Source files | 307 | 364 |
| Files over 1,200 lines | 5 | **1** (`lib/search/index.js`) |
| Files with no header | 38 (87.6%) | **0 — 100% documented** |
| Exported functions | 877 | 932 |
| …with no label | 417 (52.5%) | **127 (86.4% labelled)** |

**The file count went UP and that is the point.** 307 → 364 is three doors and
thirty modules where there used to be three files nobody could hold in their
head. Total lines are roughly flat; what changed is how much of it you have to
read to change one thing.

**125 of the 127 unlabelled are `lib/db`**, and the number went up rather than
down through the split — see §2.

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
| `lib/search/index.js` | 1,742 | `searchProducts` is 1,283 of these lines | ⚠️ **partially split — the only one left** |
| ~~`lib/db/production.js`~~ | 4,502 → **55** | CRUD for ~20 production tables | ✅ **done** (#427) |
| ~~`lib/db/dm.js`~~ | 1,746 → **100** | The mail desk's whole store | ✅ **done** (#430) |
| ~~`lib/db/index.js`~~ | 1,724 → **121** | Persistence layer + in-memory fallback | ✅ **done** (#429) |
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

### ✅ `lib/db/*` — done, 7,932 lines across three files → three doors and thirty modules

It was held while CI was down on the billing failure, because the only thing
that could tell whether a `lib/db` refactor broke something was the Postgres
suite. CI came back; this was the first thing done with it, one extraction at
a time, the suite run after each.

| Was | Now | Modules |
| --- | --- | --- |
| `production.js` 4,502 | **55** | `lib/db/production/` — store, catalog, tickets, editorial, ai, moderation, corrections, interpretation, booths, privacy |
| `index.js` 1,724 | **121** | `lib/db/core/` — pool, store, items, embeddings, profiles, interactions, events, graph, popularity, boards, stats |
| `dm.js` 1,746 | **100** | `lib/db/dm/` — core, threads, consent, export, people, settings, activity, reactions, mute |

Each door re-exports its modules by NAME rather than `export *`, so the barrel
is the public API and a helper borrowed between siblings cannot become public
by accident. The surfaces were pinned before the first cut and diffed after
every one: **126 / 51 / 46 exports, LOST none / gained none**.

#### It predicted "a mechanical afternoon". It was not one.

Worth reading before the next split, because none of these are caught by tests
or by the export pin — the two things a split is normally verified with:

1. **A dynamic `import("./dm.js")` inside a try/catch.** Right in `lib/db/`,
   wrong one directory down. The build called it *"1 warning"* and scrolled on;
   the suite stayed green. In production a person exercising their §6 access
   right would have been told their mail desk was `"unreadable"`.
   → `tests/db-module-graph.test.js` resolves every relative specifier under
   `lib/db`, static and dynamic, and asserts how many it checked.
2. **A comment block left behind.** The cut that made `core/store.js` took two
   of `withUserOperationLock`'s three header lines and left the third heading
   an unrelated import. The code is correct and the file lies.
   → `scripts/comment-attachment.mjs`.
3. **A function with module-level state does not move alone.**
   `hasDecayColumns` took its comment and left `let decayColumns = null;`
   behind. Caught by (2), as an orphaned header.
4. **`export *` publishes a name without binding it.** Code still in the old
   file that CALLS a re-exported name needs an `import` too — green build, 36
   red tests. It also silently widened the surface once (`engKey`), which is
   why the barrels are explicit now.
5. **Query-string module isolation broke.** The Postgres suite gave each test a
   private pool by importing `lib/db/index.js?tag`, which worked only while the
   pool state lived in the file being suffixed. Ten tests died on *"Cannot use
   a pool after calling end on the pool"*. Fixed at the source rather than by
   restoring the trick: `getPool()` now rebuilds an ended pool instead of
   handing back a dead handle forever — which also retired an ordering rule the
   test file carried in a comment and CI had already caught someone breaking.
6. **Source-text tests named a path by hand.** Three of them read a function's
   own SQL or DELETE statements out of the file. They went red loudly, which is
   right — but a test needing hand-repair on every move eventually gets
   repaired by deletion. They search now, require exactly one match, and assert
   a floor on what they read so a glob matching nothing cannot pass vacuously.

**Two bugs in the tooling written to find the above**, both of which made a
detector report "clean" on broken code: stripping string literals BEFORE
comments (an apostrophe in prose opens a literal that closes pages later and
swallows every identifier between — it reported *nothing unbound* for a module
with no `import` statement at all), and reading the spread operator's dots as
property access, so `{ ...FOO }` counted as never using `FOO`.


## 2. Unlabelled exported functions — 127, of which 125 are `lib/db`

Started at 417 across the whole tree. What a label says is the DISTINCTION a
reader cannot recover from a signature — why the obvious simplification is
wrong, what a null return means, which of two near-identical functions to
reach for.

| Area | Unlabelled | Note |
| --- | ---: | --- |
| `lib/db` | **125** | open |
| everything else | **2** | one in `lib/search`, one in `lib/steward` |

**This entry used to say "when the split happens, label as you go", and that
did not happen.** The count went from 116 to 125 across the three splits,
because the new modules' functions carry file headers but not per-function
labels. Recorded as a miss rather than quietly restated.

What DID land is thirty module headers, each stating the thing a signature
cannot: why the in-memory path mirrors Postgres exactly rather than
approximating it, why `eng`/`imp` and `engagers`/`viewers` are different
numbers and only the second pair may be scored, why an open emoji field is a
covert text channel, why the mail desk is the one thing both exported AND
retained.

**The remaining 125 should be labelled selectively, not in bulk.** A large
share are plain CRUD where the signature already is the answer, and a filler
label on those is worse than none — it teaches a reader that the labels are
noise, and then they stop reading the ones that matter.

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


## 4. Pagination — correct today, breaks on ingestion

**Measured 27 August 2026.** Recorded here because it is a known limitation of
shipped code, not only future work. Full detail and the ordering:
`ROADMAP-WHEN-BILLING-RETURNS.md` §4.5c–d.

| Issue | Present today? | Fixed by cursors? |
| --- | --- | --- |
| `offset` pagination in search and discover drifts once the pool changes | latent — the catalog is static | **yes** |
| `SEEN_CAP = 200` confines a reader to ~⅓ of the catalog, permanently | **yes, and worse than filed** | no |
| ~~Feed rotation mutates `_meta.seen` unguarded across tabs~~ | **no — the entry was wrong** | — |

The first is a **precondition of the Japanese ingestion work** and should be
done before it runs at volume.

**The second was understated and is now measured** (6 September,
`node scripts/measure-feed-rotation.mjs`, pinned by
`tests/feed-rotation.test.js`). It was filed as "a heavy scroller loops". A
reader is in fact never shown two thirds of the catalog — 285 distinct items of
915 over 40 pages, 279–293 across four seeds — while the same reader with an
unbounded rotation memory reaches all 915. The engine will serve the whole
catalog if it can remember what it served; the 200-item memory is the binding
constraint. `ROADMAP-WHEN-BILLING-RETURNS.md` §4.5d has the numbers and the
mechanism.

**The third was wrong when it was written.** The feed route's only profile
write goes through `mutateProfile`, which has held a `pg_advisory_xact_lock`
and a `SELECT … FOR UPDATE` since 14 July, and re-reads inside the transaction;
there are no `saveProfile` callers outside `lib/db/`. A lost update is not
possible. What is possible is that two simultaneous requests both READ the
memory before either writes and serve overlapping items — a much smaller thing,
and fixing it means holding the lock across a whole feed build.

Two entries, both written from reading the code rather than running it, one too
mild and one simply untrue. That is the argument for the harness, not against
the register.

Only `lib/dm.js` uses keyset cursors today, and it is the model to copy —
including the `snapshot` component, which is the part that stops rows becoming
active mid-scroll from jumping above the cursor.

## 5. Documentation that had drifted

`docs/ARCHITECTURE-MAP.md` described "schema v12" while production ran **v48** —
it was written by hand in Phase 0 and never regenerated. It is now marked with
its staleness at the top and superseded by `docs/CODE-MAP.md`, which is
generated by `npm run docs:codemap` and cannot drift the same way.

**The general lesson, and it is the reason for the two new scripts:** a
hand-written map decays silently. Anything that describes the *shape* of the
codebase should be derived from the codebase.

---

## Why this was not all done sooner — and what the delay was worth

**CI was down from 24 August on a billing failure**, and it is the only thing
that runs the Postgres integration suite. Every job failed in 2–6 seconds with
zero steps and this annotation:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

The owner fixed it. `lib/db` was the first thing done with it.

The hold was the right call and the split proved it. The entry above used to
predict *"a mechanical afternoon"*; six distinct classes of fault came out of
it, and each was found by a different instrument:

| Fault | Found by | Would the unit suite have caught it? |
| --- | --- | --- |
| dynamic import one directory wrong | `npm run build`, as a **warning** | no |
| comment block left behind | `scripts/comment-attachment.mjs` | no |
| module state left behind | the same script, as an orphaned header | no |
| `export *` binds nothing locally | `npm test` | yes — 36 red |
| shared pool killed by one `.end()` | **the Postgres suite in CI** | no |
| source-text tests naming a path | `npm test` | yes |

**Only one of the six needed CI, and nothing else could have found it.** A
green unit suite and a clean build both called that work inert.

The evidence had already been there in `lib/search`: a green unit suite and a
35-query identity corpus both called that extraction inert, and it carried a
`ReferenceError` on a live path. In `lib/search` the suite is deep enough to
catch that. In `lib/db` the equivalent depth was exactly what had been offline.

### What is left

| Item | Size | Blocked on |
| --- | --- | --- |
| `lib/search/index.js` | 1,742 lines, `searchProducts` is 1,283 | nothing — it is a real behavioural change to the most complex function in the codebase, and wants its own careful pass |
| 125 unlabelled `lib/db` exports | — | nothing; do it selectively (§2) |
| cursor pagination | — | nothing; it is a **precondition** of Japanese ingestion at volume (§4) |

None of these are held any more. What remains is work, not waiting.
