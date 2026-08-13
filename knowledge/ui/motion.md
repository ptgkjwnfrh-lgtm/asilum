# Motion

Nothing is static; nothing is frantic. Motion communicates system activity.
- NO opening animation (owner order, Aug 12 2026): the boot sweep is gone;
  every load lands directly on content. Do not reintroduce a load animation.
- Idle life: LED blink on the active destination, ticker drift, ASTERISK
  dock canvas (spokes+orbit cores in Module Rail, breathing orb in Orb
  Hub), scanline roll bar, haze drift (40–60s cycles).
- Mechanical, not springy CSS: steps() for state changes; transitions
  0.12–0.28s.
- Clickable words carry a slight horizontal motion-blur + glow overtop
  (owner rule, Aug 12) — the site-wide "this word is clickable" signal,
  written once in globals.css as a grouped text-shadow rule; add new
  text-action classes to that list, don't restate the shadow.
- prefers-reduced-motion: canvases freeze after first frame,
  ambient loops off. This is non-negotiable.
