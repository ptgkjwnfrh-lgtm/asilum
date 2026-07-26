# DESIGN CONSOLE — the owner's hand on the OS

The DESIGN CONSOLE (redesign/ui-editor) lets the owner hand-edit the UI —
every exposed text size, button dimension, layout measure, atmosphere level,
and motion speed — without touching code. It is an owner instrument, not a
theme: dark/light and MODULE RAIL/ORB HUB stay in Settings → Appearance.

## Where it lives
- Registry (single source of truth): `lib/uilab.js` — groups TYPE / BUTTONS /
  LAYOUT & SHAPE / ATMOSPHERE / MOTION, ~45 controls.
- Console UI: `app/components/DesignConsole.jsx`, mounted in `app/shell.js`
  so edits stay live across navigation.
- Open: Settings → Appearance → OPEN CONSOLE, or ctrl/cmd+shift+D anywhere.
  Escape leaves inspect mode, then closes (components/dismiss.js contract).

## How a control works
- Each control maps to ONE CSS custom property, `--ed-*`, routed in
  `globals.css` as `var(--ed-x, <shipped value>)`. The fallback IS the
  shipped design; no duplicate default lives in JS.
- An override is written inline on `<html>` (`style.setProperty`), persisted
  in localStorage `asilum-uilab`, and re-applied pre-paint by the PREPAINT
  script in `app/layout.js` (key + value grammar validated in both places —
  keep `lib/uilab.js` `validValue` and the PREPAINT regex in sync).
- Per-control ⟲ removes the override → fallback returns. RESET ALL clears
  everything (two-step arm).
- Special controls: text glow (writes `--glow-ink: none` — the one non-`--ed-`
  key allowed), boot sweep (localStorage `asilum-boot`, read by OsBoot).

## INSPECT mode
Each registry control carries `selectors`. INSPECT walks up from the clicked
element, matches those selectors, opens the owning group(s), and flashes the
rows. Clicks are swallowed (capture) while inspecting; the console itself is
exempt and deliberately not self-editable.

## Presets
Named presets live in localStorage `asilum-uilab-presets` (per device).
EXPORT copies `{"overrides":{…}}` JSON; IMPORT sanitizes — unknown keys and
malformed values are dropped and counted, never applied.

## Law for future work
- New visible text/button/layout values SHOULD route through a `--ed-*` var
  + registry entry when they represent a role an owner would want to tune.
- Never route COLOR through the console — red-only-accent and theme law stay
  in tokens. Sizes, shapes, opacity levels, and durations only.
- The mobile (≤760px) overrides in globals.css win over console values where
  they set literals (e.g. `--side-w: 0`); that is intentional — hand edits
  must not break the bottom-bar layout.
- `--side-w`, `--mq-h`, `--status-h` now read `var(--ed-…, shipped)` — edit
  the `--ed-` side, never reintroduce a literal on the legacy name.
