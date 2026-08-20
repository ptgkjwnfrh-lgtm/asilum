# D4 — the first-visit consent moment (spec for approval)

**Ruled by the owner 20 Aug 2026: option (b).** Observation — the Asterisk
system reading dwell, saves, skips, and impressions into a Passport —
starts only after the reader answers a consent moment on first visit.
(Risk campaign §8 D4, annotated RULED; recommendation was (b) for
EU-safety and F65 optics; counsel still confirms per OWNER-DECISIONS #1's
region ruling.)

**Status: SPEC awaiting the owner's approval.** Per the 20 Aug handover:
agent specs it, owner approves, then it ships — and UI ships only in an
owner-directed round. **Interim posture until it ships:** today's
default-on with the Settings toggle + `/terms` disclosure (option (a),
disclosed) stands — acceptable while strangers are not yet invited; this
build lands **before doors open** (now a Gate 6 precondition on the
launch checklist).

---

## Behavior contract

1. **Unanswered = unobserved.** A device with no consent record gets no
   observation writes: no impressions persisted, no interaction-derived
   profile mutation. The feed serves in the existing general-results mode
   (the brain-paused state that already exists) until the moment is
   answered.
2. **Shell-mounted, once.** The moment rides the shell so it covers both
   landing laws (desktop → `/cover`, mobile → CATALOG) and deep links. It
   renders on the first eligible page view and never again after an
   answer.
3. **Two answers, both first-class.**
   - **OBSERVE** → observation on: the existing default machinery,
     unchanged.
   - **GENERAL ONLY** → exactly the existing Settings pause state
     (`asilum-brain-off` parity) — general results, taste record idle.
   Both are reversible any time in Settings, which already carries the
   toggle and honest copy ("paused = general results…").
4. **No trap.** The reader can keep browsing without answering (navigate,
   scroll behind it on re-offer) — but unanswered stays unobserved, so
   ignoring the moment is safe by construction, and it re-offers on the
   next visit until answered.
5. **Server-enforced, not client-polite.** Consent state lives where the
   server can see it (device cookie + `profile._meta.consent = {choice,
   at, version}`). Every observation write path checks it; client-side
   emission gating is a courtesy, not the enforcement. Responses on
   dropped observation say so explicitly (`observed: false`) — no silent
   pretending.
6. **Signed-in continuity.** sb- adoption carries the device's consent
   state; a signed-in user's choice follows their profile.

## Copy (DRAFT — owner voice pass required; copy-law: Asterisk-system
language only, bridge names never public)

> **\*THE ASTERISK SYSTEM**
> This terminal learns by observing — what you linger on, what you save,
> what you skip. It builds a Passport for this device. Nothing is sold to
> anyone. Watch, or browse general?
>
> [ OBSERVE ME ]   [ GENERAL ONLY ]
> <small>change anytime in SETTINGS · how it works → /terms</small>

## Design + a11y notes (for the owner-directed UI round)

- Phosphor-styled interstitial card over the shell; boot sweep completes
  first (the moment must not fight the landing motion).
- Focus-trapped dialog with the two buttons; **no click-away dismissal**
  (a consent moment is answered, not dismissed) — it therefore does NOT
  join the `useOverlayDismiss` five; Esc/blur leaves it unanswered =
  unobserved, which is the safe state.
- Screen-reader order: title → body → buttons; the AT ghost-click guard
  lesson (trap 21) applies to whatever control opens Settings from it.

## Known traps to design around (from the handovers)

- The feed's observation writes fire on view — the server-side consent
  check must sit in the write path itself, not in page code.
- Shell loses a Suspense-commit race on hard loads (19 Aug trap) — the
  consent flag must resolve before observation batching starts, not
  before paint.
- Script-opened tabs inherit `sessionStorage`; consent must live in the
  device cookie/profile, never sessionStorage.
- `innerWidth = 0` in unlaid-out tabs — nothing about consent may depend
  on layout.

## Build checklist (post-approval, owner-directed UI round)

- [ ] Server: consent gate in every observation write path (impressions,
      interaction-derived mutation), mem + pg parity.
- [ ] Client: the moment component (shell), emission gating, Settings
      continuity both directions.
- [ ] Tests: no-consent device → zero observation rows; OBSERVE → rows
      resume; GENERAL ONLY ≡ existing pause; copy-law test extended to
      the new copy; a11y pass.
- [ ] `/terms` sentence naming the consent moment (same Gate 3 owner UI
      round that publishes the refund policy).
- [ ] ⚖ Counsel confirm per launch regions (OWNER-DECISIONS #1).
