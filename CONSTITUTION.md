# *ASILUM Constitution v2 — PROPOSED

> ## ⚠️ SUPERSEDED IN PART — owner directive, 27 August 2026
>
> The owner has set this document aside as the governing rulebook. **Two rules
> now govern all development**, and where anything below disagrees with them,
> they win:
>
> 1. **ASTERISK does not guess.** Every reading must trace to the ASILUM
>    archive, a cited internet source, or archivalist training. Confidence is
>    earned from evidence, never asserted.
> 2. **ASTERISK is an operating system, not a chatbot.** No conversational
>    surface, ever.
>
> **What is kept below, and why.** The product rules here (build order, UI
> policy, the "do not build yet" list) are the owner's to waive and are waived.
> The passages about THIRD-PARTY TERMS — `docs/SOURCE-POLICY.md`, the
> rights register, per-source approval gates — are NOT ASILUM's rules to waive:
> they describe other companies' terms and the law, which do not change because
> our document did. They remain accurate as a description of external risk.
>
> See `docs/ROADMAP-WHEN-BILLING-RETURNS.md` §0.


Binding rules for all work on this app. v2 drafted July 19, 2026 per the
owner's Restructure Handoff; it supersedes v1 (July 7, 2026 — preserved in
git history) **upon owner approval, which is the owner's merge of the PR
that carries this file**. Until that merge, v1 remains in force. Newly
allowed product domains (§4) may not be implemented before that approval.

## 1. Mission

ASILUM becomes the place where fashion is discovered, interpreted,
discussed, styled, and purchased across the internet — one compounding
journey across six prongs, not five disconnected features:

1. **The Market** — a federated, source-labelled fashion marketplace.
2. **The Press** — every verified user can become an editor.
3. **Passport + *ASTERISK** — the user-owned taste map and the travel
   agent that reads it.
4. **The Community** — a fashion social and editorial network.
5. **The Stylist** — owned wardrobe + market + exploration, as an
   Asterisk mode.
6. **Trust, rights, and operations** — the prong the first five cannot
   scale without.

The moat is the lawful combination of catalog, explainable taste graph,
consented first-party signals, creator/editorial graph, relationships,
and provenance history. Raw personal data is never described as a moat.

North-star metric: **Weekly Completed Fashion Journeys** (two connected
high-intent actions across different prongs in seven days). Raw screen
time is never optimized as the mission.

## 2. Unchanged cores (carried from v1, still highest priority)

- **UI is LOCKED.** No redesign, simplification, or genericization of the
  magazine visual identity. Navigation/flow restructures only after an
  approved information-architecture spec with before/after screenshots.
  > **SUPERSEDED by Amendment A1 (July 21, 2026) — see §10.** The owner
  > unlocked the UI. This paragraph is kept for history, not obeyed.
- **No faking.** No pretend partnerships, fake OAuth, simulated data
  presented as real, invented products/sizes/purchases/celebrity
  looks/runway references, or claimed AI capability that does not exist.
  Unconnected features say so honestly and stay behind kill switches.
- **Working rules.** Inspect first; smallest reversible changes; no
  duplicate routes/stores/components (no second wardrobe, no second
  Asterisk memory, no parallel taste store); no rewrites of working
  domains; `npm run build` and the test suite pass before anything ships.
- **Git.** Never work on `main`. Branch → focused PR → adversarial
  self-review → merge only at the owner's explicit word. Every report:
  summary, files changed, build/test status, remaining issues, manual
  tests, review focus. (Amendment A2, §10, sets how the review is done.)
  > Amendment A3 (Aug 6, 2026) adds a verification step before merging a
  > STACKED PR.
- **Secrets.** Env only; never client-side; `service_role` never in
  bundles; DB runtime as least-privilege `asilum_app`.
- **Stability bar.** Every page loads with no runtime errors; no crash on
  missing keys, empty DB, missing images, or incomplete metadata.

## 3. Allowed scope (phase-gated)

Delivery follows the Restructure Handoff §9. A phase's product surface may
be built only when its predecessor's exit gate passed and its own listed
owner/legal gates are met. One phase = multiple reviewed PRs.

- **Phase 0** — stabilization (findings 1–5) + this Constitution. DONE
  pending this PR's approval.
- **Phase 1** — editorial publishing spine (ADR-004). Drafting is open to
  every account; public publishing requires the §7 gates.
- **Phase 2** — unified Today/Editorial feeds (ADR-005), chronological
  mode from launch, no DMs.
