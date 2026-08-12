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
  the wordmark keeps full size): FRONT COVER, CATALOG, EDITORIAL, PASSPORT,
  DISCOVER, PROFILE, SETTINGS. New features must answer "which subsystem do
  I belong to?" — the destination list only changes by owner decree.
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
- Clickable words carry a slight horizontal motion blur + glow overtop —
  the site-wide clickability signal (grouped rule at the end of globals.css).
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
