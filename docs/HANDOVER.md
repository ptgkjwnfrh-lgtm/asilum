# HANDOVER — start here

**This file is the permanent front door.** It is not dated and it is not
superseded. Everything else in `docs/` is either a reference or a historical
record, and this page says which is which.

If you are the incoming CTO and you read only one page, read this one, then
`docs/CODE-MAP.md`.

---

## 1. Read these four, in this order

| # | Document | Why |
| --- | --- | --- |
| 1 | **`docs/CODE-MAP.md`** | Where every file lives and what it is. Generated from the tree, so it cannot drift. |
| 2 | **`CONSTITUTION.md`** | The owner's binding rules. Not advisory — it governs what may be built, what may not, and how changes are made. §10 holds the amendments. |
| 3 | **`docs/DEBT-REGISTER.md`** | What is *not* organized yet, measured, with the plan and the reason. |
| 4 | **`docs/adr/`** | The seven decisions that constrain everything else. ADR-002 (identity) has been violated before — read it before touching accounts. |

Then, as needed: `docs/OWNER-DECISIONS.md` (rulings the owner has made),
`docs/PRODUCTION.md`, `docs/DEPLOYMENT.md`, `docs/THREAT-MODEL.md`.

## 2. What ASILUM is, in one paragraph

A fashion magazine and discovery terminal: a catalog of pieces, a feed ranked
by a six-bridge personalization engine, a search that reads sentences rather
than keywords, a direct-messaging subsystem, and ASTERISK — a deterministic
reading and memory layer that is **not** an LLM agent. Next.js 14 App Router,
plain JavaScript, Postgres via Supabase with an in-memory fallback so the whole
app runs with no database at all.

## 3. Current state

*Verified 24 August 2026. Re-verify with the commands in §4 rather than
trusting this block — that is the point of listing them.*

| | |
| --- | --- |
| `main` | `ed316d8` (#414) |
| Production | **current at `ed316d8`** — confirmed by `npm run deploy:check` |
| Schema | **v48** in production; ledger continuous v7→v48 |
| Unit suite | **1,299 tests — 1,224 pass, 0 fail, 75 skipped** |
| Build | green |
| Live health | steward: **0 blocker · 0 warn · 3 note · 9 ok** |
| Open PRs | **#415** — one vocabulary for every tag on a piece (schema v49) |

### Two things are genuinely open

**CI is down on a billing failure.** Since ~14:00 UTC on 24 August every job
fails in 2–6 seconds with zero steps. The annotation reads: *"The job was not
started because recent account payments have failed or your spending limit
needs to be increased."* The fix is owner-only at
<https://github.com/settings/billing>. **When a job fails with zero steps, read
the check-run annotation — the logs are empty and tell you nothing.**

**PR #415 cannot be merged until CI runs.** It adds a database CHECK constraint
(v49) restricting `product_tags.tag_type` to a defined vocabulary. It had one
genuine test failure, since fixed, and nothing has been able to re-run the
Postgres suite to confirm. Production data was checked directly and holds only
facets inside the new list, so the migration will apply — but the code path is
unverified. Do not merge on the strength of that.

## 4. Verify all of the above yourself

```bash
npm test                # 1,299 unit tests, no database needed
npm run build           # production build
npm run deploy:check    # is production actually serving main?
npm run audit:nav       # navigability debt, measured
npm run docs:codemap    # regenerate the code map
npm run steward         # 12 read-only checks against the live database
```

`npm run steward` needs `DATABASE_URL` in the environment. **`npm test` does
not load `.env.local` — only Next.js does.** That has hidden whole test arms
before now.

## 5. How work is done here

From `CONSTITUTION.md`, and it is binding:

- **Never commit to `main`.** Branch per change-set, open a PR, merge only with
  checks green. Pull `main` before branching — parallel sessions collide.
- **Smallest reversible change.** No rewrites, no duplicate routes or
  components, no parallel implementations of something that exists.
- **No faking.** No pretend integrations, no simulated data presented as real.
  An unconnected feature says so.
- **Migrations are append-only.** `supabase/schema-v<N>-*.sql`, applied in
  order. Never edit a migration that has run.
- **The UI is governed.** Read `CONSTITUTION.md` §10 before changing a page.

## 6. The dated handovers are history, not instructions

`docs/HANDOVER-2026-*.md` are **session records**, each superseding the last for
*current state*. Do not read them as a to-do list — §3 above is the current
state.

They are still worth keeping for one reason: each records the **traps** found
that day — the specific ways this system misled someone who was paying
attention. Those remain true regardless of date, which is why the chain says
"its traps still bind."

| Record | What that day was |
| --- | --- |
| `HANDOVER-2026-08-08.md` | 17 PRs; backlog empty for the first time |
| `HANDOVER-2026-08-13.md` | 8 PRs — the owner's UI round (top nav, magazine cover, ladder, settings rack) |
| `HANDOVER-2026-08-14.md` | Business accounts land; schema v26 |
| `HANDOVER-2026-08-15.md` | Password reset / custom SMTP working |
| `HANDOVER-2026-08-16.md` | Amended four times; `/admin` unlock opens as owner-only |
| `HANDOVER-2026-08-17.md` | Carries the `/admin` step forward |
| `HANDOVER-2026-08-18.md` | Absorbed the 19 Aug rounds in place |
| `HANDOVER-2026-08-20.md` | Consent moment (D4) ruled and specified |
| `HANDOVER-2026-08-21.md` | Search comprehension rounds; the steward ships |
| `HANDOVER-2026-08-23.md` | The account split, then the whole DM subsystem, then an adversarial review of it |

**The house convention:** never create a second same-day handover — amend the
existing one in place.

## 7. If you change the shape of the codebase

Regenerate the derived documents in the same PR as the change:

```bash
npm run docs:codemap
npm run audit:nav
```

A map that drifts is worse than no map. `docs/ARCHITECTURE-MAP.md` spent five
weeks claiming "schema v12" while production ran v48, and the first person to
trust it would have been wrong about the entire persistence layer. That is why
the code map is generated and this file keeps its status in one block instead
of scattered through the prose.