- **Phase 3** — Passport v2 provenance/visibility + Asterisk travel-agent
  drawer and typed tools (ADR-006, ADR-007).
- **Phase 4** — community without DMs: follows, reactions, saves,
  reports, blocks, mutes, notifications; comments only if moderation ops
  are ready.
- **Phase 5** — market scale: canonical product/source-listing split,
  dedup, freshness/cursor search, affiliate attribution, verified
  independent-designer onboarding.
- **Phase 6** — Stylist v2 + creator loop.
- **Phase 7** — DMs and further monetization, only after the owner
  decisions and staffing listed in the handoff exist.

## 4. Blocked (regardless of phase, until the named gate)

- **DMs** — blocked until Phase 7 owner approval + the full safety stack
  (requests, block/report, retention, legal holds, staffing). Never claim
  end-to-end encryption without an audited protocol.
- **Direct checkout / merchant of record** — a separately governed
  company decision. Checkout stays external.
- **Spotify-derived profiling** — blocked by Spotify Developer Policy.
  Manual, user-declared music inspiration through curated first-party
  mapping is the only music path. Never labelled "Spotify connected."
- **Scraping; unapproved platform integrations** — Pinterest, Shopify,
  Apple Music, TikTok, affiliates stay behind kill switches with honest
  unavailable states until real approvals exist.
- **Homegrown CAPTCHA / bot-detection** — bot challenge lives at the edge
  layer (THREAT-MODEL §6), never in app code.
- **Ads from sensitive data; buying interpretation confidence** —
  sponsored placement can never alter Asterisk confidence or editorial
  relevance, and sensitive traits are never ad inputs.
- **Sending accused users' private data to brands; permanent IP bans;
  perceptual similarity as proof** — trust-prong rules from the handoff.

## 5. *ASTERISK doctrine

Asterisk is ASILUM's personal fashion editor and travel agent: one
orchestrator over bounded, typed tools (ADR-007) — never one omnipotent
model with database access. Its laws:

- **Boundary law.** Typed, least-privilege application services only. No
  arbitrary SQL, no `service_role`. Model output may draft or rank; it
  cannot publish knowledge, verify brands, ban accounts, or change
  legal/moderation state. Separated confidence (entity resolution /
  interpretation / evidence coverage / inventory representation /
  ranking) is never averaged into one number.
- **Freshness law.** Trend and cultural-currency layers carry
  `lastReviewed` and a review-by clock enforced in CI
  (`check-trend-freshness`); the review cadence is **at most 60 days**.
  Research batches use dated, citable sources; every record that cites a
  current event, show, or trend carries source and freshness data. New
  entities enter only through the reviewed research pipeline
  (staged fact lifecycle, ≥1 source URL, human sign-off) — never
  directly from model output.
- **Search-accuracy law.** `eval/universal-queries.json` is the accuracy
  benchmark. No search/interpretation PR may regress it; PRs that add
  interpretive capability must extend it with cases that would have
  failed before. Every interpretation states its method and confidence;
  unknown queries fall through honestly to the research queue — a
  fabricated reading is a constitution violation, not a UX improvement.
- **Tagging law.** The typed dense-tag system derives from real item
  fields only. Coverage target: ≥20 typed tags per item **where the
  fields support it** — sparse items stay honestly sparse, never padded.
  The base tag layer is read-only to models; `product_ai_tags` is
  append-only per audit; brand/category/material conflicts at confidence
  ≥0.5 route to moderation. Tag audits sweep on a schedule once a live
  model key exists (owner decision 5).
