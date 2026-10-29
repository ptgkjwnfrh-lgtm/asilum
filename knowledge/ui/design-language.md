# Design language — V.2 (owner's blueprint, 17 October 2026)

> **This section supersedes everything below it where they differ.** The
> rest of this file is the July–September record, kept for the reasoning
> behind rules that survived; the V.2 slices (`docs/v2/slice-*.md`) and
> `docs/engineering/ui.md` are the current law.

- **The Masthead and the deck** (owner, 26 Oct 2026: "I kind of miss the
  liquid glass full-length header, let's add it so the logo can sit on it
  and the infodeck can be taken away leaving just the buttons"; this
  replaces the 19 Oct "no header, three fixtures" rule). Two fixtures, in
  the sketch's unit `--u` (`app/globals.css`, pinned by
  `tests/v2-fixtures-sketch.test.js`): the MASTHEAD, one full-width strip
  of the fixtures' liquid glass across the top (`app/components/
  Masthead.jsx`, `--head-h` tall, only its bottom edge lenses), carrying
  the *ASILUM wordmark at the left, in line with the deck's left edge, and
  the bare keys at the right — LIKES · BAG · NOTICES (the Info Dock, no
  pane of its own now) and the Passport's globe, in line with the deck's
  right edge; and the Central Control Deck (bottom: FEED · SEARCH · POST
  disc · MESSAGES · ACCOUNT) parted by cuts in the glass, with the foot
  grill under the disc. Both are clear liquid glass that bends every
  colour alike (no colour split, no rainbow rim, 26 Oct) — save the
  scroll wheel, whose pane carries the V.1 magazine's rainbow glass, red /
  green / blue pulled 80 / 86 / 92 (27 Oct, `RainbowGlass.jsx`): the one
  glass that parts the colours, as refraction, never paint. Of the V.1
  masthead only the strip came back: no ticker, no nav row. The ad strip
  (the house lines) rides on the deck.
- **The Feed is one Tetris grid** (25 Oct, lib/feed/tetris.js): mixed card
  sizes, even gaps, no holes; carousels and the motion row are Figure 20
  (Fig20.jsx), the ends turned and stacked. THE FOUR SIZES ARE A HARD RULE
  (owner, 28 Oct 2026): a LARGE card (still, motion, carousel, the motion
  row) is 80% of the screen's height (90% the same day, then "a large is
  now 80%"); a MEDIUM (a piece; a words-only post)
  is half of it each way, four to a large's place; a SMALL (song, place) is
  half its width and a third of its height, six to a large's place; a WIDE
  SMALL (a BRDCST) is two smalls side by side. The feed is packed in TILES,
  a large card's place each, holding a large card or an exact fill of the
  others, so no gap opens; the kinds spread evenly and never leave two
  bands (1.6 screens) in a row without a large card or without another.
- **The ink reacts to its ground** (owner, 28 Oct 2026: "for all the text
  and symbols they must be reactive to go from dark to light depending on the
  background"): every block of words or marks over a Feed card (lib/ink.js
  INK_ZONES) wears data-ink by what is really under it — the picture's own
  pixels, or the page — read by app/components/InkWatch.jsx once the scroll
  rests; a scrim under dark ink turns pale. A picture another site will not
  share keeps the ink its card's ground gave it. The accent lines that float
  on the page and not on a card (Figure 20's rule under the name) are the
  Masthead's line: the white bar in its glow, light theme too (the owner's
  exception to "light never glows", as the Masthead's own line is).
- **Nothing is italic** (19 Oct): no rule slants text, em/i/cite stand
  upright, and the browser never synthesizes an oblique.
- **Palette.** Light: white paper, `#1d5fd6` blue ink, teal `--sig` for
  links, a green-teal `--red` accent. Dark: `#070b0c` paper, `#6e9cff`
  links, `#8cf0a6` accent. Token NAMES are unchanged so the rules keep
  working; the values are the blueprint's. No CRT: scanline, grid, glow
  and wash tokens are neutral. Theme follows the device unless pinned.
- **Type.** Michroma (`--mich`) for labels, keys and headings; Inter
  (`--helv`) for reading. Share Tech Mono is retired.
- **Rainbow Liquid Glass, restrained.** A one-pixel conic rim on the
  fixtures (`--iris`); reduced-transparency drops the blur.
- **Popups, sessions, the Disc, haptics:** `knowledge/ui/interaction.md`.
- **What is gone** (and must stay gone — `tests/v2-shell.test.js`): the
  top header and its ticker, the destination row, the ORB HUB / MODULE
  RAIL interfaces (`data-model`), the account / bag / search panels, the
  CRT chrome (`.os-crt`, `.os-blob`, `.os-plus`, `.os-frame`,
  `.os-status`), the thumb bar.

---

# Design language — Fashion Intelligence OS

ASILUM is not an e-commerce site, a Pinterest clone, or a SaaS dashboard.
It is a **fashion intelligence operating system**: an alternate 1998–2005
future where OS, instrument, passport, and magazine evolved together. The
user navigates a living archive; the interface visibly studies them back.

Reference constellation (interaction principles, never assets): Winamp,
IBM AudioStation, early Xbox dashboard, PS2-era system software, Resident
Evil status screens, passports/visa security printing, GPS/military
navigation, medical monitors, ambient-electronica sleeve design (Aphex
Twin, Gen X Soft Club), early-2000s video tooling. Gen X Soft Club softens
the machine: curves, haze, milky glass — atmosphere over nostalgia.

## Law
- Information density over whitespace; dividers, labels, metadata,
  timestamps ARE the decoration. Every character of text is a real datum.
- RED (--red) is the only accent voice: activity, alert, recording,
  selection, the ASTERISK identity. No second accent, ever.
