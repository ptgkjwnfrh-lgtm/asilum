# ASILUM launch checklist — 19 August 2026

One list, gate-ordered: a gate opens when everything above it is done.
Sources of truth it consolidates: HANDOVER-2026-08-18 (owner queue),
designer-program/ONBOARDING.md §0, SETUP-KEYS.md §5, risk-campaign §7/§8.
**Owner** = only you can do it. **Agent** = say the word and it runs.

## GATE 0 — today, no dependencies (~20 minutes total)

- [ ] **Owner** Supabase Site URL → `https://www.asilummagazine.com`
      (Authentication → URL Configuration → Save). Closes ruling 7.
- [ ] **Owner** Roll the sandbox Stripe test key (Developers → API keys) —
      the screenshot burn; then click-to-copy the new one → `.env.local`.
- [ ] **Owner** Log into Vercel → project `asilum-vq9p` → Settings →
      Domains. Nothing attached? Disconnect it — halves build spend.
- [ ] **Owner** `/admin` STEP 1 — eyeball the panels (row counts: 16 Aug
      handover; panel 07 = 2 rows is correct).
- [ ] **Owner** Claim 12 — five minutes of VoiceOver on /cover, /discover,
      the item modal. The last soft accessibility claim.
- [ ] **Owner** gh token `workflow` scope, or hand-commit
      `docs/deploy-drift-workflow.yml.txt` → `.github/workflows/`.
- [ ] **Owner ruling** The $5 booth fee: affirm or stays dead (materials
      currently say "no fees").
- [ ] **Owner ruling** D4 — observation default (recommendation: first-visit
      consent moment). Sets the privacy posture BEFORE strangers arrive.

## GATE 1 — Supabase, hard deadline **5 Sep**

- [ ] **Owner** Pro upgrade decision. It carries two things at once: the
      quota restriction lifts AND the leaked-password toggle (Pro-gated)
      becomes flippable. Decide before the 5th, not after.
- [ ] **Owner** After upgrade: flip "Prevent use of leaked passwords"
      (Auth → Sign In / Providers → Email). Closes the last advisor WARN.
- [ ] **Owner** Custom-SMTP ceiling check: 30 mails/hour stands until the
      plan changes — fine for founding scale, known before launch spikes.

## GATE 2 — the LLC arrives (~25 Aug)

- [ ] **Owner** Stripe "Verify your business" (live keys exist only after).
- [ ] **Owner** LIVE `STRIPE_SECRET_KEY` → Vercel env (clipboard ritual —
      never through a transcript, no screenshots while revealed).
- [ ] **Owner** Dashboard → Webhooks → endpoint
      `https://www.asilummagazine.com/api/stripe/webhook`
      (`checkout.session.completed`, `checkout.session.expired`) →
      its `whsec_` → Vercel as `STRIPE_WEBHOOK_SECRET`.
- [ ] **Owner** New SendGrid key (Mail Send ONLY) + `ORDER_NOTIFY_EMAIL`
      → Vercel. Until then paid orders settle silently (ledger holds).
- [x] Schema current on prod (v33, probed) — **done 18 Aug**.
- [ ] **Agent** After keys land: smoke the live webhook with one $1 real
      order (part of Gate 5's drill).

## GATE 3 — paper

- [ ] **Owner** Counsel pass on `designer-program/AGREEMENT-DRAFT.md` +
      `legal-drafts/refund-policy-draft-2026-08-18.md` — ONE
      merchant-of-record answer across both.
- [ ] **Owner + Agent** Refund policy onto `/terms` (owner directs the UI
      round; the draft is written).
- [ ] **Owner** Voice pass on `designer-program/OFFER.md` and
      `OUTREACH-LETTER.md` (terms are binding; the words are yours).

## GATE 4 — designers (the real work)

- [ ] **Owner** First five outreach sends — [PERSONAL LINE] each, one at a
      time, log who/when. (Letter parked at OUTREACH-LETTER.md.)
- [ ] **Owner + Agent** Per yes: ONBOARDING.md §§1–4 (apply → domain token →
      approve with evidence → link source → import/intake). Same-day live.
- [ ] **Owner** Standing weekly availability duty until source sync exists
      (re-running the Shopify import IS the interim sync).

## GATE 5 — the first-order drill (before any stranger pays)

- [ ] **Owner** Buy one real low-value piece END TO END in live mode:
      pay → notify email arrives → `admin ?area=orders` shows the trail →
      designer ships with tracking → delivered.
- [ ] **Owner + Agent** Refund drill on that same order (`order.refund`) —
      money back, ledger `refunded`, statement drafted. Ten minutes of
      rehearsal before real customers exist.

## GATE 6 — doors open

- [ ] **Owner** Announce (however small — founding is the story).
- [ ] **Agent** Watch `?area=orders` + deploy/floor/trigger checks;
      C1–C4 dashboards ship once real data exists (defined in the metric
      register, `—` until measured).
- [ ] **Owner** The Sep 5 / Oct 14 (SendGrid trial → 100/day) deadlines
      stay on the calendar regardless of launch date.

**Standing laws that outlive every gate:** no fake integrations; demo stays
labeled until it isn't demo; no machine path to verified; flag-never-judge;
the ledger is the authority; UI changes only in owner-directed rounds.
