# Motion

Nothing is static; nothing is frantic. Motion communicates system activity.
- NO opening animation (owner order, Aug 12 2026): the boot sweep is gone;
  every load lands directly on content. Do not reintroduce a load animation.
- Idle life: LED blink on the active destination, ticker drift, ASTERISK
  dock canvas (spokes+orbit cores in Module Rail, breathing orb in Orb
  Hub), scanline roll bar, haze drift (40–60s cycles).
- Mechanical, not springy CSS: steps() for state changes; transitions
  0.12–0.28s.
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
