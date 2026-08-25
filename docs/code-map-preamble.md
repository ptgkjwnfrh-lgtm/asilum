# CODE MAP — where everything lives

**Audience: the incoming CTO.** This is the first document to read. It answers
one question — *"I need to change X; which file do I open?"* — and it is
generated from the tree's own file headers rather than written from memory, so
it describes the code that exists rather than the code someone remembers.

Regenerate it with `npm run docs:codemap` after any structural change. A map
that drifts is worse than no map: `docs/ARCHITECTURE-MAP.md` sat claiming
"schema v12" for five weeks while production ran v48, and the first person to
trust it would have been wrong about the entire persistence layer.

---

## The 60-second orientation

ASILUM is a Next.js 14 app (App Router, plain JavaScript — no TypeScript
toolchain) with Postgres via Supabase, and an in-memory fallback so it runs
with no database at all.

Four layers, and almost every change lives in exactly one of them:

| Layer | Directory | What it owns |
| --- | --- | --- |
| **Surface** | `app/` (pages, `app/components/`) | What a person sees. Server components by default; `"use client"` marks the interactive ones. |
| **Request plane** | `app/api/*/route.js` | Every HTTP entry point. Auth, rate limits, and validation happen here — never deeper. |
| **Engine** | `lib/` | All the thinking: ranking, search, tagging, the Asterisk system. Pure modules, unit-testable, no HTTP. |
| **Persistence** | `lib/db/` | The only place SQL is written. Everything above it calls functions, never queries. |

**The rule that keeps this honest:** dependencies point *downward only*.
`lib/` must never import from `app/`. If you find yourself wanting to, the
logic belongs in `lib/` and the route should call it.

### The five things worth understanding before the rest

1. **The six-bridge brain** (`lib/brain/`) ranks the feed: alpha (content
   match), beta (dominant trait), gamma (co-engagement graph), delta
   (popularity), epsilon (exploration), and ad. Start at `lib/brain/index.js`.
2. **ASTERISK** (`lib/asterisk/`) is the reading and memory layer — it is
   deterministic by product law, not an LLM agent. `docs/adr/ADR-007` draws its
   tool boundary.
3. **Identity is two-tier**: an HMAC device cookie (`u-<uuid>`) or a verified
   Supabase session (`sb-<uuid>`). `ADR-002` is binding here and has been
   violated before — read it before touching accounts.
4. **Migrations are append-only and numbered**: `supabase/schema-v<N>-*.sql`,
   applied in order by `scripts/apply-schema.mjs`. Production is at **v48**.
5. **Interactions commit in ONE transaction** — profile, interaction, event,
   edges, and popularity together, or not at all. See `commitInteractionBatch`.

---

## Where to start for a given task

| I want to… | Open |
| --- | --- |
| Change how the feed ranks | `lib/brain/index.js`, then `lib/brain/bridges.js` |
| Change what search understands | `lib/search/index.js`, `lib/search/denseQuery.js` |
| Add or rename a tag facet | `lib/tagging/vocabulary.js` — **the single register**, plus a new migration |
| Change a page's look | `app/<route>/page.js` and `app/globals.css` |
| Add an HTTP endpoint | a new `app/api/<name>/route.js`, calling into `lib/` |
| Touch the database | `lib/db/` **only** — plus a new numbered migration |
| Understand a past decision | `docs/adr/` first, then `docs/OWNER-DECISIONS.md` |
| Know what is deliberately not built | `CONSTITUTION.md` §"Do NOT build yet" |

---

## Reading the tables below

- **Lines** is the file's real length. **⚠️** marks files over 1,200 lines —
  these are the ones a newcomer will struggle with, and they are listed in
  `docs/DEBT-REGISTER.md` with a split plan.
- **What it is** quotes the file's own header comment. Where it says
  *no header*, the file has none — that is a tracked gap, not an omission here.
