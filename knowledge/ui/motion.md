# Motion

Nothing is static; nothing is frantic. Motion communicates system activity.
- NO opening animation (owner order, Aug 12 2026): the boot sweep is gone;
  every load lands directly on content. Do not reintroduce a load animation.
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
