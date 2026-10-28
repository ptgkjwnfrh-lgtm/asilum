# Motion

Nothing is static; nothing is frantic. Motion communicates system activity.
- NO opening animation (owner order, Aug 12 2026): the boot sweep is gone;
  every load lands directly on content. Do not reintroduce a load animation.
  ONE EXCEPTION, the owner's own (28 Oct 2026: "when a user first opens the
  app the first animation should be the ticker opening"): the deck renders
  with the ad ticker folded to its line, and the ticker unfolding (when it
  has an ad or a BRDCST to carry) is the first thing that moves. Nothing
  else animates on load.
- Idle life: LED blink on the active destination, ticker drift, ASTERISK
  dock canvas (spokes+orbit cores in Module Rail, breathing orb in Orb
  Hub), scanline roll bar, haze drift (40–60s cycles).
- ONE TIMING SYSTEM (owner, 28 Oct 2026: "EVERY ANIMATION SHOULD [BE]
  EXTREMELY SMOOTH, LOCK DOWN THE TIMING"). Durations come from one ladder
  `--dur-0..4` (60 / 140 / 220 / 320 / 460ms) and curves from five tokens
  (`--ease-out`, `--ease-in-out`, `--ease-in`, `--ease-spring`,
  `--ease-hinge`) on :root; a raw cubic-bezier anywhere else, or a
  transition off the ladder (bar long ambient ≥0.6s and linear colour
  blends), fails `tests/v2-motion.test.js`. Things move by transform,
  opacity and clip-path; only four boxes that truly change size may
  animate layout (the deck rising for search, the fixtures with it, a
  caption opening, the DM banner's reply field). Entrances ease out,
  exits ease in and run shorter; the wheel's choreography is staggered
  60ms (plus and tray first, the wheel behind them; closing, the wheel
  first). Script glides are timed by the clock, never "a share per
  frame", so 60 and 120Hz screens move alike. Glass maps redraw only
  when a resize has settled (`MAP_SETTLE_MS`), a few rows a frame
  (`MAP_SLICE_MS`): measured on 28 Oct, the wheel opens and closes with
  no frame over 20ms and search with no long task (it had a 69ms one).
- THE VERTICAL STACK (owner, 28 Oct 2026, the stacking sketch: "Messages
  at the top are carouselled and overlapped same as the bottom however
  messages in the middle are layer flat"; "applied to everything that
  scrolled verticley even the feed"). Every item of a vertical list — the
  Feed's cells, the messages page's rows, a thread, likes, the bag,
  notices, search results, BRDCST — rides a drum: flat through the middle
  of its scroller; within --stk-zone of the top or bottom edge it turns
  its edge side away, shrinks a little and laps toward the edge, the
  flatter item in front. CSS scroll-driven animations (`view()`), the bend
  transform-only, measured from the scroller's edges by the item's leading
  edge (never a share of its height). The page's edges are the Masthead's
  foot and the deck's top; a popup's or inner list's are its own. Off
  under reduced motion and where scroll timelines are missing.
  `tests/v2-vstack.test.js`; measured on 28 Oct: the Feed scrolls with no
  frame over 20ms, the same as with the stack off.
- The passport→upload build carries an ever-so-slight motion blur
  (0.7px on the map wrapper, owner order Aug 12) during the growth
  window only — roadBuilder removes it 220ms before landing so the
  final frame stays pixel-identical to /upload. Do not raise it.
- Wayfinding locator: every secondary page opens with a .locline
  ("← OWNER-DESTINATION / PAGE NAME") — users must never get lost.
- Clickable words carry a slight horizontal motion-blur + glow overtop,
  painted the logo gradient's teal (--sig), never black (owner rule,
  Aug 12) — the site-wide "this word is clickable" signal, written once
  in globals.css as a grouped color+text-shadow rule; add new text-action
  classes to that list, don't restate the shadow.
- prefers-reduced-motion: canvases freeze after first frame,
  ambient loops off. This is non-negotiable.
