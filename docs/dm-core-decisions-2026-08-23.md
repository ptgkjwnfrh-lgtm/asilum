# DM core — what was cut, and why

The design pass (13 agents) produced a 14-table design; the red team returned
**9 blockers and 23 serious findings** against it. This file records what the
core actually builds and what was deliberately removed, because the reasoning
is the valuable part and a later reader will otherwise re-add the cut pieces.

## The three shapes that produced most of the blockers

**1. A pinned copy of a fact that lives elsewhere.** `dm_settings.account_kind`
was a denormalized copy of `account_kinds.kind`. Four blockers came from it:
the reach FK evaluated the PIN rather than the account's real kind, a
passport→business conversion could not be written at all, and a stale pin
disarmed "a business cannot switch DMs off" on the write side. **Cut. The
trigger joins `account_kinds` live.** A copy of a fact is a second fact.

**2. Denormalized counters.** `dm_inbox_counters.unread_conversations`,
`dm_participants.unread_count` and `message_count` each need an invariant
nobody can violate, and the red team found drift in both directions plus a
CHECK that aborted a user's send when it fired. **Cut. Unread is DERIVED** from
`dm_messages` against `last_read_message_id`, on an index built for it. At this
scale the read cost is nothing and the drift class disappears entirely.

**3. Media.** Consent laundering across media classes, no revocation backstop,
validation only at window birth, a membership check missing from the media
route, and an all-or-nothing promise split across two transactions — five
blockers, all in a pipeline that OWNER-DECISIONS #3 keeps switched off.
**Cut from the core.** The consent STATE ships (both sides, per conversation,
revocable, with the revocation timestamp); the pipeline that could leak through
it does not exist yet, so there is nothing to leak. Enforcement lands in the
same transaction as the pipeline, which is the only place it can be correct.

## What the core builds

- `dm_conversations` — the pair, `CHECK (lo < hi)` + `UNIQUE (lo, hi)`, so a
  self-DM and a duplicate thread are unrepresentable rather than prevented.
- `dm_participants` — two rows, the per-side state: folder (inbox/requests/
  archived), `last_read_message_id`, and the media-consent pair.
- `dm_messages` — append-only text.
- `dm_blocks` — **per-account** (owner ruling, 23 Aug). Not per-conversation,
  so it survives a new thread and every reply path by construction.
- `dm_settings` — `dms_open` only. No pinned kind.

## The laws, and where each is enforced

Every one is a database trigger, not an application check, because the route is
not the only writer — the admin desk, a migration and a future job are writers
too, and a law that lives in one caller is a convention.

1. **A block stops delivery, in either direction.** Per-account.
2. **A passport with `dms_open = false` receives nothing.** The trigger reads
   `account_kinds` LIVE; a business's row is refused by the same trigger, so
   "a business cannot switch DMs off" is enforced rather than asserted.
3. **One knock.** An unaccepted conversation takes exactly one message from the
   initiator, counted in the trigger rather than trusted from a column.

## Deliberately NOT in the core, with the reason

- **Media** — see above. OWNER-DECISIONS #3.
- **Moderation, reports, legal holds** — the red team showed `op:"report"` is a
  weapon when it both freezes a thread and authorises moderator read access,
  and there are no named moderator credentials to attribute an action to
  (one shared `ADMIN_TOKEN`). Reporting without staffing is a button that
  promises a response nobody is on the other end of.
- **`dm_events`** — an append-only record of every send, refusal and consent
  flip, keyed to a person, with no purge grant. That is a surveillance ledger
  the privacy contract would have to answer for.
- **Ambiguous refusals** — collapsing every negative outcome to "not
  reachable" hides a person's OWN block from them. The core tells you when the
  refusal is yours.
