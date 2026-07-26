---
name: asilum-architecture
description: Load before any structural, backend, API, or dependency work on ASILUM — stack boundaries, module ownership, build gates, and where the facts live.
---

# ASILUM architecture rules

FACTS live in knowledge/architecture/ — read the relevant file first.
This skill is the procedure around them.

## Stack (approved; changes need owner approval)
Next.js (App Router) + React 18, plain JS (no TS migration), Supabase
Postgres with full in-memory fallback, no new runtime dependencies
without explicit owner sign-off. This machine has NO system Node — use
`~/.local/node-v20.18.1-darwin-arm64/bin` on PATH for every npm/node call.

## Hard boundaries
- Client-safe modules (lib/client.js, lib/social.js, lib/memory.js,
  lib/vision/palette.js) must NEVER import lib/brain/index.js or lib/db —
  that drags the catalog/pg into the client bundle.
- All persistence goes through lib/db; all product ingestion through
  lib/ingest/normalize.js (THE normalizer — never fabricate missing
  fields; absent is absent).
- /api/interaction actions are exactly: bag|share|save|favorite|dwell|
  skip|hide. Events persist BEFORE derived mutations and fail loud.
- Identity: server-issued device cookie → optional sb- adoption via
  verified bearer. Never trust a client-claimed uid.
- Honesty seams (knowledge/architecture/ai.md): real / gated / never.
  Unkeyed integrations return honest 503/coming-soon.

## Gates
`npm run build` must pass before any feature is declared done. Never
commit to main; branch per change-set; PR for Codex review, never
auto-merge. Report format per CONSTITUTION.md.
