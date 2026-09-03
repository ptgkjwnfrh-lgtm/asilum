# HANDOVER — start here

**This file is the permanent front door.** It is not dated and it is not
superseded. Everything else in `docs/` is either a reference or a historical
record, and this page says which is which.

If you are the incoming CTO and you read only one page, read this one, then
`docs/CODE-MAP.md`.

---

## 0. THE LAW (owner directive, 27 August 2026)

**This supersedes `CONSTITUTION.md` where they disagree.** Two rules govern all
development:

1. **ASTERISK does not guess.** Every reading must trace to the ASILUM archive,
   a cited internet source, or archivalist training. Confidence is earned from
   evidence, never asserted. A reading with no traceable basis is not shipped.
2. **ASTERISK is an operating system, not a chatbot.** There is no
   conversational surface, ever. It reads, routes, ranks, remembers and
   discloses through the OS surfaces — never through a chat box.

3. **Invisible machinery.** A complex system does its work without being asked
   and never names its mechanism — no control, no jargon, no empty state. When
   it is unsure it goes silent rather than hedging. Full law and the four
   design questions: `docs/INVISIBLE-MACHINERY.md`.

**The objective (27 August 2026):** monopolize the digital clothing resale
space. `docs/WHAT-ACTUALLY-BLOCKS-THE-GOAL.md` is the audit of what stands in
the way — and the finding is that it is not the rules above. Those three laws
are the moat; the blockers are four live bugs, dead CI, and having no real
inventory.

`docs/ROADMAP-WHEN-BILLING-RETURNS.md` is the current plan of work and expands
these rules into concrete tasks.

## 1. Read these four, in this order

| # | Document | Why |
| --- | --- | --- |
| 1 | **`docs/CODE-MAP.md`** | Where every file lives and what it is. Generated from the tree, so it cannot drift. |
| 2 | **`CONSTITUTION.md`** | The owner's binding rules. Not advisory — it governs what may be built, what may not, and how changes are made. §10 holds the amendments. |
| 3 | **`docs/DEBT-REGISTER.md`** | What is *not* organized yet, measured, with the plan and the reason. |
| 3.3 | **`docs/AUTHENTICITY-EVIDENCE.md`** | ASILUM authenticates nothing. What it reports instead, and how to extend it. |
| 3.4 | **`docs/INVISIBLE-MACHINERY.md`** | How every complex system is surfaced. Binding. |
| 3.5 | **`docs/ROADMAP-WHEN-BILLING-RETURNS.md`** | What to do the moment CI is back, in order. |
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

*Verified 3 September 2026 against the live database and a green CI run.
Re-verify with §4 rather than trusting this block — that is why it lists them.*

| | |
| --- | --- |
| `main` | `18233c2` (#420) |
| Production | **current** at that merge |
| Schema | **v50** applied — v49 verified present (`product_tags_facet_ck` includes `mood`) |
| CI | **alive.** Billing fixed 3 Sep; the full Postgres suite runs again |
| Open PRs | **none of mine.** All six merged |

### What is open

**The messaging fix is deployed but not confirmed end-to-end.** The four
authentication bugs are fixed and on production, and the database says
unambiguously that they were real — **4,158 profiles and ZERO rows** in
`account_ages`, `account_kinds`, `dm_conversations` and `dm_messages`. Nothing
has ever been recorded by any of them.

Confirming the fix needs a real signed-in account, which is an owner action.
Sixty seconds:

1. Sign in. The mail icon should appear at the right of the destination row.
2. Open it — the inbox should load rather than 401.
3. Then re-run the counts above; a new signup should now write `account_ages`.

**A backfill decision is waiting.** Every one of those 4,158 profiles is
missing its age assertion, because the write never worked. Either re-prompt at
next sign-in or accept the gap — and record which, because it is the 13+ gate
from owner decision #2.

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
