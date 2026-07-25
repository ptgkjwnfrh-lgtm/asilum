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
- Seven destinations, permanent left anchor (owner amendment July 25 —
  FRONT COVER added as the landing edition): FRONT COVER, CATALOG,
  EDITORIAL, PASSPORT, DISCOVER, PROFILE, SETTINGS. New features must
  answer "which subsystem do I belong to?" — the destination list only
  changes by owner decree.
- Two user-switchable interfaces (Settings → Appearance, localStorage
  asilum-model): 01 MODULE RAIL (instrument stack) / 02 ORB HUB (engine
  front and centre, lozenge nav, [data-model="02"] variants). Structure
  changes; palette follows the theme system.

## Passport UV page (redesign/passport-uv, owner inspo: Swiss passport under UV)
The PASSPORT document on /board renders as a page under blacklight —
`app/components/PassportSecurity.jsx` + the `.ppuv/.ppterrain/.pv*` layer in
globals.css. Layers: registration crosses, plus-pattern mountain ridge,
"01" page numeral, *ASILUM microprint band, topographic contour field, and
a constellation of scattered plus marks in a thin line web whose drawn
connecting lines trace THREE ASTERISKS (red — the ASTERISK identity hidden
like a hologram mark). All geometry is deterministic (sin-perturbed, no
randomness — SSR-safe). Real data only: the summit marker is the bearer's
top conviction (weight + tag); MRZ chevron filler tints red, data runs
green. Decorative SVG strokes use tokens (--sig/--p2/--red) via CSS classes.
