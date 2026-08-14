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
  greens, purple, red) / ice light (near-white blue-green, teal, red).
  Legacy token names (--ink/--paper/--line/--grey/--faint) carry OS values.
- Layered depth: backlight → grid → haze blobs → content → glow →
  scanline glass. Subtlety threshold: never reduce readability.
- Seven destinations in a row directly under the top ticker (owner order,
  Aug 12 2026 — the left sidebar is GONE; header strip is thick enough that
  the wordmark keeps full size): FRONT COVER, CATALOG, THE WIRE (renamed
  from EDITORIAL by owner decree, Aug 13), PASSPORT, DISCOVER, PROFILE,
  SETTINGS. New features must answer "which subsystem do I belong to?" —
  the destination list only changes by owner decree.
- Header (`.tophead` in shell.js): thbar (wordmark + ticker + big
  SEARCH/BAG/SIGN-IN with symbols on search and bag) over the destination
  row (ASTERISK drawer trigger, seven buttons, compact dock). Theme toggle
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
    HANDOVER-2026-08-14): the author — and only the author, verified
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
  - Page order: masthead + live folio → composer → the floor (every
    post, caption headers on transmissions, no fabricated counters) →
    WHO TO FOLLOW → THE HOTLIST booths → ASILUM MAGAZINE (house
    dispatches, honest empty) → AD SPACE (dashed = honestly open,
    disclosure line) → EXTERNAL DISPATCHES quietest (grey title-only
    links out — deliberately excluded from the teal clickable rule).
    The graded descent by TYPE SCALE survives (.elmast masthead;
    .elh2 21px → .elh5 9.5px grey), as does the magazine furniture at
    zero height cost (field, folio, gutters, colophon of live
    counters).
- PROFILE is standard social format (owner order, Aug 12: Grailed ×
  Twitter × MySpace, legibility first): banner → overlapping avatar →
  name/handle/bio → MEMBER SINCE (same once-stamped device date the
  passport uses) → one plain counts row (posts/following/brands/
  followers, all real) → ONE tab row holding everything: POSTS (floating,
  no fabricated counters) / BRANDS / BAG / WARDROBE / ROOM (the MySpace
  personality editor) / SIZING / ACCOUNT (sign-in, connections, follows,
  people search; /profile#access opens it). No boxed cards — the red
  offset-shadow measure card is gone.
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
