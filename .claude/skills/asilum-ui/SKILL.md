---
name: asilum-ui
description: Load before ANY user-interface change — the Fashion Intelligence OS design law, token discipline, and the checks a UI diff must pass.
---

# ASILUM UI rules

FACTS live in knowledge/ui/ (design-language, typography, motion,
interaction). Non-negotiables when touching UI:

1. Seven destinations only (owner amendment July 25): FRONT COVER,
   CATALOG, EDITORIAL, PASSPORT, DISCOVER, PROFILE, SETTINGS. A new
   feature must live inside one — the list changes only by owner decree.
2. Red is the only ALERT/IDENTITY accent — activity, alerts, selection,
   ASTERISK. Clickable words are painted the system teal (--sig) with
   glow + horizontal smear (owner order, Aug 12; one grouped rule at the
   end of globals.css) — that is the interaction voice, not a second
   accent. No further accent colors, ever.
3. Colors ONLY through tokens (--ink/--paper/--line/--grey/--faint/
   --red + OS tokens). A literal hex in a component is a defect.
4. Both themes (phosphor dark / ice light) AND both interfaces
   (MODULE RAIL / ORB HUB, data-model 01/02) must be visually checked
   for every shell-visible change.
5. Suffix grammar: → in-app, ↗ external/publish, ✓ confirm. Coming-soon
   controls use class `soon` — never a dead or fake-success button.
6. Dismissal contract: Escape + click-away close panels
   (components/dismiss.js) — use it, don't reinvent it.
7. prefers-reduced-motion support is mandatory for any animation added.
8. Feed cards stay minimal (title/price/fit + Favorite/Bag); item depth
   belongs to the item modal (owner decree).
9. Mobile ≤760px: the top header tightens and the destination row
   scrolls horizontally (no sidebar exists anymore) — check it.
10. DESIGN CONSOLE (knowledge/ui/design-console.md): owner-editable
    sizes/shapes/motion route through `var(--ed-*, shipped)` in
    globals.css with a registry entry in lib/uilab.js. When adding a
    visible size a designer would tune, route it; never route color.
    UI checks should pass with no overrides set (shipped fallbacks).