- **OFF contract.** Asterisk OFF/paused means no Passport or behavioral
  personalization on any surface (search, Discover, home, rails, ads,
  Stylist). Hard filters and the current request still apply; stale
  personalized responses can never overwrite OFF results (guarded in
  code since PR #77); OFF does not erase data — erase/export are
  separate controls.
- **Disclosure.** Conversational surfaces and Privacy/About disclose the
  AI-assisted system (EU-AI-TRANSPARENCY.md); AI-assisted public
  editorial carries labels and human-review state.

## 6. Data doctrine

- Passport is **private by default**; public profile and public Passport
  are different things; purchase history never becomes public
  automatically; publishing any Passport/wardrobe item is an explicit
  per-item action.
- Every signal exposes source, kind (explicit/inferred/imported/global),
  last use, affected surfaces, visibility, retention, and
  edit/disconnect/forget/export/delete controls (ADR-006).
- Never public and never in external-model payloads: raw measurements,
  private images, search history, connected-account tokens, inferred
  sensitivities, precise identity.
- Supabase rules (handoff §6): additive migrations through the repo's
  schema-vN process with runtime version assertion; RLS on exposed
  schemas; server-only by default; ownership predicates in policies
  (`TO authenticated` is not authorization); UPDATE policies carry USING
  + WITH CHECK; private Storage with bounded files and short-lived
  signed URLs; security/performance advisors + negative cross-account
  tests before merge.
- No silent caps: any bounded retrieval (top-N, sampling, candidate
  limits) reports its truncation (`candidatesTruncated` pattern).

## 7. Trust prong — launch dependencies

Before public **publishing**: ToS + community guidelines, content
licence, DMCA agent + operational inbox, copyright/impersonation/
harassment/defamation workflows, corrections + appeals, disclosure UI.
Before public **social**: report flow + taxonomy + appeals, block/mute,
minor/age policy, non-personalized feed, ad-targeting restrictions,
moderation staffing with response targets. Before **Asterisk
conversational/public generation**: AI disclosure, content labelling,
human review for public-interest editorial, vendor data-flow inventory +
kill switches, forbidden-field payload tests. These are gates, not
aspirations — a launch that skips one violates this constitution.

## 8. Owner decisions

Engineering never decides: launch regions; age policy; DMs; wardrobe
visibility default; AI provider/retention; licensed sources; Spotify
path; TikTok; brand-verification staffing; retention periods;
Constitution approvals; merchant of record; creator monetization;
DMCA/counsel workflow (docs/OWNER-DECISIONS.md + handoff §11). Safe
defaults apply while unanswered: nothing ships publicly anywhere.

## 9. PR quality standard

Every PR: objective + user journey; exists-vs-new; schema/API/event
changes; privacy/security/moderation/rights/commercial impact; flag +
rollback; migration/backfill notes; tests with exact results;
screenshots for UI changes; manual test instructions; known limitations;
doc updates; explicit review focus (state what the review should attack). Required gates: unit/contract
tests, Postgres integration (constraints, concurrency, RLS, Storage),
cross-account negatives, accessibility + browser flows, load/cursor
tests for feeds/search, production build, dependency review, Supabase
advisors after DB changes, no unresolved P1/P2, and **no fake
partnership, connection, purchase, trend, verification, or AI
capability**.

## 10. Amendments (owner-issued, in force)

Each entry is a decision the OWNER made after v2 was written. They were
being carried in notes only, so this document contradicted the owner for
weeks — §2 still ordered a locked UI the owner had unlocked, and still
named a review step after it was retired. A binding
document that outlives its decisions is worse than no document, so
amendments live here from now on. Superseded text above is annotated in
place rather than deleted, so the history stays readable.

**A1 — UI UNLOCKED (July 21, 2026).** Supersedes "UI is LOCKED" in §2.
Full creative redesign is authorized ("full in on ultra creative web
design"). Sequencing mandated by the owner: FIRST streamline systems and
normalize button placement/interactions ("everything more synergized"),
THEN the creative redesign. No-faking, branch+PR, build-must-pass and the
report format are untouched by this.

**A2 — SELF-REVIEW (Aug 5, 2026).** The external review step is retired.
Every change is reviewed by its author, adversarially: declared-criteria
batteries, a battery checked to fail with the fix reverted, and the test
laws. Branch + PR + CI green + merge at the owner's word all still stand.

**A3 — VERIFY A STACKED MERGE (Aug 6, 2026).** Adds a required step to §2
Git. A stacked PR merged with `--delete-branch=false` merges into its BASE
BRANCH, not `main` — and still reports `MERGED`, with nothing in
`gh pr list` showing the difference. GitHub only re-targets a child PR when
its base branch is DELETED, and this project keeps branches (deleting one
auto-closed PR #2 once). Before merging a stack, either retarget each child
to `main` explicitly once its parent lands, or verify afterwards with
`git merge-base --is-ancestor <child-sha> origin/main`. Never trust
`MERGED` on a stacked PR to mean "on main". Cost when learned: recovery
PR #143.

**A4 — HOLDINGS DEFERRED (Aug 7, 2026).** Scope decision, extends §4.
Asked whether a "hold" should be a soft user-owned "keep this for me", an
availability-checked extension of `purchase_tickets`, or deferred, the
owner chose DEFER ENTIRELY: ASILUM controls no inventory, so any hold
implying a purchase guarantee is exactly the fake §2 forbids. No holdings
work starts until a real availability signal exists (eBay keys → ingest).
The bag stays client-side until then. Same decision: sign-in from a second
device MERGES both sides (not account-wins, not ask-the-user), with the
shared-device pollution risk accepted knowingly.

**A5 — THE MARGIN TO ASSUME (Aug 24, 2026).** Extends §5, and narrows it.
The owner's instruction: *"a very small margin for it to assume things."*
Asterisk may infer — it is a recommender and inference is the job — but the
margin between what a person did and what the system says about them is
small, declared, and never compounds.

1. **One floor, one place.** Whether there is enough evidence to describe a
   person at all is ONE number in ONE module (`lib/asterisk/margin.js`,
   `EVIDENCE_FLOOR`). It was the same number typed twice in two files that
   never referenced each other, plus a third that measured something else and
   read like the same rule. A floor in three places is a floor nobody can
   raise.
2. **Abstention is a shippable answer.** Below the floor, Asterisk says it
   does not know yet, in words, on the surface — not only in a payload field.
   Ranking may still fall back to general results; what it may never do is
   present a general result as a personal one.
3. **Bands, not percentages.** No surface prints a confidence percentage.
   `confidenceBand()` is the vocabulary and it already existed for this
   reason — *"a phrase, never a bare percentage pretending to be objective
   truth"* — while two screens printed the percentage it was written to
   prevent. A number carries a precision the evidence does not have.
4. **An inference is not evidence.** The taste halo bleeds a strong signal
   into ADJACENT tags a person never touched. That is legitimate for RANKING —
   it is how a MINIMAL reader is shown an adjacent TAILORED piece instead of a
   wall of the same thing — and it may never be cited back as "your taste",
   nor used as the input to a further inference. Fine to rank with, never to
   cite. A guess drawn from a guess is a claim.
5. **Separated confidence stays separated on screen.** §5 already forbids
   averaging the five confidences into one number; showing exactly one of them
   and calling it "confidence" is the same collapse performed by the UI.

Nothing here loosens the Search-accuracy law: an unknown query still falls
through honestly to the research queue, and a fabricated reading is still a
violation. A5 says the same thing about a PERSON that that law already says
about a QUERY.

**A6 — THE V.2 BLUEPRINT SUPERSEDES (Oct 18, 2026).** The owner's V.2
Blueprint of 17 October 2026 supersedes every older rule in this document,
in docs/OWNER-DECISIONS.md and in the rights register wherever they differ;
where a blueprint clause names a figure, the figure is the law, and where it
names none the owner rules by the word recorded here. Rulings of 18 Oct:
(1) FEES — the passenger fee is $1 + 1.5% of the merchandise on every
purchase through ASILUM, buyer-paid, and supersedes the 1% founders fee with
its 50¢ floor on the ticket lane; the $30 storefront activation applies ONLY
to DROP (a seller releasing at scale); SELL carries no ASILUM fee on the
seller's side and is subject only to the processor's own fees, which ASILUM
does not control. (2) FOLLOWERS are tracked server-side so the friend
asterisk (a mutual follow) can exist; the earlier refusal is lifted.
(3) MUSIC — the manual-only ruling of 2 Oct 2026 (OWNER-DECISIONS §7) is
superseded: Spotify and Apple Music developer access is to be applied for,
last in the build, on the owner's behalf in preparation and by the owner's
hand where a service requires the account holder. (4) |A| is a box with the
letter A in it, nothing more. (5) MOTION limits as declared in slice 9
stand. (6) The BRDCST price list is set by best judgment: profitable, never
so expensive that a small band opts out. (7) Account creation collects the
birth date, the home town and — optional, explained, erasable — ethnicity,
for the Passport's identity anchors; the onboarding questions of 14.11 use
them. The no-faking law, branch + PR, build-must-pass and the report format
are untouched by this.

**A6 addendum — THE LOOK (Oct 18, 2026).** The owner's search-popup
reference picture of 18 October is the primary reference for how the app,
and the search popup in particular, looks: Michroma for headings and names;
the description face — Share Tech Mono, restored from the 1 October build —
for decks, tabs, meta and the search field; Inter for reading paragraphs
and results; an icy white-blue ground with slate ink, blue links and a true
red accent (the asterisk, the active tab, the |A| when on) in light; the
blueprint's dark palette stays. No lines of any kind: no scanlines, no
hairline fields, no grid. Where the 17 October blueprint's "Inter secondary"
differs, this addendum wins (the latest explicit correction beats the
earlier text).

**A6 third addendum — THE DEVICE (Oct 18, 2026, evening).** The owner,
after the slice-14 look: "rainbow refractive reactive liquid glass, …
I want it to look cool"; "pull from the og design language but only some of
it"; "I want the app to feel like a physical device"; "the og passport design
should transfer over 90% accurately"; "I miss the soft gradient of blue to
white and green to black and I miss the dark mode phosphorus glow … add it
back"; "drop the magazine from everything, it's just ASILUM". Rulings:
(1) THE PHOSPHOR GLOW returns in the DARK palette only — a word glows in its
own colour; body text never glows; light keeps none. This narrows the
addendum above ("no glow" in its "no lines of any kind" sense): scanlines,
hairline fields and grids stay retired. (2) THE GROUND is the original
gradient — blue to white in light, green to black in dark. (3) THE DEVICE
LANGUAGE, sparingly: text that loads in from ">>>>>>" when a compacted
description expands; square warning lights that blink and go dark on a
purchase, a bag or an offer; MRZ lines run out in chevrons with a block
cursor. Their red (--warn) is red in both palettes. (4) THE PASSPORT
document follows its 25 July iteration-5 design (7db2b89) at roughly 90%:
the photo slot's fine print lines and the plus registration band are part of
the document, not a CRT. (5) The name is ASILUM — "magazine" is dropped from
every visible string; the domain keeps its current address until it moves.

**A6 fourth addendum — THE FIXTURES AS DRAWN (Oct 19, 2026).** The owner
supplied a dimensioned sketch of the three fixtures ("how EXACTLY THE APP
UI FIXTURES SHOULD LOOK") and a film of the September header glass. The
sketch is the law for the fixtures: the Info Dock and the Passport Button
sit side by side at the top RIGHT (superseding "Info Dock top left"), the
ends where they meet straight; the deck is one pane cut into two end caps
and five keys, with the tab indicator at its top right and the foot grill
under the post disc; all of it clear, rainbow-refracting liquid glass whose
cuts and curves bend what passes beneath. The glass is the September
header's recipe, unchanged ("do this"): a near-clear pane with a saturation
lift and no blur, the 56px Snell's-law bezel split 80 / 86 / 92, the grey
weight mask, the gloss, the current key's lamp under the water, and the
page-side bend on Safari — and, by the owner's later word that day, no
surface hover reactions at all (no pointer shine, hovered lamp or dome),
glows at 55% of their spread, a far lighter shade on a press, and a 25%
touch of black or white on the pane. The tab indicator blinks red
twice for any fixture key, and once then holds for POST and the globe; the
sketch's 17.5 / 1 / 17.5 ms was lengthened at the owner's word the same day
to a DVD player's pace (140 ms lit, a 90 ms break with a 40 ms afterglow).
The same day: the cuts are a hairline in the search field's outline colour;
the fixtures carry a 15% touch of black (dark) or white (light) over the
September pane; the keys glow in dark; and every font in the app is Michroma
(the description and reading faces resolve to it; Inter is the fallback). Then: every fixture key
but POST is a flap hinged invisibly on its top edge that tips into the glass
when pressed and springs back (app/components/hinge.js); the cuts are
shorter; the vent has no outline; the bezel is a thin fading band; the
glyphs share one geometry and one 1.5px stroke; a hairline shine rim runs
round each fixture. Later the same day: the gap between the Info Dock and
the Passport Button shrank from the drawn 18 units to 8; the *ASILUM
wordmark became a fixture of its own, permanently in the top-left corner
(in line with the deck's left edge); and nothing on the site is italic.
The wordmark is brushed metal and a touch bolder, its asterisk smaller and
raised to the top of the capitals, with a thick translucent bar and one
square beneath the word, all within the word's own box. Then, to the
launch title card: the capitals in chrome washing to mint (dark) or steel
(light), the asterisk small, plain red and up in the word's top-left corner,
the square lit red, and one load in ten the bar is a run of chevrons that
fills it. No red glows anywhere (the tab indicator included). The site's
greens return to the original phosphor green (#46ff96) while the fixtures
keep the V.2 accent (#8cf0a6), and the dark ground is blacker. THE FEED
LAYOUT (the owner's feed sketch, 25 Oct 2026, superseding the 19 Oct duo):
one Tetris grid (lib/feed/tetris.js) — 5, 10 or 15 columns by width, half-
column rows, one gap everywhere; every card in one of its kind's sizes
(a piece three columns tall or a small square, a place or a song a square,
stills and motions tall or wide, a standalone BRDCST a full-width strip),
placed where it traps no cells, full-width cards waiting for a level row. A
post of several stills, and up to twenty recommended motions, are Figure 20:
three cards flat in the middle and every other card visible in the two end
stacks (twenty shows three and seventeen split), each stacked card standing
on its outer edge with its inner edge turned away, flattening as it arrives;
it opens in the middle. The Feed says "feed", never "edit". A piece card is the mode word (SELL for a native listing,
LISTED otherwise, DEMO for a synthetic record), the handle, PASS, the
photograph, the name, the size and price, and like · stamp · share. A song
card appears only for a real record; there is no music catalog yet. THE POST
CARD (the owner's post sketch, IMG_1143, 25 Oct 2026): every post is a five-
column card — the author's circle and username with PASS over a red rule,
the media (Figure 20 for a carousel), the counter "01/26", the caption folded
into two lines of chevrons with the fold mark (a sound ring at the right on a
motion), then ♡ · the bubble · the stamp · share in the signal blue, each
with its count beneath, over a red rule. A count is the real one in three
digits or "---" where none is kept (comments, shares, any sample); never an
invented "000". The piece card's head is one line, "SELL:handle"; a place
card prints its name and type as written, not in capitals. LATER THE SAME
DAY: PASS leaves a post's face for a HOLD MENU — a held press, a
right-click or the keyboard's OPTIONS key opens PASS and the link over the
card (a piece and a song keep their ×). THE BLOCKS replace the chevrons
wherever text stood in for text (the owner's reference: a row of even
blocks while text loads in, a block the length of each word on a folded
line); the MRZ line is the passport's, not a placeholder, and stays. The
comment bubble's tail is at the right; MESSAGES is an envelope; the four
actions share one glyph span in four equal columns; every card in the grid
takes one padding and one inner radius. THE MODEL (the owner: "this is just
a model so pepco can see what the app looks like"): a keyless run is the
Feed of one reader — an Oasis, Fontaines D.C., Hedi Slimane, indie sleaze,
Justice fan who likes Eames and industrial furniture (lib/model/pieces.js
MODEL_PERSONA, overlaid on a cold reader like a prompt, stored by nothing).
Its pieces are DEMO records that lead the seed catalog, photographed with
free-use reference photography on white (rawpixel CC0 / public domain,
Wikimedia Commons; public/model/credits.json), never the listing's own; its
places are four real public venues with their own source and free-use
photographs, and fictional DMV rooms and concerts labelled SAMPLE FIXTURE;
its songs are real titles labelled SAMPLE with no art, no link and no
playback. Nothing in the model can be bought, booked or played. AND THEN
(the owner, the same evening): no × on any card's face — a piece and a song
hold the menu too (a piece's PASS stays the brain's signal); a piece's words
ride its photograph, the head on its top and the name and price on its foot;
the grid's gaps are tightened so the media is bigger; the Passport globe
has its equator; the model's authors are made-up usernames with free-use
photographs for their pictures; the carousels ride early; and every red
rule is a CUT — a band either side bends what lies beneath it (Cut.jsx, an
SVG displacement run as a backdrop-filter where the engine can, a plain
line elsewhere). AND THEN AGAIN ("still looks like shite"): a media post is
the whole photograph, the head and the foot over it on scrims; the rule is
not red but the fixtures' own hairline cut (the deck's groove, laid flat),
still a cut; every glyph but the feed's and the Passport's is drawn in
Michroma's hand — wide, squared, every corner rounded the same, one stroke;
and the BRDCST strip is the owner's drawing: the event's photograph clouded
across it, the badge in its white ring with the red rule under the word,
the name large in white, where and when small, the × at the corner, and a
tap opens the BRDCST popup where the photograph is clear. AND LAST THAT
NIGHT: the NEW LOGO — under *ASILUM a bar of blocks, narrow at the left and
widening like a line's words, the last one lit in the lighter blue; the
thick line, its square and the one-in-ten chevron run retire with it. A
piece's actions float on its photograph and a post's BRDCST footer floats
on its; the search lens is a circle, the heart narrower, the account a
circle; every popup is a large rounded square floating in the middle of
the screen over a clouded page; every seed piece wears one of the model's
free-use reference photographs for its category (never the listing's own
— the card still says DEMO); and the light ground is ice blue the whole
way down, never white. The owner's "use images from Google" is NOT taken
up: other people's product photographs are not pulled from retailers or
search results (the no-scraping law, and their copyright) — free-use
photography stands in everywhere instead. AND THE LAST WORD OF THE NIGHT:
no counts under the four actions, which are thin, small and a little
transparent; the foot's gradient faint, on every post; the carousel and the
motion row are the STRIP of X's "Videos for you" — tall cards side by side,
the next one peeking, a plain sideways scroll — and Figure 20 is retired;
the logo is the owner's own image, imported as given; no rainbow rim on a
post or a popup (the fixtures keep theirs); one thin stroke on every glyph.
THEN THE OWNER'S OWN MOCKUP (two references, 25 Oct 2026, late): every
popup but the search is a large rounded square floating in the middle of
the screen, its face an ice gradient, the page behind it clouded dark
blue; the SEARCH rises out of the centre control deck, its foot meeting the
deck's head; beside Michroma (the words) Inter carries the body and Share
Tech Mono the small print, so A6's "every font is Michroma" is amended to
those three; the lines are thin and the colour stays (the red current tab,
the teal ink). The page ground is a dark blue coming in from the top and
the bottom with the ice blue between. A card's foot is a gradient only,
never a solid band, and no line sits under the four actions. The logo sits
top left at a real size. And EVERY PICTURE IS A DARK BLUE STILL
(lib/model/stills.js): the free-use photographs are gone at the owner's
word ("they all look ugly"); a piece, a post, a place, a broadcast and an
author each wear a still drawn from their id, and nothing is a photograph.
THEN, THE NEXT ROUND (owner, 25 Oct 2026, last): the stills are the
ORIGINAL COLOURED CARDS again — a piece its own placeholder card (thumbFor),
every other picture a tile in that same ten-tag palette (lib/model/
stills.js) — and the ink on a card is the light blue or the dark blue at
85% by the card's own ground (inkFor). THE MODEL'S CARDS CARRY NO DEMO OR
SAMPLE TAGS at the owner's word ("get rid of all the demo and sample
tags"): the records stay demo in the data (isDemoItem, nothing buyable,
the fixtures still fictional in the register), only the words on the cards
are gone; the page's DEMO CATALOG note is read by assistive technology
alone. The asterisk is dropped where it was overused — THE FEED, ADs, the
event's name, the overview's kicker — and kept on the logo. The head is
THE FEED, FOR YOU · FOLLOWING and the sort bubble, nothing else (no
sub-line, no stamp, no WHAT'S NEW). The ad ticker is a BUBBLE on the
centre control deck beneath the row of keys and above the vent (moved
from above the row the same night), the deck taller by it. The logo sits
top left at about half the Info Dock. A BRDCST attached to a post is
detached from it by a thin gap — the post's bottom flat, its top rounded;
the broadcast's top flat, its bottom rounded — the way the Info Dock and
the Passport Button sit; its hollow bar is gone. The words on a card sit
evenly in from the edges. Search extends the deck upward for its bar; the search
popup appears only once something is typed. The ad strip left the deck for
the head of the Feed.

A LISTING IS NEVER A SMALL CARD (owner, 25 Oct 2026, last: "that is
reserved for music and locations only"). A piece is medium — three columns
by eight half-rows (four columns on the widest grid); songs and places alone
take the small sizes. The Feed's grid is six columns on a phone, twelve on a
tablet, eighteen wide, so two medium listings fill a phone's row (on five,
this rule left a fifth of a phone's feed as holes). Large cards are six
wide. The rest of this paragraph's variety stands for songs, places and
BRDCSTs.
THE FEED'S SIZES (owner, 25 Oct 2026, late). Stills and motions are always
the biggest cards. Pieces, songs and places vary like Tetris — each draws
its own size from its id (portrait, square or landscape, medium or small)
and keeps it unless keeping it would trap a hole — and it does not matter
what sits next to what. Every card covers the lowest open column, so none
is left behind. A standalone BRDCST is a small card's height and a large
card's width (four columns on a wide grid). The Feed has two ad spaces, medium and BRDCST-size;
they fill the gaps the packing leaves (lib/feed/tetris.js fillAds) and,
with nothing sold, say THIS PLACEMENT IS OPEN — never a pretend advertiser.
A piece card's foot is one column — name, size and price, a hairline, then
like, stamp and share — so nothing on it overlaps.
THE DECK, 26 OCT 2026 (owner: "for the central control let's take away the
indicator light, let's also widen the central control fixture, … the plus in
the upload button, let's shrink it slightly, … all the buttons on the
fixtures — thin them ever so slightly and dim the white brightness and lower
the buttons' opacity slightly"). The tab indicator light is gone, and with it
its blinks and their vibrations; a fixture key answers with one subtle tick.
The deck is the drawn 745 stretched 1.1 sideways (--dk-sx), its cuts, grill
and insets with it; the top fixtures still end on its right edge. The plus
is 54% of the disc. Every fixture key's glyph draws a 1-unit stroke, its ink
pulled 14% toward the ground, at 88% opacity. This supersedes the tab
indicator wherever the 19 Oct entries above describe it.
THE LOGO, 26 OCT 2026 (owner: "it should be placed at the same height as
the info deck, and let's make it more blue so it's visible, and phosphorus
green in dark mode", with the title card for reference). The wordmark's
middle is the top fixtures' middle. The owner's artwork is coloured through
two masks cut from it: the word and its bar of blocks in a clear blue in
light, and in the title card's chrome washing to phosphor green, glowing, in
dark; the asterisk red in both. The same day: the logo 25% bigger, and light
mode back to the artwork's own colours (painted through the same masks); the
blue is gone.
Then 10% bigger again, darker and bolder: the letters thickened (the bar
left as drawn), light painted in the artwork's own hues darkened.
THE FEED'S MIX, 26 OCT 2026 (owner: "I want there to be a majority of
stills and motions on the feed"; then, having seen two posts to a piece,
"now there's too many stills and motions, reduce it"). The posts lead the
pieces one to one, and the pieces are capped at the number of media posts
(stills, carousels, motions), so the stills and motions fill most of the
feed's area while the pieces, songs and places are a little over half its
cards; with no media post the pieces stand alone. The model carries more of
its reader's posts — every author a fixture, every picture a still, every
motion the one generated test pattern. The ad space fills mid-feed gaps no
card can (at most one ad per eight cards); the two-wide song and place sizes
are a phone's only, and a listing has one size, three by eight. The cards
sit 8px from the screen's edges on a phone (was 14).
A SMART MIX, AND NO GAPS (owner, 26 Oct 2026: "when I'm swiping I don't
want two full scrolls to be comprised of just listings, locations, BRDCSTs
and/or songs, or motions and stills — I want a smart mix; I am also seeing
gaps in the feed, which is against the rules"). Each still, carousel or
motion brings one row of smaller cards: a piece, and beside it another
piece, one tall song or place, or two short ones stacked; a BRDCST has a
row of its own. The packer takes the cards in that order, a post waiting
only for its row to level. Every card is a multiple of three columns wide
(no two-wide song or place), so the rows close; the feed has no gap.
FIGURE 20 RETURNS FOR THE CAROUSELS (owner, 25 Oct 2026, late: "simply
input figure 20 how it is. it should be the ipod style collapsed cards
floating neatly tucked with the other media cards"). A post of several
stills is Figure 20 alone in its cell — three cards flat, every other card
stacked at the two ends on its outer edge, opening in the middle — with no
post-card housing around it: no head, caption, counter or actions; a hold
opens its menu, the centre card its media. Later that night: the stacks
are TUCKED OUTWARD (each end card's inner edge swings toward the viewer),
and a carousel is almost the size of a still or motion post, its flat card
filling the height, a small line above for the author's name. The
recommended motions are Figure 20 the same way, RECOMMENDED VIDEOS in that
line; the strip is deleted. LAST: a carousel is laid out exactly as a photo
post is — the coverflow fills the cell, the centre card the post's full
height, and the post's own head (picture and name) and foot (caption, like,
comment, stamp, share) float over it with no box, ground or scrim. The
recommended motions likewise, VIDEOS YOU MAY LIKE in the head and the
caption of whichever video sits in the centre, changing as it moves.

**Operational note (July 26, 2026), not a rule change.** The device-flow
ritual is retired at the owner's request; a repo-scoped `gh` token is
stored durably in `~/.config/gh/hosts.yml` (chmod 600) with
`gh auth git-credential` as the credential helper. It carries no `workflow`
scope, so `.github/workflows/` cannot be pushed without a re-auth — put
database-backed tests in `tests/postgres-integration.test.js`, which CI
already runs with `TEST_DATABASE_URL`, rather than adding a workflow step.

> Owner: these are transcribed from session records of your own decisions.
> Correct any wording that does not match what you meant — the point is
> that the binding document stops disagreeing with you.
