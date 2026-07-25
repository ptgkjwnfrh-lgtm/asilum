# Motion

Nothing is static; nothing is frantic. Motion communicates system activity.
- Boot sweep every full load: X/Y axis pulled from bottom-left resolves
  into sidebar + ticker (~1.5s, steps() timing for mechanical feel).
- Idle life: LED blink on the active destination, ticker drift, ASTERISK
  dock canvas (spokes+orbit cores in Module Rail, breathing orb in Orb
  Hub), scanline roll bar, haze drift (40–60s cycles).
- Mechanical, not springy CSS: steps() for state changes; transitions
  0.12–0.28s.
- prefers-reduced-motion: boot skipped, canvases freeze after first frame,
  ambient loops off. This is non-negotiable.