- Palettes (tokens in globals.css): phosphor dark NATIVE (blacks, phosphor
  greens, purple, red) / ice light (near-white, BLUE ink, teal, red).
  Legacy token names (--ink/--paper/--line/--grey/--faint) carry OS values.
  Owner order, 8 Sep 2026: on ice the ink is a blue (#1c3fae, 7.5:1) that
  GLOWS (--glow-ink), and every control that fills with the ink carries the
  same glow around the fill (--glow-box-ink; `none` on phosphor). The hazes
  gained a little colour: dark breathes fuchsia with softer purples and
  blues, ice carries faded pinks and yellows (blobs + --backlight).
- Layered depth: backlight → grid → haze blobs → content → glow →
  scanline glass. Subtlety threshold: never reduce readability. Scan lines
  ship at 0.315 (30% under the August 0.45 — owner order, 8 Sep).
- Seven destinations in a row directly under the top ticker (owner order,
  Aug 12 2026 — the left sidebar is GONE; header strip is thick enough that
  the wordmark keeps full size): FRONT COVER, CATALOG, THE WIRE (renamed
  from EDITORIAL by owner decree, Aug 13), PASSPORT, DISCOVER, PROFILE,
  SETTINGS. New features must answer "which subsystem do I belong to?" —
  the destination list only changes by owner decree.
- Header (`.tophead` in shell.js): thbar (wordmark + ticker + big
  SEARCH/BAG/SIGN-IN with symbols on search and bag) over the destination
  row (ASTERISK drawer trigger, seven buttons, compact dock). The pane is
  LIQUID GLASS (owner order, 8 Sep, "exactly like Apple's"; fifth pass):
  a clean STRIP across the whole top — flush, square, no float, no radius
  (the owner: "not a bubble at all"); 62px bar + 46px destination row + 6
  = --head-h 114px (was 64 + 48 + a 10px float = 128, then 98, then 106
  — taller twice on the owner's word; the header's words are bolder by a
  0.4px text-stroke on the Michroma labels, 0.3 on the ticker, weight 800
  on the big buttons, 600 on the meta — Michroma has one weight; the divider and the
  buttons moved up, the whole header smaller; the os-frame ornament now
  starts below it). A near-clear pane (--glass, 0.03 dark / 0.12 ice)
  over a CRYSTAL-CLEAR centre (no blur at all — the owner found any frost "oddly cloudy"; the
  backdrop is only saturated 160%) and a REFRACTING BEZEL — in Chromium the backdrop passes through an
  SVG filter (#lg-refract, shell.js) fed by TWO pictures drawn from the
  pane's own size and corner radius (rounded-rect distance, Apple's
  squircle bezel profile, Snell's law at n=1.5): a displacement map (R = x,
  G = y, blue held at 128) and a separate GREYSCALE weight picture saying
  how much of each pixel is bezel. Two, because Chromium colour-manages a
  feImage into the display's space and on a P3 screen (128,128,0) reads
  back with blue near 0.2 — a weight in one colour channel leaked a ghost
  of the sharp lens through the whole frosted middle; greys survive. The
  outer 56px of every OPEN edge bends what scrolls beneath it (an edge
  flush with the viewport has nothing beyond it and does not lens — for
  the strip only the bottom edge does), each colour a little differently
  (R/G/B displaced at 80/86/92 — the fringe on Apple's edges, "slightly
  more rainbow" on the owner's word; 24px at 50/56/62 then 44 at 58/64/70
  were both "too subtle", a 16-wide spread at 56 was too much, 4 a hint).
  The lens chain is CONFINED to the bottom band (restrictLens; primitive
  subregions in the strip's own pixels) and has no blur, so the clear
  middle costs nothing on a scroll frame. WHERE THE ENGINE CANNOT BEND A
  BACKDROP — Safari, or a Chromium without GPU compositing: the owner's
  recording of 8 Sep showed the cover letters passing under the strip
  untouched and the whole page lagging — the PAGE BENDS INSTEAD
  (createPageBend, LiquidGlass.jsx): what passes under the strip's bottom
  edge (cards, cover letters, headlines, rows) takes the strip's map in
  its own coordinates, re-placed every scroll frame, removed when it
  leaves. Found by SAMPLING the band with elementsFromPoint every 40px,
  each hit resolved to the OUTERMOST match of the selector, and nothing
  over 1600px on a side ever filtered — the first cut matched `.grid > *`,
  i.e. the catalog's 9,000px columns, and re-filtered four of them plus
  the cards inside every scroll frame: the "glitching and bugging" of 8
  Sep. Both paths now hold 16.7ms a frame in Chrome. `?lgpage=1` or `<html data-lg-page="1">` forces
  that path in any engine — proven in Chrome: the FRONT COVER letters bend
  and fringe under the strip with no backdrop filter at all, blended with the untouched backdrop by plain arithmetic (lens ×
  w + clear × (1 − w)), never an alpha mask; other engines get the
  saturation alone, no bezel. The edge is UNSEEN (the owner: "I shouldn't
  be able to see the bezel, it should still cause the distortion"): no
  lip, no band — a whisper of light on the bottom edge (Fresnel, 0.05)
  and a 7px edge zone (::after, blurred) that only REFLECTS what is near
  it: the white of the pointer and the colour of the lit word's lamp. The
  GLOSS is ever so slight and real (--glass-sheen): a thin specular along
  the top where the sheet meets the light, one soft diagonal reflection
  band (a window in the glass), a faint Fresnel at the bottom — never a
  wash. The words float and their glow is a LIGHT UNDER
  THE WATER: .glass-light, a sibling beneath the pane kept to its rect,
  carries lamps that are each three lights (a small near-white core, the
  coloured halo, a wide faint spill — a glow stick in water, never a flat
  blob; the layer blurs itself 14px since the clear pane no longer
  diffuses it; every cursor-driven light was DILUTED to roughly a third
  on the owner's word, 8 Sep: "there's simply too much"): the current destination's (--cx/--cy/--cs), the hovered word's
  gliding between words (--lx/--ly/--ls; the wordmark's lamp is red) and
  the pointer's trace (--gx/--gy/--gs); the pane blurs and bends them.
  These properties are registered (so they transition) AND inherited —
  a pseudo-element reads a custom property only when it is declared to
  inherit, and the pane's ::before/::after need them. The pointer's shine
  on the glass is a tight specular core (96×36, set 6px up-left of the
  cursor, towards the light) inside a faint wide sheen; both fade on leave
  (--gs). THE MENISCUS (owner order, 8 Sep: "the words refracting on the
  liquid surface when I hover — an extremely subtle detail"): the hovered
  word is seen through a shallow dome the cursor pulls in the surface
  (#lg-ripple, shell.js; Chromium only, like the bezel). Rays through a
  dome bend towards its centre, so the map pulls each sample towards the
  middle linearly (a spherical cap's slope grows with radius), eased to
  nothing at the rim; R/G/B pulled 3.2/3.7/4.2px at full strength (2.0 was
  invisible, 5.0 obvious) so the glyph edges disperse a hair. The dome is
  a 64px picture drawn once, placed in the word's own user space by
  feImage x/y and trailing the pointer with lag; the pull ramps in on
  enter and dies down on leave (data-ripple comes off at the end), all
  from one rAF loop that stops when settled. Flat 128 grey outside the
  dome (feFlood) — colour management leaves greys alone. The pane deepens
  once the page scrolls under it (data-glass="deep"). Reduced motion keeps
  pane, lamps and refraction, drops the glide, the pointer shine and the
  meniscus. THE ITEM DETAIL IS THE SAME GLASS (owner, 8 Sep): `.modal.lg`
  — a 22px-radius pane over the dimmed page, all four edges lensing
  (LiquidGlass.jsx, its own filter #lg-item, at 0.5 of the header's pull —
  the owner asked for 0.15, then saw "no rainbow warp at all"; 0.5 is the
  first setting that reads), the same gloss; the pane does not scroll,
  `.mscroll` does inside it. THE LEGIBILITY TRICK (owner, 8 Sep): the page
  is lowered ONLY where the popup takes up space — the scrim is clear and
  sharp (`.overlay:has(> .modal.lg)`), the pane carries the darkening
  (75%, both themes; the owner's 40% left the catalog's words as bright as
  the record's own — illegible in the recording), the picture stands on
  paper. WHERE THERE IS NO BACKDROP
  REFRACTION (Safari — WebKit never runs an SVG filter as a
  backdrop-filter) the page itself bends: every `.card`/`.cvlook`/
  `.mrelitem` lying under the pane's edge gets its own SVG filter with
  the pane's map placed in that element's coordinates over a flat 128
  grey (`bend` in useLiquidGlass; re-placed on scroll; removed on close).
  Bounded to the elements the edge crosses, each filtered within its own
  box. `<html data-lg-page="1">` forces that path in any engine so it can
  be judged on a desktop — proven in Chrome: at 6× the card text under the
  edge shreds into colour bands, at 0.15 it carried a fringe too faint to
  be seen as one; 0.5 reads. (Found on the way: `.ctr >
  *` had been turning every overlay rendered in the centred column
  relative, so the item detail opened inline wherever the page was
  scrolled — an overlay is fixed now wherever it is rendered.) Tap the
  photograph and it FLOATS (FloatView.jsx, the owner's Spotify reference):
  black space, the picture as a rounded card that tilts with the phone —
  the pose you opened it in is flat, and the card stays put in the world
  as the phone moves — or with the cursor where there is no gyroscope; a
  shadow sliding the other way, a glare crossing its face, a halo of its
  own colour behind. iOS asks before sharing motion and only inside the
  tap, so `askTilt` runs in the click that opens it. Reduced motion: the
  card, still. Theme toggle
  lives in SETTINGS only; the default follows the device preference
  (prefers-color-scheme) until the owner pins a theme.
- Aug 12 reference language (owner pictures: Gen X Soft Club, Aphex SAW
  poster, ambient-era CD print, State 3.0 stills): really THIN lines that
  are NOT uniform as put-together excess detail; text allowed to float in
  space; small white outline squares/hairlines slightly bordering the page
  (`.os-frame`). Background grid: big cells, very transparent lines.
- Aug 12 round 2 (owner pictures: Rag & Bone Denim '23 campaign, Helmut
  Lang ad archive): BOLD FLOATING TEXT — oversized stacked headline blocks
  sitting directly on the page ground; GREATLY limit bubbles — content
  floats, borders are the exception not the default; UNORTHODOX image
  placement — overlaps, off-grid collage, film-strip thumbnail columns,
  type crossing images. NO rotated/slanted images (owner ban, Aug 12);
  outfit strips may be uniform and organized.
- Aug 13 round 3 (owner pictures: State 3.0 stills, Warp/Red Snapper
  track-credit sleeve, LTJ Bukem Progression Sessions ad, Rag & Bone
  again — "this is supposed to feel like a magazine"):
  - THICK FLOATING FRAMES (`.tdrf` + variants): heavy rectangles
    (5–9px, `--ink`) floating over an outfit grouping to frame a
    HIGHLIGHT piece plus some empty air; they may overlap each other
    (State 3.0's double frame) and overlap neighbouring pieces. A frame
    marks a TRUE highlight only — the strip's lead piece on the cover,
    the anchor piece or an owned wardrobe piece in the stylist.
  - HAIRLINE FIELD (`.cvlines`): hand-placed horizontal AND vertical
    contrast lines behind the content (owner order, Aug 13 — diagonals
    were tried the same day and swapped for verticals; nothing in the
    field takes an angle, and images still never rotate) — a few thick
    (3–6px), most 1px; a few visible (0.12–0.30 opacity), most barely
    there (0.04–0.10). Deterministic (no render-time random),
    pointer-events none, always behind content, never reducing
    readability.
  - MAGAZINE MARGINALIA: small side text everywhere a magazine would
    carry it — gutter verticals, Warp-style credit stacks (micro label
    over value: `.cclbl`/`.ccval`), ledger folios, a bottom colophon.
    EVERY value printed is real state (system ledger counters, item
    ids, feed ranks, source labels) — marginalia is never lorem, never
    invented.
  - DENSITY OVER UNIFORMITY: the front cover is FULL — contact-sheet
    film strip beside the hero (next real feed picks), staggered column
    baselines that deliberately do not align, one pull-quote-scale
    transmission on the wire, non-uniform heavy-bar pairs opening
    sections. Follow floating text (no borders, no bubbles) harder,
    not less.
- Clickable words are painted the logo gradient's teal (--sig) with a glow
  and a slight horizontal motion blur — never black/ink (owner: "it's
  ugly"). Red-law elements (buy/home/reset) keep red with the same
  treatment. One grouped rule at the end of globals.css.
- CATALOG (/) lands straight on clothing (owner order, Aug 12; the POST
  sub-page folded into THE WIRE by the Aug 13 overhaul): floating mode
  row (curated/following/new), one collapsed CURRENT CRAVING line,
  filters, masonry immediately. The page carries the magazine furniture
  (owner order, Aug 13) at ZERO height cost — the pieces keep the
  floor: a hairline field pinned to the first stretch, a live folio
  beside the headline (date + pieces-this-pass), and gutter verticals
  printing the pass's real zone composition and the Asterisk state. The
  old header cubes (live observation, who to follow, the slide), the
  morse strip, and the synthetic post tiles are gone from the page.
- THE WIRE (/hotlist; owner overhaul Aug 13, renamed from EDITORIAL) is
  where ALL user posts live, and where the hotlist stands.
  - THE POSTING LAW (owner order, Aug 13): three ways to post —
    TRANSMISSIONS (text ≤5000 chars; the caption IS the header, ≤200,
    stored as the post's title), IMAGES (up to SIX in one carousel,
    caption allowed), VIDEO (one, capped 3:00, caption allowed). Images
    and video wait on the real media pipeline (storage/moderation/
    playback) and are honest coming-soon modes until it exists — no
    fake uploads, ever. The composer's three modes state the caps.
  - THE HOTLIST LAW (owner order, Aug 13): the hotlist is TEN BOOTH
    SLOTS held for independent Shopify-based brands. A PASSPORT account
    becomes a BUSINESS account by verifying itself, connecting its
    Shopify, and connecting its personal website; ONLY business
    accounts get a chance at a booth. The old engagement-ranking rows
    are retired from this surface.
  - THE UPGRADE PROCESS (built Aug 13, same day): live end to end. A
    signed-in account applies on PROFILE → ACCOUNT (brand name +
    your-shop.myshopify.com + https website + statement); the
    submission opens a REAL brand_cases verification case (Feature G
    machinery — enforced status machine, https evidence, append-only
    events, no machine path to business) and a HUMAN decides it via
    the admin desk (area=business, business.approve / business.reject
    — a rejection carries a note the applicant reads). Account state
    lives in business_accounts (schema v26); booths fill in
    verification order (first verified, first booth), holders show
    brand + external site link (quiet voice, outside the teal rule),
    open slots stay honestly OPEN, and every count (folio, gutter,
    colophon, cover mirror) is the live roster. The Shopify OAuth
    token exchange is the ONE part still gated on the commerce
    pipeline's keys — today the storefront domain is reviewed
    evidence, and every surface says so.
  - THE IDENTITY CHAIN (owner order, Aug 13): every byline is a link —
    your own to /profile, anyone else's to /u/[handle]; a server post's
    timestamp is its permalink (/hotlist?post=<id> pins the single
    transmission with a back link; device-only copies get no permalink
    until the server holds them). /u/[handle] resolves on server truth:
    published ROOM → the room + their transmissions; no room but posts →
    an honest reader page ("hasn't published a room"); neither → NOT
    FOUND. The profile's POSTS tab reads the identity's durable server
    posts (?mine=1, filtered by author_id server-side, never exposed)
    merged with device copies the server doesn't show yet — labeled
    "pending or held", never dressed as published.
  - THE TRANSMISSION LIFECYCLE (owner directive, Aug 14 — backlog 1 of
    14 Aug 2026): the author — and only the author, verified
    server-side and bound in the WHERE clause — may EDIT or DELETE
    their transmission from the floor. The controls are tiny wire
    furniture (.wctl, in the teal rule) shown only on posts the
    ?mine=1 server truth claims — never on the local text-match
    heuristic, which stays what it was: the "you" chip. DELETE is a
    two-tap: the armed state reads SURE? DELETE and swaps the whole
    signal to red (.wctl.warn — never red text in a teal blur). EDIT
    opens the composer's own fields inline (.wedit, prefilled; the
    fields ARE the transmission — saving writes exactly what they
    hold, an emptied caption clears the caption). An edited
    transmission carries "· edited <age>" (.wedited, quiet grey — an
    honesty label, not a control) on every surface that prints a
    byline: floor, permalink focus, profile POSTS, /u/[handle].
    Deletion is SOFT server-side (moderation_status='deleted', the row
    survives as record) and the permalink answers HTTP 404 with the
    honest absent message from that moment. Edits re-run the same
    sanitize + screen as fresh posts — a flagged edit parks the
    transmission under review and says so in the same words.
  - WIRE ENGAGEMENT — LIKES + SAVES (owner directive, Aug 14 — backlog 2
    of 14 Aug 2026): two counters per transmission, and both
    count PEOPLE, not events. The ledger's key is (post, person, kind),
    so pressing LIKE in a loop or from ten tabs moves the counter once;
    only another human moves it again (the v22/v23 anti-manipulation
    law). Counts are computed on read from that ledger — there is no
    denormalized counter that could drift from its evidence, which is
    the fabricated number the constitution forbids. A transmission
    nobody has touched prints NO number at all (the word LIKE alone,
    never "LIKE 0"), and an unreachable server shows no counts rather
    than zeros. Resting state rides the teal clickable rule (.weng);
    the engaged state is the full red signal, the house's "this is
    yours" voice. Buttons are their own class — .wact belongs to the
    WARDROBE tab and must not be borrowed. Engagement is refused on any
    transmission the wire will not show (retired, held, absent), with
    the same 404 the lifecycle verbs answer — it never reveals whether
    a hidden transmission exists.
  - HASHTAGS + @MENTIONS (owner directive, Aug 14 — backlog 3 of
    14 Aug 2026): every surface that prints a transmission
    renders it through ONE component (TransmissionText), so a tag
    behaves the same on the floor, the permalink, the cover wire, the
    profile's POSTS tab and /u/[handle]. Parsing happens AFTER the
    sanitizer (never before — the sanitizer rewrites the string, so
    offsets taken from raw text land in the wrong places) and only
    SPLITS it: concatenating the rendered segments reproduces the
    stored text exactly, because a renderer that drops a character is
    rewriting someone's transmission. #tag hands off to search
    (/discover?q=, lowercased) and keeps the author's capitalization on
    screen; @mention lands on /u/<handle>, which answers NOT FOUND
    honestly when nobody holds it. A ref must sit at a word boundary
    (C#, emails and url anchors are never refs) and a mention is linked
    only if the handle COULD exist — RESERVED_HANDLES stay plain text,
    since linking one promises a page that can never load. Refs are
    clickable words in running text: the teal rule and nothing else —
    no chips, no boxes, no weight change. Extracted hashtags are stored
    on the row (tags jsonb) and RE-extracted on edit, so a deleted tag
    really leaves; mentions are not stored, because nothing reads them
    yet. NOTE: the handle vocabulary lives in lib/profile/handles.js —
    rooms.js reaches the database, so a client import of it ships `pg`
    to the browser and fails the build.
- THE DESK (/admin — owner directive, Aug 14, backlog 4 of
  14 Aug 2026) is the operator surface for /api/admin, which had
  been complete for weeks with no way to reach it (a business
  application could only be decided with curl). It wears the SETTINGS
  RACK's own vocabulary — .rkmod/.rkhead/.rkrow/.rkled, numbered
  modules, engraved labels — reused rather than reinvented; only the
  panel switcher (.desknav) and the wider inputs are new. Four panels:
  01 BOOTH APPLICATIONS (approve/reject; a rejection cannot be sent
  without the note the applicant reads), 02 MODERATION QUEUE (resolve /
  dismiss, recorded under the server-configured operator name), 03 BRAND
  CASES (read-only — the ledger moves through its own enforced
  transitions), 04 SUBSTRATE (row counts + every gated source naming the
  exact env vars it waits on). GATE: ADMIN_TOKEN is pasted at the desk
  and held in sessionStorage ONLY — never localStorage, never a cookie,
  never the URL; it dies with the tab and LOCK DESK clears it now. The
  permission model is unchanged: the server decides every request, a bad
  token relocks the desk, and an unset ADMIN_TOKEN leaves it dark and
  says so. /admin is disallowed in robots.js (keep that list in step).
  - THE FOR-YOU HUB (owner, 9 Sep evening: "the same format as twitter —
    videos, pictures and transmissions all live in one hub, and the
    hotlist lives in a liquid glass strip to the side"): the masthead reads
    THE WIRE / FOR YOU; under the deck a two-column layout. THE FEED (left,
    up to 760px): the permalink focus and the composer as glass panes
    (GlassPane.jsx), then every post as a CARD — avatar · handle · time
    (the permalink) · the caption header · the text · the action row
    (LIKE / SAVE, EDIT / DELETE for the author). The cards are the
    header's pill glass, NOT refracting panes: sixty lensing panes in one
    column would be a scroll cost. Pictures and video take the same card
    the day the media pipeline lands; the composer's IMAGES / VIDEO modes
    stay honestly coming-soon. THE RAIL (right, 300–380px): THE HOTLIST's
    ten booths in their own glass pane (compact rows, the same links and
    the same booth-visit attribution, the APPLY line), then WHO TO FOLLOW
    (pane), ASILUM MAGAZINE (pane), AD SPACE (two dashed slots stacked),
    THE READING ROOM (quietest, no pane), REPORT AN IMPERSONATION (pane).
    Under 960px the rail stacks beneath the feed. The old page order —
    masthead + live folio → composer → the floor → WHO TO FOLLOW → THE
    HOTLIST → ASILUM MAGAZINE → AD SPACE → EXTERNAL DISPATCHES — survives
    as the reading order of feed-then-rail.
    The graded descent by TYPE SCALE survives (.elmast masthead;
    .elh2 21px → .elh5 9.5px grey), as does the magazine furniture at
    zero height cost (field, folio, gutters, colophon of live
    counters).
- PROFILE is standard social format (owner order, Aug 12: Grailed ×
  Twitter × MySpace, legibility first), REBUILT IN LIQUID GLASS on 9 Sep
  (owner: "the account page looks a little empty — instagram mixed with
  myspace mixed with grailed"; every pane is GlassPane.jsx, the shared
  `.lgpane` recipe of the passport's pane): the IDENTITY PANE (Instagram —
  banner, the avatar over its edge, name in Michroma / handle / bio, the
  counts as big numbers: posts / following / brands, FOLLOWERS "—" because
  nothing measures it) → a two-column layout: THE RAIL (MySpace — ONE pane,
  01 ABOUT ME: the bio, THE PASSPORT IN PREVIEW, then handle / member since
  / pieces in the closet / a room link. The owner cut the TOP HOUSES,
  PEOPLE and FIT ON FILE panes the same evening: "remove the left side bars
  and just leave the about me, and in the about me there should be a
  preview of the user's passport". The preview is PassportPreview.jsx — a
  miniature of the /board document in the document's own classes (strip,
  nation line, photo, the data page's key fields, the machine zone, the
  Paris hologram beneath) drawn from the SAME real state, the strings built
  by lib/passport/document.js for both surfaces so they can never disagree;
  one link to /board) and THE SHEET — ONE tab row (Michroma
  words, the current one red) over a glass pane holding everything: POSTS
  as a square grid (a server post's square is its permalink; a device-only
  copy is labeled pending or held) / CLOSET (Grailed — the bag's history as
  a grid of pieces with picture, title, house and source, the colour /
  origin / fit lines, price; the ORDERS link below) / BRANDS / WARDROBE /
  ROOM (the MySpace personality editor) / SIZING / ACCOUNT (sign-in,
  connections, follows, people search; /profile#access opens it). Controls
  inside a pane are the header's pill glass.
- SETTINGS is the rack (owner order, Aug 12: old music-making software):
  numbered hardware modules — 01 APPEARANCE / 02 ASTERISK / 03 IDENTITY /
  04 DATA / 05 LEGAL — heavy top rule + hairline channel rows, engraved
  Michroma labels, OSD module numbers, decorative screws, and LEDs that
  reflect ONLY real state (guidance, observation). ASTERISK's controls
  (guidance toggle, observation, model reset, dashboard + control-room
  links) live on module 02; identity still has one home on PROFILE and
  module 03 just points there.
- Feed cards are Grailed-cut: square floating images (no border, no card
  box, no hover bubble; radius 0 unless the owner tunes --ed-img-rad),
  tile aspects vary per item over the shared 8-ratio table in
  lib/client.js (aspectFor — the ONE aspect source for every grid). The
  red reach frame and ◉ INSPECT badge survive.
- Two user-switchable interfaces (Settings → Appearance, localStorage
  asilum-model): 01 MODULE RAIL (instrument stack) / 02 ORB HUB (pill nav,
  softer surfaces, [data-model="02"] variants — rebased onto the top-nav
  shell). Structure changes; palette follows the theme system.

## Passport UV page (redesign/passport-uv, owner inspo: Swiss passport under UV)
The PASSPORT document on /board renders as a page under blacklight —
`app/components/PassportSecurity.jsx` + the `.ppuv/.ppterrain/.pv*` layer in
globals.css. Header: registration crosses, plus-pattern ridge, "01" numeral
(hidden ≤760px), nation line "ASILUM MAGAZINE * FASHION PASSPORT" (doubled glow), trilingual
type "PASSPORT · パスポート · PASSEPORT" above the photo, *ASILUM microprint.
Hologram (owner iteration 5): REAL PARIS — actual OpenStreetMap road
geometry rendered full-bleed across the document. Data pipeline:
scripts/fetch-paris-roads.py → public/paris-roads.json (~525 KiB; © OSM
contributors ODbL — credit rendered in the map window). Layers: major
roads 14 km radius, secondary 14 km, full street core 4.6 km, building
footprints 1.2 km as very thin NON-glowing outlines. Every road traced as
a line; NO street names. 215 red text-style asterisks mark intersections
where >= 5 road arms genuinely meet, computed from the road graph
(junction clustering collapses roundabout plazas like l'Étoile to one
star). Two masked copies (.ppholo): over the data page glow-FREE at ~0.13
opacity; the lower window full opacity + heavy glow. Document proportions
lock to a U.S. passport data page (aspect 125/88 ≥900px): photo 148×186
centred on the left edge under a four-language stack (PASSPORT /
パスポート / REISEPASS / PASSEPORT), three-column field grid; the MRZ sits ON THE DIVIDER between the data page and the map window (dashed above+below, 21px OSD, letter-spacing stretched to span the full width) and encodes REAL counters: P### pins linked (items across the bearer's boards), B### purchases raised (tickets), A### device area code in time (UTC offset minutes), plus the account number. Microprint at the very bottom edge. Registration marks on the top strip are six-armed asterisks (same placements as the old pluses); no page numeral. Re-run the fetch script to refresh the
map; the component only reads the JSON. Data page is U.S.-style and REAL only: username from
the bearer's profile, TASTE CLASS = ASTERISK's one-word read of the
conviction weights (lib/brain/taste-class.js — 12 classes: DARK, STREET,
ACTIVE, PREPPY, PROFESSIONAL, MINIMALIST, ROMANTIC, AVANT, ARCHIVIST,
UNDERGROUND, TECHNICAL, OPULENT; UNCLASSIFIED when no signal), SEX X (never collected — never invent), COUNTRY OF
ORIGIN = device locale region, MEMBER SINCE stamped once locally
(asilum-member-since, local-time anchored), ACCOUNT NO = the database uid,
which the TD3 machine zone also encodes (document + personal number
fields); summit marker = top conviction. MRZ data runs glow green,
chevron filler red; MRZ scrollbar hidden but scrollable.

## UPLOAD — teach Asterisk (redesign/upload-station)
/upload is the passport's training annex, riding under PASSPORT in the nav
(sub-link UPLOAD ⇪). Reached from the document itself: the UPLOAD TO
MOODBOARD button at the passport's foot warps the live Paris hologram out
of the page (.ppwarp clones the .ppholo-b SVG and expands it from the
terrain rect to the full viewport, 600ms, reduced-motion skips straight to
navigation) (1s, soft settle) before routing — and /upload KEEPS that map as its
page background (.gxmap via shared app/components/ParisMap.jsx, which
PassportSecurity also imports), so the hand-off reads as one continuous
surface. The page is the OS's one Gen X Soft Club surface (design law:
curves, haze, milky glass) — .gx-scoped only, the instrument skin
elsewhere untouched. The warp starts as an EXACT overlay of the
document's own map (same box, same scale), grows the frame to the
viewport while a base veil + the landing gradient fade in and the map
settles to 0.5 opacity — pixel-continuous at BOTH ends; heavy glow
filters are suspended during motion for cleanliness. Layout: do-column + watching rail. Main column: 01 THE WALL —
a Pinterest-style moodboard (drop pieces/fit pics/vibe images → on-device
tiles in localStorage asilum-upload-board, palette v0 + filename-word
training per batch) / 02 YOUR PEOPLE & PLACES — favorite celebrities,
cities, movies, singers (localStorage asilum-favorites; every name is a
real mood_board_uploads record; singers hit the curated music map and
train on descriptors WITH a told readback; unmapped names are honestly
"on your record") / 03 DESIGNERS & LEANINGS — designer input uses the
real brand path (search match → follow via setFollowBrand → train on the
brand's dominant tags, same as DISCOVER) plus lean-toward style words and
the ten canonical chips. ASTERISK LIVES ONLY HERE (owner decree July 27): the passport page
carries NO asterisk instrumentation — no analysis bus, no guidance
toggle, no brain band; /board keeps the document + STAMP THE PASSPORT
composer (which now hosts the floating plug-in pills:
Pinterest/Spotify/Apple Music/Letterboxd, .soon-skinned honest
coming-soon controls with a gentle idle float) + the moodboard viewer. The sticky right rail is ASTERISK's home on the page: the living dock form (shared
app/components/AsteriskDock.jsx, extracted from the shell; upload cycles
LISTENING/LEARNING/…) above the BrainViz word-sphere, the live conviction readback, the
session heard-log, RECENTLY FORGOTTEN, and the two-step Reset Brain
(full-amnesia) control — all relocated from /board. All signals are real training; nothing simulated.

**THE STATION IN LIQUID GLASS (owner order, 9 Sep 2026).** /upload speaks
the FRONT COVER's language now: a bold Michroma masthead (`*UPLOAD` /
`STATION`, `--ed-fs-gxmast`) with the cover's right-hand meta block and a
ledger line whose counts are the device's real state (pins, names, houses
followed, cities bought from); a hairline field behind the content
(.gxlines, hand-placed, deterministic); numbered kickers (a big faint
numeral + a Michroma kicker + a note); Warp-sleeve credit stacks through the
shared .cclbl/.ccval; gutter marginalia on the rail; a colophon. A STATION
INDEX under the masthead — four pills of the header's glass — jumps to the
sections (01 THE WALL / 02 PEOPLE & PLACES / 03 DESIGNERS & LEANINGS /
04 THE GLOBE). Every card is the passport's pane (`.gxcard.lg`, one
`useLiquidGlass` per card at strength 0.5, its own filter id): no border,
55% tint, the edges lensing in Chromium, the gloss and the pointer's shine;
the inputs, buttons and chips are the header's pill glass rather than
filled boxes. No page-side bend on these cards: what lies under them is the
fixed Paris map, and filtering a viewport-sized SVG per card per frame is
the glitch of trap 151 — Safari gets the pane without the bend.
THE ASTERISK DOCK IS GONE FROM THE RAIL. In its place THE PURCHASE GLOBE
(app/components/PurchaseGlobe.jsx): a wireframe earth as A HOLOGRAM OF
GLOWING LINES (9 Sep, later the same day — the owner: "get rid of the ASCII
structure … a Star Wars hologram made of glowing lines"; the first cut was
a cage of `- / | \` glyph chains after the Codec's GPS globe) — latitude
rings every 22.5° and twelve meridians as stroked polylines, each a pale
hot core (--ink) inside a soft bloom of the signal colour (three stroke
passes per depth bucket, no canvas shadowBlur — trap 158), the far
hemisphere dimmed to a see-through cage, a faint rim, a faint polar axis,
the Codec's centre reticle drawn as a ring and a pointer — under the
projector's treatment: a flutter, a slow band of light rolling down the
picture (source-atop, so it lights only the lines), the odd horizontal tear
where two or three slices slip sideways for a few frames with a brightness
dropout, and the dock's scanline banding. Markers are drawn discs in a red
bloom (near side) and dim rings (far side). Drag to spin, inertia on
release, arrow keys turn it, off-screen it pauses, reduced motion gives one
still frame. Sized by `--ed-gx-globe` (250px). MARKERS: one per city a
piece on the bearer's record came from — `/api/orders?places=1` reads the
caller's PAID sale orders and purchase tickets reported bought/kept/returned,
each piece's house → its city through lib/asterisk/houses.js → a coordinate
from lib/asterisk/places.js (curated, provenance-stamped, one row per city
the origin record names; tests/purchase-places.test.js holds the two files
together). The front-most marker is named on the canvas and the readout
prints its fix in D.MM.SS (LAT 35.40.48N · LONG 139.41.24E); a house the
record cannot place is listed as NOT PLACED, never guessed; nothing bought
reads NO FIX — the globe still turns. Below it the cities as numbered rows,
then the credit stack (RECORD No. / PIECES PLACED / CONVICTIONS HELD), then
the conviction readback, heard-log, RECENTLY FORGOTTEN, the links (now with
ORDERS →) and the Reset Brain control, unchanged.

**Same day, the owner's second round.** The map settles to 0.4 (first 45%
less, then "settle at 40%"); the station index is GONE ("they make no
sense"); a solid 7px rule (.gxthick) under the masthead and two more thick
hairlines + two verticals in the field. **THE MASTHEAD IS EVERYWHERE:** the
shared `.headline` is set like the cover's masthead (Michroma 700, fluid
38–84px via `--ed-fs-headline`, tracking 0.02em, line 0.94, uppercase) and
the eight destinations render it through `app/components/PageMast.jsx`
with a faint second line (`.headsub`) — the cover's own words for that
subsystem (YOUR CURATED EDIT / POSTS + THE HOTLIST / TRAIN THE BRAIN / THE
OPEN INDEX / CONTROL PANEL / TONIGHT'S LOOKS / FULL READ); ORDERS has none.
**ICE IS A COOL SKY-TEAL** (owner: "the opposite of the phosphorus green is
this scary dark negative blue — a cool tealish sky blue"): --ink #007896,
--sig #0078a3, --p2 #0a74bb, every glow/lamp/line/shadow re-tinted to the
same hue. The AA law (Aug 16; tests/theme-contrast.test.js) caps lightness
near 0.32 at this hue — a pastel sky cannot pass it; relaxing the law is the
owner's call. **THE PLUS FIELD** (.os-plus in shell.js): a fixed layer
carrying a holographic sweep in the theme's own hues (--holo: dark = green/
blue/purple/red/fuchsia; ice = sky-teal/pink/yellow/blue/peach) seen only
through a mask of small pluses (--plus, an 8/11/15px plus at 64/89/118px
tilings, offset so it reads scattered), opacity `--ed-plus-op` 0.05 —
"hardly visible" by order. Static.
**Softened the same day** (owner: "a softer blue — ice shouldn't feel so
negative, it should feel soft and icy and frosted; selected buttons shouldn't
turn dark"): the ice accents came DOWN in saturation rather than up in
lightness — a desaturated slate-sky at hue 205: --ink #3c759d, --sig
#3075a6, --p2 #3f73a6 (all ≥4.5:1 on --bg, the AA law kept). A selected,
filled or hovered control on ice is FROSTED — pale sky fill, blue text, the
ink glow (the grouped `[data-theme="light"]` rule at the end of globals.css
over every `background: var(--ink)` state) — never a dark block. The plus
field is two tilings (96/137px), not three.
**Then THE CYAN GLASS WORLD** (owner, 9 Sep, three references: a Y2K
chrome figure in aqua light, a Tron cyan glow, the VAIO store of clear cyan
glass — "don't fully remove the slight accents of purple and pink"): ice is
a cool cyan-white ground (`--bg` #e6f4fa) with CYAN glass tints (`--glass`,
`--glass-pill`, `--glass-shadow`), cyan lamps, a brighter cyan glow on every
lit word and frosted control (rgba 0,190,235), chrome sheens kept white; the
ink and the signal are the passing cyans (#0c7795 / #0d779e), the secondary
accent a soft PURPLE (#805ac1, 4.50:1) so the purple voice stays; the wash
is two aqua hazes plus a faint pink and a faint purple, the blobs aqua /
pink / purple / aqua, the plus sweep cyan-aqua-pink-purple, the vignette
cyan. The AA law is kept throughout.
**Ice: the header's words are just words** (owner, 9 Sep, from a Safari
recording where a hovered word grew a dark grey pill): in ice a hovered or
current header word has NO pill and NO glow, the lamps under the glass are
off (`.glass-light` hidden), no pointer shine or rim catch on the pane, no
meniscus; the current destination keeps its red LED and red bar; the
frosted selected controls carry no glow. Phosphor keeps all of it — every
rule sits under `[data-theme="light"]` (the grouped block at the end of
globals.css). "DO NOT CHANGE DARK MODE."
Then "give the same header bar treatment to dark mode" (same day): the
block is theme-agnostic now — no pill on a hovered or current header word,
`.glass-light` hidden, pane spot / rim catch / lamp-hot transparent, the
meniscus off, in BOTH themes; the current destination keeps its red LED and
red bar. On phosphor a word's resting light (the teal law's smear, now the
token `--word-smear`) stays and a hover changes nothing; on ice the header's
words carry no glow at all.
**Safari, 9 Sep (owner: "no liquid glass rainbow or bezel warp, and it's
laggy").** WHAT SAFARI CAN SHOW: never the header's own bezel (WebKit runs
no SVG filter as a backdrop-filter — trap 150); only the PAGE-SIDE BEND,
where content passes under the strip's bottom edge while scrolling. The
bend's selector now reaches the new pages (`.headsub`, `.gxmastblock`,
`.gxthick`, `.gxhead`, `.gxfoot`, `.rkhead`, `.rkrow`, `.pfsec`, `.otfrow`,
`.ppsec`, `.demobanner`); an element over 260k px² (`BIG_AREA`) passes
unbent (WebKit re-rasterises the whole element through three displacement
passes per placement), and placement runs on alternate scroll frames. THE
LAG WAS THE GLOBE: a canvas shadowBlur on each of ~700 glyphs cost /upload
37ms a frame at idle (16.7 elsewhere) — the cage draws with alpha alone
now, at half rate (a drag draws every frame), and /upload idles at 17.9 /
scrolls at 18.9 in Chrome. Safari itself unmeasured. The hologram of lines
that replaced the glyph cage the same day draws in 0.11 ms against the
cage's 0.47 (200 draws of the 500px bitmap, headless Chrome, both themes).

THE PASSPORT → /UPLOAD BUILD LANDS SOLID (9 Sep): the roads still assemble
chunk by chunk from the document's edges in 90 ms pulses, but a fresh
major/secondary chunk now lands as a HOT SOLID STROKE — the same polyline,
a hair wider at full alpha on the transient canvas (`.ppbuild-hot`, which
wears the roads' glow) for 80 ms before it settles into its layer. The
ASCII dashes on the scanline grid are gone (app/components/roadBuilder.js).
The red `*` stars are the brand's asterisks, not ASCII structure — kept.


## The header on phosphor: words, always lit (9 September evening)

Owner: "on dark phosphorus instead of each button lighting up when I hover
over it, all the buttons should be reduced to only the words and they
should all always glow." Dark only — ice keeps the 9 Sep words-without-glow
treatment. The destination row carries no icons, no LEDs, no meta line;
SEARCH / BAG / SIGN IN drop their glyphs; the sub-pills (ORDERS →, STATS →)
are plain Michroma words; every word carries the full `--glow` at rest and a
hover changes nothing; ORB HUB's pills are transparent behind the words. The
current destination is the one word in RED with the red glow — the tab
rule's own marker (`.tab.cur`), the red law's "you are here" — so the red
bar and LED are gone with the icons. The block sits at the END of
globals.css under `:root:not([data-theme="light"])`.

## The words are the buttons — every button, every page, both themes (10 September, MODEL)

Owner: "the header buttons should all match. take away the little symbols,
only keep the word; however when I hover over the word the little
description should appear. I want the spacing to match ice light. all the
buttons in every tab should be treated with the same (font glows, only the
words are the buttons) rule." Built as a model on `ui/words-are-the-buttons`;
the owner judges.

**The law.** A button is a WORD in the signal colour carrying the site's
word smear — no pill, no border, no fill, no glyph, no LED. Hover: the word
brightens to the ink and keeps its light. Selected / current / on
(`.active`, `.on`, `.cur`, `aria-pressed`): the word is RED with the red
smear (`--word-smear-r`) — the tab rule's "you are here". Disabled: grey,
unlit. The red-law words (BUY, HOME, coming-soon `.soon`, the clear pill)
stay red. Ice runs the same rule through its own tokens (the blue smear).

**The header, both themes.** The seven destinations, SEARCH / BAG / SIGN
IN, MAIL and the sub-words (ORDERS →, STATS →) share one voice: Michroma at
the destination size, the 0.4px stroke, `--sig` with the full `--glow` on
phosphor and NO glow on ice (the owner's ruling from the Safari recording).
Icons, LEDs, the red bar and the corner glyphs are gone in both themes; the
current destination is the one red word. **The spacing is ice's**: 26px of
padding a side puts the words where ice's icon + LED + word sat, a ~56px
word-to-word gap at 1440 (measured: FRONT COVER 204/177 against ice's
197/179 before). **The description** (`.nmeta` — LIVE EDITION, OPEN INDEX…)
rises under the hovered word: absolutely positioned, out of the flow, 7.5px
grey, fading in over 180 ms; the compression rules' `display: none` is
outranked so it appears at every desktop width; it is off under 760px.
The 9 Sep evening PHOSPHOR block was retired (its comment stays in place).

**Everywhere else** one `[data-theme] :is(…)` list at the END of globals.css
names every button family (`.btn` and its ghost/active/wide/soon, `.fitbtn`,
`.followbtn`, `.platform`, `.chip.clickable`, `.outcomes button`,
`.unitpick button`, `.achip`, `.apill`, `.wchip`, `.gxbtn`, `.gxchip`,
`.ppupl`, `.ppupload`, `.dhint`, `.mailmore`, the tab strip, the card and
post action rows, the text buttons…) and strips the box — `:is()` takes the
specificity of `.btn.ghost.active`, so the list outranks the frost rule of
ice, the glass-pill rule of `.lgpane`, and the ink-glow box rule by cascade
order. The segmented rows (unit picker, card actions, tabs) lose their
dividers with the boxes. Verified by a computed-style probe over ten pages
in both themes: no button outside the header keeps a background, a visible
border or a shadow (the passport photo frame, the passport preview tile
and the drop zone are not buttons and keep theirs).

## Copy law (17 August, owner directives)

- **The app is a PERSONALIZED FASHION TERMINAL.** "Fashion intelligence OS" is
  retired everywhere a reader can see it.
- **The engine is "The Asterisk system"** in prose. Chrome labels that name the
  destination or the control — the `/asterisk` route, "ASTERISK GUIDING",
  "ASTERISK CONTROL ROOM", the compact toggle — keep the bare word on purpose.
- **No public mention of the learning bridges.** Six of them run the ranking and
  `lib/brain` names them freely; nothing a reader sees may. They had reached the
  site description, the feed's routing line, the top ticker and a status chip.
- **The ticker, with nothing followed**, carries three house lines: "ARE YOU
  SEEKING A S I L U M", "DISCOVERY - COMMERCE - COMMUNITY", "DISCOVER FROM
  ARCHIVES ACROSS THE WORLD". The spacing in "A S I L U M" is deliberate. A
  followed brand or reader still wins the ticker.

`tests/copy-law.test.js` enforces all four.

**Verified against the rendered HTML, not just the source (17 Aug).** All fifteen
destinations were fetched from a running server and their markup checked: every
one returns 200, and not one contains the word "bridges", the phrase "fashion
intelligence", or a bare `Asterisk <verb>`. The unit test reads source files; this
checked what a reader is actually served, which is the claim that matters.

## 25 Oct 2026, later — the hold menu, the blocks, the envelope, the model

- A post's PASS lives in a HOLD MENU (PostCard.jsx HoldMenu): hold the
  card LONG_PRESS_MS (lib/disc.js, the one clock), right-click, or press
  the visually hidden OPTIONS key; PASS and, on a real post, COPY THE LINK;
  Escape, a tap outside or CLOSE puts it away. A piece and a song keep the
  × on their face.
- The chevron runs are gone. BLOCKS (lib/feed/blocks.js, Blocks.jsx) stand
  in for text: BlockText loads text in behind a run of even blocks (the
  run is the next characters themselves, transparent over a block
  gradient, so nothing reflows); BlockLine folds a line into a block per
  word. The block is `--blk`, the ink a shade back. The MRZ line stays.
- Glyphs: the comment bubble's tail is at the right; MESSAGES is an
  envelope; heart, bubble, stamp and share share the 17.6 span; the post's
  four actions are four equal grid columns.
- Every card in the grid takes `--cardpad` / `--cardpadx` and `--inner-r`
  (set on `.fcell`), so the post, the piece and the place sit alike.
- The model's photographs are free-use reference photography on white
  (public/model/credits.json); a place that carries one wears it across the
  card with the words on a scrim at its foot.

## 25 Oct 2026, the same evening — no ×, words over photographs, cuts

- No × on any card's face: a piece (page.js FragmentCard) and a song
  (SongCard.jsx) hold the menu too, through HoldMenu.jsx's `useHold`,
  `HoldMenu` and the hidden `HoldKey`; a piece's PASS is still `onPass`,
  the brain's signal.
- A piece's photograph fills the card; `.pchead` rides its top and
  `.pcfoot` (name, size · price, the DEMO line) its foot, on scrims in
  `--on-media`; a small piece's `.pieceline` does the same.
- `.fgrid { --fgap: 6px }` (8px from 760px); `.fcell { --cardpad: 3cqw;
  --cardpadx: 3.6cqw; --inner-r: clamp(8px, 3.2cqw, 18px) }`.
- The globe glyph carries its equator.
- A sample author carries `avatar` (a free-use photograph); `Avatar` takes
  `src` and draws `.uavatar.uphoto`.
- A red rule is a `<Cut>`: `.cut::after` is the line, `.cutband` the
  22px band whose `backdrop-filter: url(#cutwarp)` (CutDefs, once on the
  page; `html[data-cut="1"]` only where `canRefract()`) bends the backdrop
  toward the line from both sides. Reduced motion drops the band.

## 25 Oct 2026, later still — the stage, the hairline cut, Michroma's glyphs, the strip

- A media post is its photograph: `.p2stage` holds `.p2media` (absolute,
  the whole card), `.p2head` over the top and `.p2foot` (credit, caption,
  the four actions, the second rule) over the bottom, on scrims, in
  `--on-media`. A words-only post keeps its paper.
- `.p2rule` and the Cut's line are the deck's groove — `color-mix(in srgb,
  var(--ink) 14%, transparent)` (`.cccut`), 1px — never red; over a
  photograph `--on-media` at 55%.
- Icons.jsx: every glyph but `feed` and `globe` is wide, squared and
  evenly rounded (a squircle for search, post, account, disc; rx 1.6–2.4
  on rects; the 17.6 span), as if cut by Michroma's hand.
- The BRDCST strip (`.bstrip.withphoto`): `.bsimg` clouded (blur 3px,
  saturate .45) under a shade veil, the badge, `.bsname` large and
  `.bswhen` (where · when) in white, `.bspass` the × as drawn; it spans
  four half-rows; a tap opens the `brdcst` popup (BrdcstSheet.jsx), the
  photograph clear.

## 25 Oct 2026, last that night — the logo's bar, everything floating, the floating popup, the ice ground

- Wordmark.jsx: `.wmbar` is a row of `.wmblk` blocks (`--w` bar-heights
  wide, `BAR` as drawn), the last `.wmblk.lit` in `--wm-lit`; no line, no
  square, no chevron run.
- `.card.piece.v-hero .pcacts` floats at the photograph's foot (white, on a
  shade), `.pcfoot` above it; a post with an event (`.withevent`) floats
  its `.brdcst` at the foot of the photograph, the caption above it.
- Icons: `search` is a circle lens; `heart` narrower; `account` a circle.
- `.sheetscrim` centres; `.sheet` is `min(var(--cc-w), 100vw - 20px)` wide
  with a 28px+ radius; `[data-popup] .main` is blurred 14px and
  desaturated — the page clouded.
- `demoImageFor(item)` (lib/model/pieces.js) lends a seed record a free-use
  photograph for its category, by id; the Feed and the LISTING popup use
  `img || demoImageFor || thumbFor`.
- The light `--bg-grad` ends at `#edf4f9`, never white.

## 25 Oct 2026, the last word — thin, faint, flat

- `.p2acts`: no `.p2n` counts; `opacity: 0.78`; the buttons 8cqw; Icons.jsx
  `strokeWidth: 1.15` everywhere.
- Scrims: head 24%, foot 34% of `--shade` (a piece's 30%); a words-only
  post's `.p2foot` wears a 10% gradient too.
- Strip.jsx: `.strip` scroll-snaps sideways, `.stripcard` is `height:
  100%` with `aspect-ratio: var(--asp)`; the motion row 9:16 (`stripRows`:
  ceil(cols × 1.5), capped at 12). (Late that night a post carousel went
  back to Fig20.jsx, bare: `.card.f20post`, no housing; the housed
  carousel's `.type-carousel`, `.p2count` and `.p2media .strip` are gone.
  Then: CAROUSEL and RAIL are 5x14 Figure 20 cells with a `.f20head` line —
  the author's name, or RECOMMENDED VIDEOS; Fig20 turns the stacks
  `rotateY(-sgn·72°)` about the outer edge (tucked outward) and lays flat as
  many cards as fit at the stage's full height (one in a post-sized cell);
  Strip.jsx and its rules are deleted.) Last: the carousel is the post
  card itself — `type-carousel f20post withmedia`, Fig20 (1:2 cards) in
  `.p2media` filling the cell, `.p2head` and `.p2foot` floating over it,
  `background: none` on the card, head and foot. MotionRail wears the same
  classes, VIDEOS YOU MAY LIKE as its `.p2user`, and `<Caption key=…>`
  (exported from PostCard.jsx) for the centre video.
- Wordmark.jsx is `.wmimg` (`/model/logo.jpg`, the owner's artwork cropped
  to the mark) with the name visually hidden; `.wordmark.brandfix` blends
  multiply (screen, inverted, in dark).
- `.sheet::after` and `::before` are `content: none`; the bloom is gone
  from the popup's shadow. The fixtures alone keep the rainbow.

## 25 Oct 2026, the owner's mockup — the popup, the search, the faces, the stills

- Popups: `.sheetscrim` centres over `--scrim` (light: `#1d3446` at 74%)
  with the page blurred; `.sheet` is a 36px-radius square, light face
  `linear-gradient(#f2f9fc, #e2eff6, #cfe3ee)`, a teal hairline border.
- The search (`.sheet.deckrise`, set when the top view is "search"): the
  scrim aligns to the end with `padding-bottom: calc(var(--cc-row-h) +
  var(--cc-bottom))`, the sheet's bottom corners square — it rises out of
  the deck.
- Faces: `--mich` Michroma (words), `--helv`/`--serif` Inter (body),
  `--mono` Share Tech Mono (small print: the search's subtitle, tabs,
  fine print).
- The ground: `--bg-grad` ends dark blue (`#27465e`) at the top and the
  bottom, ice blue between.
- Cards: `.pcfoot` is the only scrim on a piece (the actions float on it);
  no `.p2rule2`.
- The logo: `.wmimg` is `clamp(150px, 40vw, 230px)` wide, top left.
- Stills: `stillFor(key)` (lib/model/stills.js) is every picture — posts
  (`sampleImage`), authors (`avatar`), places (`image`), demo pieces
  (`demoImageFor`); `public/model` keeps only the logo, the overview's
  portrait and the motion pattern.

## 25 Oct 2026, the next round — the deck's ad bubble, the plain head, no tags, the tiles

- `.ccad` holds AdStrip on the deck under `.ccrow`, above `.ccgrill` (moved
  from above the row the same night: "beneath the buttons and above the
  vent"); the pill is 52u, 8u clear of the grill, 18u into the row's foot; `--ad-h: calc(var(--u)
  * 64)`; `.ccenter` and its searching height and `--cc-row-h` include it.
- `PageMast plain`: THE FEED without the asterisk; no `sub`, no `.ctmeta`,
  the `.demoline` visually hidden; tabs FOR YOU · FOLLOWING (+ the craving
  key); no WHAT'S NEW.
- No ModelTag SAMPLE, no "SAMPLE FIXTURE", no DEMO word or flag, no
  OriginSticker on the Feed's cards.
- `.withevent`: the card is transparent; `.p2stage` top-rounded and
  bordered, `.brdcst` a separate paper block 4px below, bottom-rounded; no
  `.brdcstrule`, no `.brdcstast`.
- `--cardpadx: 5.5cqw`; head and foot insets 4.5cqw / 4cqw.
- The piece card's foot is one column (same night: "uniformly orient
  everything on the media card"): `.pcfoot` holds the name, `.pcrow` and
  `.pcacts` in flow, `gap: 2.5cqw`, insets 4.5cqw like the head; the action
  icons sit on the text's edge (each button's slack pulled out by a negative
  margin). Nothing is pinned over the foot. The Feed's piece cards draw
  `thumbFor(it, { bare: true })`: no initials, no tag word under the words.
  (28 Oct 2026: the hairline that sat here, a refracting `<Cut className="pcrule" />`, warped the
  card, the owner said, and is gone) Formerly a hairline sat
  between `.pcrow` and `.pcacts`.
- SIZE and SPANS (lib/feed/tetris.js) on a 6 / 12 / 18-column grid
  (feedColsFor), rows sized from the screen (`.fgrid` grid-auto-rows: six
  rows and five gaps are `--ed-feed-large`, 80svh): LARGE 6x6 (posts, with
  or without a BRDCST, CAROUSEL, RAIL), MEDIUM 3x3 (LISTING hero, TRANSM
  note), SMALL 3x2 (SONG, PLACE square), WIDE 6x2 (BRDCST strip); AD 6x2
  adwide | 3x3 ad. One size a kind. tetrisPack lays TILES (TILE = 6): a
  large card, or a fill — 2 mediums beside 3 smalls, 4 mediums, 6 smalls,
  3 wides, 2 wides and 2 smalls, 1 wide and 4 smalls — the fill whose cards
  stand earliest in the queue; the kinds spread by error diffusion,
  checkered on even widths; the end is laid on lanes, wides first. The
  braid (lib/feed/types.js) gives each post a tile's worth. The battery in
  tests/feed-tetris.test.js: zero holes and every two-screen band mixed.
- `.card.placecard.withphoto .placeopen > .placeglobe` keeps the globe
  absolute at the bottom right (a plain `.placeglobe` lost to the rule that
  lifts the photo card's children); the name and type pad right to clear it. AD 6x2 adwide | 3x3 ad, standing
  in for a missing medium or wide in a fill, or laid by `fillAds` into level
  gaps at the feed's end, never lower than the feed;
  `AdSpace.jsx` draws `.card.adspace`, a dashed open placement.
- `tileFor(key)` (stills.js) draws the ten-tag palette; `inkFor(hex)` picks
  `INK_LIGHT`/`INK_DARK` (85%); cards set `--on-card`, and `.fcell .card`
  maps `--on-media` to it. A piece uses `thumbFor` + `thumbBase`.
- `.wmimg` is `clamp(78px, 21vw, 110px)` wide.


## 28 Oct 2026 — the new logo, and the Masthead's solid glowing line

(SUPERSEDED the same day by THE TRON MARK, at the end of this file: the layers
and inks below are the logo's history. What still stands: the artwork's type,
geometry and glows.)

The owner's artwork (Procreate; `docs/brand/asilum-logo-2026-10-28.jpg`):
"the asterisk should be in helvetica regular size font size 131 and
"ASILUM" is in michroma regular size in font size 161 and tracking 5% with
-15 kerning. the thick solid oblong white line should glow a stark white
however the solid black text should not, the asterisk and the solid white
line should have the same glow".
- `Wordmark.jsx` sets it as TYPE in an SVG (sharp at every size), no
  picture: two layers on one box, `.wmlit` (the Helvetica asterisk and the
  bar) under `.wmtype` (the Michroma word, whose S laps the bar as drawn).
  Geometry is `WM`, in the units of the word's 161, measured off the
  artwork: every letter's origin (Procreate's tracking and kerning come out
  at −15.5, −0.096em, between every pair), the asterisk's top on the
  capitals' line and its left on the A's, the bar flush under the baseline,
  82.6 deep, from 3.3 to 976.9 across — past the M. Measured against the
  artwork at the same scale: the word IoU 0.917, the asterisk 0.851 in
  Helvetica (0.598 in Helvetica Neue, so `--helvetica` puts Helvetica first).
- ONE GLOW, white (`--wm-glow`): the asterisk, the bar and the Masthead's
  line wear it and nothing else does; the word never glows. This glow is
  the owner's and shows in both themes — the exception to "light never
  glows". Colours: `--wm-ink` the artwork's near-black #001512 in light, a
  flat phosphor mint #c4f2d6 in dark; `--wm-star` the house red (`--warn`);
  `--wm-bar` white.
- Placement is the old logo's: the left edge on the deck's, the capitals as
  tall as the old ones (`--wm-u` = the old 129/900 of `--wm-w` over 120.75),
  the baseline where the old word's foot sat.
- THE LINE (`.mhline`) replaced the stamped line of graduated blocks: one
  solid thin white line (`--mh-line-h`, 2px desktop / 1.5 phone) in the same
  glow, from the bar's end (tucked a pixel under it) to the globe's centre,
  its top on the word's baseline — the bar's top — so the two read as one
  edge. `.mhstamp`, `STAMP*`, `--stamp-blue` and the logo masks are gone;
  `--stamp-recess` stays for the wheel's marks.
- Then, the same day: "the asterisk must glow red" — `--wm-glow-r` is
  `--wm-glow` radius for radius and strength for strength in `--warn`, on
  the asterisk's own layer (`.wmlitstar`); the bar (`.wmlitbar`) and the
  line keep the white. The logo keeps its size but lifts "more in the
  corner": its bar's foot now sits the stamp gap above the line ("the line
  should sit under the thick logo line"). The line runs from the logo's
  left edge to the END of the Passport's hit box, just under the keys'
  glyphs, BROKEN (`--mh-break`, 14 units) where two keys' hit boxes meet
  and where the first key begins; a faint cut (`.mhcuts i`, the deck's
  `.cccut` hairline, 65 units) stands between keys. The keys are measured
  (`lib/mastline.js` lays the stretches; the music circle and the exploring
  key come and go) and the line fades in once laid. The Info Dock and
  Passport keys are 10% bigger (`--mk: 1.1` on `.masthead`).

## 28 Oct 2026 — the ad ticker round the deck

The owner, with the MAD-S player's wrap-round display as the reference
(`ticker-proof/owner-reference-*.jpg` in the session notes): "stretch all
the across the center fixture, so if the center fixture was a 3d object the
add ticker should stretch all around it".
- `AdStrip.jsx` is a heavily clouded track (`--ad-cloud`: smoked glass with
  clouds in it, dark in BOTH themes so the white reads) whose face begins 34
  units in, where the pill began 40 — "ever so slightly lengthened" — and
  whose ends CURL away round the deck's sides: each `.adcurl` turns
  `--ad-curl` (lib/adcrawl.js `CURL_DEG`, 50°) about its hinge in its own
  `perspective()` (a vantage at the track's middle put the far curls
  edge-on).
- The entries no longer swap on a timer: they run as ONE line that crawls
  right to left (lib/adcrawl.js: one sequence a loop, so no seam, at
  `CRAWL_PX_S`), out of the right curl, along the face, fading under the
  label. The band in the right curl is laid in the track's own coordinates,
  so the words run on across the hinge, squeezed as they turn. It holds on
  hover, focus and typing and stops under reduced motion. Measured: 181
  frames in 3 s, the worst 19 ms, no long task.
- Type: Share Tech Mono, regular, `letter-spacing: -0.0875em` (the owner's
  "-8.5 to -9 kerning", Procreate's per-cent of the em — the same unit that
  made the logo's "-15" with "5% tracking" come out at -0.096em), white
  (`--ad-glyph`) with a glow (`--ad-glow`).
- The label is the two status lights and ADs as a NEGATIVE IMPRINT: a solid
  glowing white chip (`--ad-chip`, `--ad-chip-glow`) with the word cut to
  the track's dark (`--ad-chip-ink`) — no longer red.
- What it prints (`lib/placements.js`, `ticker` beside the labelled `line`):
  a BRDCST and a listed event by their title alone; an ad as "AD: " and the
  advertiser's own words (`adLine`; no ad source exists yet, so none runs);
  a device's own promotion draft as an ad marked "(DRAFT)". Each entry still
  speaks its label to assistive technology (a BRDCST is read as sponsored).
- Then, the same day: "i said clouded no black, i just wanted it more
  clouded than the fixture and i wanted the bar to stretch the entirety of
  the fixture … wrap around the whole thing 360 degrees not just stuck on
  the middle, also get rid of those two red squares". The band is frosted
  grey CLOUD (`--ad-cloud`, one for the dark glass and a shade deeper for
  the light, never black, never opaque), and it runs the deck's WHOLE width
  (`.ccad` has no side padding). Each side is a quarter cylinder of radius
  `--ad-r` drawn as `WRAP_SLICES` (6) flat slices (lib/adcrawl.js
  `wrapSlices`: each the band's arc laid flat and squeezed from its left
  edge by its shown width over its arc, dimmed by `--ad-turn` as it turns),
  so the words narrow to nothing at the deck's silhouette and run on round
  the back; the band is continuous through every slice. The perspective
  curls and `CURL_DEG` are gone. ADs sits at the face's left, the words
  passing under it. The two red status lights are gone, and so is the
  `asilum:lamp` event that only they answered. Measured: 181 frames in 3 s,
  the worst 18 ms, no long task, with all twelve slices crawling.
- Then: "why is it frosted dark make it like light grey or something". The
  band is a LIGHT GREY cloud — one `--ad-cloud` for both themes, a haze of
  rgb 196/202/208 to 178/185/192 at 0.62–0.66 under white puffs — and the
  white words keep their glow with a hairline of shade at their edge
  (`--ad-glow`) so they hold on the light grey.
- Then: "we gotta find a way to make the ad text glow or something to make
  it more legible". The words GLOW in a smoke bloom (`--ad-glow`): a white
  core lit by a tight white halo, over a deep slate bloom (three layers,
  dense at the letter, wider and fainter outward) that darkens the cloud
  only round each letter — the band stays light grey and every letter
  reads, in both themes. Chosen from four tried live on the band (trial
  crops in the session notes, ticker-proof/round-4-legibility).
- Then: "obviously with dark mode since everything is dark the clouding can
  be dark because the glow will make it ledgible. i think for light mode we
  can make it black like the logo. also the add square should be red and
  smaller". The band is themed: in DARK a dark grey cloud
  (`--ad-cloud-dark`, never black) with the words white and glowing white;
  in LIGHT the light grey cloud (`--ad-cloud-light`) with the words the
  logo's black (#001512, then `--wm-ink`, now `--wm-hole`), unlit as the logo's word is. ADs is
  knocked out of a small (0.78em) solid red chip (`--warn`) glowing red as
  the logo's asterisk does, its word cut to the band's own tone.
- Then: "fix the corners of the ad bar the rendering of the 3d wrap is kind
  of choppy". Magnified 5x, each corner showed six vertical stripes: every
  slice carried its own cloud and its own stepped shade, and the squeeze
  kinked between slices. Now each side (`.adside`) is ONE smooth piece of
  cloud, matched to the face where they meet, under ONE smooth shade
  (`--ad-turn-c`, eased as 1 − cos of the turn toward the silhouette); only
  the words are sliced, in 16 slices a side (`WRAP_SLICES`), and they fade
  out (`.adsidewords` mask) before the silhouette so no squeezed glyph is
  left as a smear. The crawl still holds 60 fps (worst frame 18 ms).
- Then, the ticker's RULES (owner, 28 Oct 2026): "if there is no ads or
  brdcsts the ticker should collapse and turn into a glowing white line
  that acts like the one on the mast head, broken between the button gaps.
  and the center fixture is allowed to shorten … if the user has no service
  … [it] should open immediatly after regaining service, when a user first
  opens the app the first animation should be the ticker opening".
  `tickerOpen` (lib/placements.js): open only ONLINE and with an ad, a
  BRDCST or the device's own ad draft to carry — a listed event or the
  house lines alone never hold it open. Folded (`.ccenter[data-ad="line"]`)
  the deck is the row alone (`--ad-h: 0`), and one glowing white line in
  the Masthead's glow runs under the keys, a stretch per key, broken at
  every cut between them (ControlCenter.jsx `AD_LINE`). The page loads
  folded, so the unfolding is the first move; "offline" folds it, "online"
  reads the placements again and it opens at once. The bubble's height
  moves in step with the deck's; every open/fold move is ≤ `--dur-3`.
- The bezel (`--ad-rim`, the top and bottom lines) now runs round both
  sides, not the face alone.
- "flowing extremely smooth like a rolex no actual ticking … typed in and
  typed out as its circling": the band glides linear on the compositor;
  only the TYPING steps. The text is on Share Tech Mono's cell grid
  (`monoText`; the dot between entries is the characters `SEP`, not a
  margin); one loop is exactly n cells; a hard-edged mask on every band
  (`--t-out` … `--t-in`, on cell boundaries round each side at `TYPE_DEG`,
  60°) steps right one cell per cell of glide (`adtype`, `steps(n)`), so on
  screen each letter is typed in whole as it comes round the right side and
  typed out whole as it goes round the left. The side-fade mask is gone.
- Then: "the transitions isnt clean … the ticker should wink into the glow
  white line and the bezels of the ticker should slightly glow so as its
  winking it looks clean". THE WINK: the band now stands on the bubble's
  foot (absolute, 26 units up), so its centre line is a fixed 52 units
  above the deck's foot, open or folded, and the folded line (now inside
  the bubble) lies exactly there. Folding, the band is CLIPPED shut onto
  that line (clip-path, never a scale), and its two bezels (`.adrim`,
  hairlines the band's whole length glowing slightly, `--ad-rim-c` /
  `--ad-rim-glow`) travel half the band each and meet on it — one glowing
  line — as the broken line comes up under them; they fade after. The band
  closes (`--dur-2`) faster than the deck shortens (`--dur-3`, the same
  curve), so the keys settle onto the line and never cross it. Opening is
  the reverse. The wink starts two frames after the decision, so the
  band's words are laid first. Measured at 375px: the bezels land on the
  line (777.2) by 160 ms; the keys stop 5 px above it; fold and open hold
  60 fps (worst frame 17–19 ms).

## 28 Oct 2026 — the faded squares, tried and rolled back

The owner asked to try the Feed's cards as squares whose edges fade into
the page instead of bezels ("lets experiment with the cards"); it shipped
as e71f0d1 and was rolled back the same day ("yeah lets go back to
[rounded] cards no fade"): the Feed's cards are rounded (`--radius-card`)
with their 1px `--line` bezel again, and the Design Console's card-fade
knob is gone with it.

- The logo, 28 Oct 2026, later: "that gap between the logo thick white
  line and the accent mast head white line lets add a gap of that thickness
  between the ASILUM word and the thick whiteline". The bar stands off the
  word's baseline by exactly the Masthead's gap (since superseded: the word now sits half over the bar, and
  `WM.gap` and `--mh-gap` are gone) (`WM.gap`, 18 × 120.75 / 129
  = 16.85 of the logo's units = `--mh-gap`); the bar-to-line gap is
  unchanged, so the word lifts by it. Measured: word→bar 2.17 px against
  bar→line 2.18 px at 375, 3.02 against 3.04 at 800.


## 28 Oct 2026, last — THE TRON MARK (superseded 29 Oct by THE LINE INTEGRATED, below)

Through the evening the owner moved the word onto the brick ("half of the
asilum text … sticking half way over the brick", the brick "ontop of the mast
head line"), set it a touch smaller and to the right (`WM.set`: 0.96, +40),
then asked for a Tron logo ("negative space in the brick where the font would
be … an outline as thick as the font … the asterisk line … connected with the
outline"), in both themes ("for lightmode the text should be black"), with a
rise up the Masthead ("from the left and the end of the tip of the A … fill
it in") and the brick starting at the A ("not past it").
- `Wordmark.jsx`: ONE white shape in the bar's glow (`.wmtron`, `--wm-glow`):
  the bar (its top on the capitals' middle, its foot on the Masthead's line,
  its left end at the A's outline, `WM.bar.x` 31.36), the word stroked to an
  outline `WM.tron.t` = 14 wide (Michroma's own stroke: I 15, L's bar 13 at
  161), the stem under the asterisk into the A's outline, the tip closing the
  notch at the A's flat top, and the rise from the bar's left end to the A
  tip's far end, up past the Masthead's top. The six letters are cut out
  (mask) and laid back unlit (`.wmtronink`): `--wm-hole`, the ground's dark in
  dark and the artwork's black #001512 in light. The red asterisk sits on the
  stem in `--wm-glow-r`. `WM.art` keeps the artwork's bar for the artwork check.
- The Masthead's line starts at the brick's left end (the box is the bar's
  width) and runs under it to the keys.
- Tests: tests/v2-fixtures-sketch.test.js (the geometry, the shape, the holes,
  both themes).


## 29 Oct 2026 — THE LINE INTEGRATED (the logo as it is now)

The owner's reference (docs/brand/asilum-logo-2026-10-29.jpg): "new logo with
the masthead line intergated".
- `lib/wordmark.js` holds the reference measured in its own pixels (`REF`:
  the word's ink, the brick 779–945, the line's top 914, the slant's corners
  fitted at 996 and 1192, 34.6°) and lays it round the word as set (`WORD`;
  `brickGeometry`, `brickPath`, `brickBox`). tests/v2-logo-line.test.js
  re-measures the image against `REF`.
- `Wordmark.jsx`: three layers — the brick (`.wmbrick`, one path in
  `--wm-glow`: it runs off the screen's left edge, holds the word wholly,
  and at its right end its top slants down, the bends rounded, into the
  line); the word unlit in `--wm-ink` (the artwork's black, both themes);
  the asterisk in `--wm-glow-r`. The word keeps its set (`WM.set`).
- The Masthead's line takes the drawn thickness (`--mh-line-h`, 28.3 of the
  logo's units: 3.6px on a phone, 5 on a desktop) and the brick's foot sits
  on the line's foot (`.brandfix`), so the slant flows into the line, which
  carries on to the keys, broken at their meetings as before.

The same evening, two rounds more (owner: "lets make the masthead line thinner and the lines under the buttons …
make the font a little bolder and make the [text] negative, and keep the asterisk full and red"; then, circling
the toe, "i still want the button breaks, make the circled area flush the curve kind of looks jagged and the glow
doesnt look consistent throughout the whole thing … also can you add a thin white bezel line along the edge of the
disc"):
- The line is `LINE` (16 units: 2px on a phone, 2.9 on a desktop), the brick's line and the Masthead's alike; the
  slant keeps the reference's angle, so the toe moves along. The breaks at the keys stay.
- The bends are `BEND` (36 units), a curve, not the drawn 15's kink. The brick ENDS where the toe's curve lands
  on the line; the Masthead's line starts there, a pixel under it (it ran on under the whole brick, its glow
  stacked on the brick's).
- The glow comes off the brick's RIM (`rimPath`, LINE deep all round, the line itself along the foot), not the
  whole slab: measured at 800px, one pixel out the brick and the line both read 196 above, 199 and 188 below,
  falling off alike. It is clipped away from a window round the word (`glowWindow`) so no haze fills the letters.
- The word is CUT OUT of the brick (a mask), a `BOLD` stroke (5 units) thicker; the glass shows through. The
  asterisk stays whole and red. `--wm-ink` is gone.
- THE TINT ("tint the letters but i want the transition as smooth as possible, seamless, fast and reactive"):
  over a white card in light the holes vanished. Under the cut lies the word again (`.wmtint`, `TINT_BLEED` fuller
  than the hole) in `--wm-cut-tint`, half a deep navy, TRANSLUCENT: the glass shows through it, so white behind
  turns a cool grey, the blue glass a deeper blue, a dark card stays dark — per pixel, every frame, by plain
  compositing, with nothing measured and nothing to wait for (InkWatch reads at scroll rest; this does not).
  Dark's tint is clear; a theme turn eases it over `--dur-2`. A multiply was tried first and measured flat in the
  page (the same 121,126,135 over the glass and over a white card): inside the Masthead's glass a blend sees only
  the glass's own layer, never the page beneath.
- The wheel's disc wears the fixtures' shine rim (`.fxrim`), lit from the top since only its upper half shows.
