---
name: asilum-ui
description: Load before ANY user-interface change — the Fashion Intelligence OS design law, token discipline, and the checks a UI diff must pass.
---

# ASILUM UI rules

FACTS live in knowledge/ui/ (design-language, typography, motion,
interaction). Non-negotiables when touching UI:

1. Six destinations only: CATALOG, EDITORIAL, PASSPORT, DISCOVER,
   PROFILE, SETTINGS. A new feature must live inside one — never a
   seventh tab.
2. Red is the only accent voice. No second accent color, ever.
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
9. Mobile ≤760px: sidebar flattens to the bottom bar — check it.
