# Interaction grammar — V.2 (owner's blueprint, 17 October 2026)

The blueprint's chapter 1 (popups and sessions — the sessions now kept
quietly as tabs, 27 Oct 2026) and chapter 2 (the Disc
and tactility) are the law; what follows is the shipped reading.

## Popups (SheetHost.jsx, dockstate.js)
- One popup at a time, over the root, at about 60% of the height; it
  grows to the full height for the keyboard and long editing (EXPAND, and
  automatically when a field inside takes focus).
- A new popup opens over the one on screen, which waits under it: Back
  and a swipe right return to it. A swipe down from the header, Escape,
  CLOSE, or the FEED key dismiss it. A tap outside dismisses a
  lightweight popup only — never a checkout, never an edit in progress
  (`heavy` in the VIEWS table).
- The FEED key twice: the first tap dismisses, the second refreshes the
  tab from the top.
- While a popup is up the fixtures shrink and go translucent
  (`[data-popup]` on the root). The page behind does not scroll.

## Tabs (the session hub's laws, without its face — owner, 27 Oct 2026)
- The ten-session hub is gone from sight: no carousel, no `01/10`
  counter, no NEW SESSION, the POST disc is only the plus ("lets get rid
  of the ten tabs that are hidden … i simply just dont want the session
  subtabs as a confusing feature").
- Its laws stay ("when i back out of a tab the tab must remain what i
  last left it as"). Every popup belongs to a TAB, named by the view it
  was opened as and what it was opened on. Dismissing keeps the tab
  exactly as it was; opening it again resumes it — the detail that was
  up, what was typed and chosen, the scroll. A popup opened over another
  extends that tab; Back from a tab's first view dismisses and keeps it.
- While the page lives each tab's views stay mounted out of sight
  (hidden, inert, still laid out — `.sheetpane`, the six most recent);
  on this device each tab's stack and scroll are kept (`asilum-tabs-v1`),
  so after a reload a tab still resumes. Nothing pops open by itself.
- The search keeps its words: leaving search keeps the half-typed query
  and its pins, each scope its own (global, Messages, Likes, the map);
  SEARCH gives them back with the search tab resumed. Likes and the map
  filter by them only while the deck is searching.

## Direct messages (MessagesSheet.jsx, MailDesk.jsx, DmLive.jsx — 27 Oct 2026)
- The MESSAGES key opens the DM TAB — the "messages" popup tab, the live
  mail desk inside it (embedded), kept like every tab — and wears how many
  conversations wait. Signed out, messaging off, or a store away, the tab
  says which; nothing is simulated.
- A message arriving while the app is on screen drops a glass banner from
  the top (who, the start of what they wrote; a request shows no words),
  gone after six seconds or a swipe up. ONE TAP opens the reply field and
  focuses it inside the tap, so a phone raises its keyboard; Enter sends
  through the DM API and marks the conversation read. A DOUBLE TAP (280 ms,
  the Feed's own) opens the DM tab on that conversation; a request opens
  REQUESTS. No banner over the DM tab itself; muted conversations stay quiet.

## The Disc (Disc.jsx, lib/disc.js)
- Drag to turn, flick to spin; momentum and friction; a magnetic snap
  that ramps as the disc slows; a tick (haptic + visual) at each item
  while slow. Tap the centre to confirm, or let an item dwell one second
  (the ring fills). A long hold on the centre opens the compact menu.
- Arrow keys turn it; Enter confirms. Reduced motion drops momentum.
- Every disc can be turned Off per interface (`asilum-disc-<name>`); Off
  swaps in a slim slider with arrows and OPEN.
- THE SCROLL WHEEL (owner, 26 Oct 2026, the sketches 6.jpg and IMG_1166;
  `ScrollWheel.jsx`, `PostCards.jsx`, `lib/scrollwheel.js`): a click wheel
  of liquid glass CENTRED ON THE POST PLUS — the plus is its hub and
  turning point and never turns; only the wheel and its four marks
  (12 / 3 / 6 / 9, in the stamp tone) do (owner, 27 Oct). The plus rides
  up out of the deck on a pill, its slot left an empty space, and the
  wheel grows round it there (raised, the whole wheel stands above the
  screen's foot). The wheel's pane carries the V.1 magazine's rainbow
  glass (`RainbowGlass.jsx`, red / green / blue pulled 80 / 86 / 92), so
  the Feed behind it bends and splits like the FRONT COVER letters under
  the old strip — the one glass that parts the colours. The pane is a
  layer on <body> under the deck: inside the deck its bend saw nothing.
  Its face pulls the Feed back toward the hub in four broad wedges, so
  what is behind it streaks outward like the Yeezus CD's spokes (the
  "spokes" lens shape, the wheel's alone). Let go, it comes to rest on a
  detent: a card changes half-way between two detents, and the Disc's
  magnet (`lib/disc.js` tuning) draws the wheel onto the detent of the
  card in front — a flick coasts first (27 Oct). It SPAWNS on
  its own while a Feed carousel (Figure 20) is centred on the screen (its
  middle within 22% of the screen's, half of it in view) and turns THAT
  carousel, a card every 45°, clockwise on — it never scrolls the page.
  A tap on the plus (no popup up) brings up Post Selection's types as
  small glass cards on a 3D ring above it, and the wheel turns the ring;
  choosing the front card grows it into its composer popup in place. No
  card navigates — LISTING shows its `soon` note. Arrows turn a notch,
  Home / End the ends; Escape (the deck's alone — never handled twice),
  the dark disc or a click away put the cards away, and with no cards
  Escape snoozes the wheel until another carousel is centred. A popup,
  search or another page put it all away. The 350f206 swipe-up opener is
  gone. Reduced motion drops the travel and the coast. With a popup up a
  tap on the plus closes it and brings up the cards.

## Tactility (lib/haptics.js)
- `tick`, `press`, `confirm`, `error`, `toggle` — short patterns through
  `navigator.vibrate`, behind one On/Off key (`asilum-haptics`, Settings).
  A device without a motor is not an error. Compact buttons depress 4%.

## The one Feed (app/page.js, lib/feed/types.js)
- There is no Wire. Posts are braided into the pieces (one after every
  third piece), PLACE cards after every ninth, live ECHOs on the rail
  above the stream. Eight card types: TRANSM · STILL · MOTION · BRDCST ·
  LISTING · ECHO · PLACE · SONG (SONG waits for a music catalog).
- Tetris packing by the blueprint's weights: STILL and MOTION (70%) take
  the full width and break the columns; LISTING (45%) and TRANSM take a
  column; PLACE (20%) is compact until opened; a standalone BRDCST (10%)
  is a strip. The wheel overlaps six pixels.
- A piece opens the LISTING popup (`ListingSheet.jsx`): carousel, LIKE,
  OFFER (`soon`), BAG, STAMP, sizes, price, three tags, BEHIND THE
  PRODUCT for the rest and the depth (origin, evidence, ASTERISK's why,
  goes-with). STILL and MOTION enlarge in the "media" popup with the
  caption on the media and its ink read from the photograph. PLACE
  expands in place. A BRDCST footer collapses to title and date.
- ECHO lives 1–24 hours; expired echoes are never served; the viewer is
  sequential, tap for next and previous, hold to pause.

## Still the law from before
- Suffix grammar on actions: "→" navigates in-app, "↗" leaves or
  publishes, "✓" confirms state. One glyph, right side.
- Coming-soon: class `soon` on any control whose feature isn't usable
  yet, saying what it waits for — never a dead button, never a fake
  success.
- Clickability must be visible: pills for buttons, dotted underlines for
  text links.
- Every username navigates to that user's page, everywhere.
- Item depth lives in the item modal; feed cards stay title/price/fit +
  Favorite/Bag only (owner decree, July 6).
