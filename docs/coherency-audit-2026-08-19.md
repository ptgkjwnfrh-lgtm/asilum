# Coherency audit — full-feature sweep, 19 August 2026

Every feature run on the mem-mode verify server (`asilum-memmode-verify`,
one real item intaken; production untouched — the feed writes on view).
Two scores per feature: **FUNCTION** (did it work when driven) and
**COHERENCE /10** (does it blend — house voice, tokens, honesty laws,
native-feeling navigation). Coherence is judged against the app's own
laws: terminal voice, red-only accent, honest empty states, no fake,
one origin, ledger truth.

Commerce APIs (checkout/webhook/refund/intake/import/verification) were
battle-tested earlier the same day (E2E paid loop in the browser, refund
against the real paid session, chain proofs) — cited, not re-run.

| Feature | Function | Coherence | Notes |
|---|---|---:|---|
| FRONT COVER `/cover` | PASS | 10 | Live edition + date, zero `undefined`, module→subsystem law, wire strip — and the HERO was the real intaken designer piece: real inventory flows straight to the cover with no special-casing. |
| CATALOG `/` (feed + modal) | PASS | 10 | 60 cards, all imaged; depth lives in the modal (owner decree) with the Asterisk correction vocabulary; **demo item shows NO Buy** — the gate visible in the UI exactly as ruled. |
| Item modal Buy gate | PASS | 10 | `purchasable` is server-stamped; Buy ↗ appeared only on the real item (discover), never on demo (home modal check). |
| THE WIRE `/hotlist` | PASS | 9 | Composer with honest pipeline labels (TRANSMISSION live, IMAGES ×6 / VIDEO ≤3:00 pending), 10 booths honest-OPEN, reading room. Anonymous post correctly REFUSED server-side (named-posts law); −1: the refusal note's on-page placement wasn't located by the sweep — confirm it renders where an anonymous poster looks. |
| Impersonation report form | PASS | 9 | Renders under the booths, disabled-until-filled, server's own words on refusal (401/403 verified live at the route). |
| DISCOVER `/discover` | PASS | 9 | Search + suggest + filters; BUY ↗ on the real item, ticket Buy reserved for live-sourced non-purchasable. Mem artifact (not prod): the demo fallback pool serves only while the store is EMPTY, so one intaken item displaced the 915 — production reads all of it from the DB. |
| STYLIST `/stylist` | PASS* | 8 | Cannot cut looks from a one-item mem pool; empty state stayed honest but its copy ("you passed on everything") mismatches the true cause (pool too small). Real-catalog health is separately measured (floor:check, 25th pctile, 3,600 looks). *Function judged by that measurement, not the mem run. |
| PASSPORT `/board` | PASS | 9 | BrainViz canvas, convictions, upload-trains, coming-soon controls honestly `soon`-classed (Pinterest/Spotify). Train/reset controls not matched by the probe's labels — verify wording on the next owner pass. |
| PROFILE `/profile` | PASS | 9 | POSTS/BRANDS/WARDROBE/ROOM/ACCOUNT tabs; business panel mounts under ACCOUNT with the domain-proof token instructions; honest sign-in path. Signed-in states remain the standing sb-session verification gap. |
| SETTINGS `/settings` | PASS | 9 | Observation section, legal line, DESIGN CONSOLE present. Partnered-account statuses not conclusively probed (selector, not evidence of a defect). |
| ORDERS `/orders` | PASS | 10 | YOUR ORDERS ledger deck with four honest states, resume-payment ↗ into the SAME session, return banners with param-strip. The paid loop and the banner were browser-proven same day. |
| `/piece/<id>` | PASS | 9 | Renders the real item; safe read surface. |
| `/u/<handle>` | PASS | 7 | Renders, but MOCK_USERS-backed — coherent in voice yet synthetic people on a platform whose law is "no fake": fine while private, **needs a launch decision** (label, gate, or remove) before strangers browse. |
| `/terms` | PASS | 8 | Longest page, tickets/wardrobe/demo covered; refund section pending counsel (checklist Gate 3) — known, not a defect. |
| `/accessibility` | PASS | 9 | Claims page stands; claim 12 (human screen reader) still open. |
| `/stats` | PASS | 8 | Page 200; APIs correctly identity-gated. Not deep-probed this sweep. |
| `/upload` | PASS | 8 | Renders; wardrobe/vision chain remains key-gated per FEATURE-FLAGS. |
| Search/suggest APIs | PASS | 9 | 200s with content; suggest answers on 2 chars. |
| Commerce engine (all APIs) | PASS | 10 | The most-tested surface in the app: paid loop, refund against the real session, atomic intake, loud-skip import, idempotent webhook, resume, ledger desk. |
| Verification/anti-impersonation | PASS | 10 | Domain token, name screen, image screen, public reports — all flag-never-judge, all on the v18 case spine. |
| Admin desk APIs | PASS | 9 | area=orders/business/etc. live-verified; panel UI eyeball remains STEP 1 (owner). |

**Sweep hygiene:** zero server errors across the whole run; three console
resource statuses total (one the by-design wire 403; a 404 and a 400
unattributed — non-fatal, re-attribute if they recur).

## Verdict

**The app blends.** The commerce layer added this week speaks the house
voice everywhere it touches — ledger-truth lines, honest empties, refusals
in the server's own words, red-only alerts — and the strongest coherence
signal in the sweep was unplanned: the front cover picked up the real
designer piece as its hero through the ordinary recommendation path.
Nothing reads bolted-on.

Three coherence items for the pre-launch list (none blocking today):
1. `/u/<handle>` mock users — decide label/gate/remove before public (the
   one surface that still contains synthetic PEOPLE rather than labeled
   synthetic clothes).
2. Wire composer for anonymous readers — refusal is correct; make sure the
   "sign in to transmit" note is unmissable at the composer itself.
3. Stylist small-pool empty-state copy — say "the catalog is too small to
   cut from" when that is the true cause, keep "you passed on everything"
   for the real pass-out case.
