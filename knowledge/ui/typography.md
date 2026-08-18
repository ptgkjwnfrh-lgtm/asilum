# Typography

TWO voices, self-hosted in public/fonts (no CDN). Both ship WOFF2 for the
browser and TTF for the build-time social card (Satori cannot read WOFF2):
- Michroma (--mich) — titles, nav, designer names, wordmark. Microgramma's
  spirit. Wide face: keep sizes modest (headline clamp 26–46px),
  letter-spacing 0.10–0.18em, weight 400 always.
- Share Tech Mono (--helv/--serif alias "STM") — everything else. Body,
  interface text, and now every machine readout too. The whole app reads as
  instrument output. Advance is exactly 0.540em per character.

**RETIRED 17 August: VT323 (--osd), the "digi-cam" LCD face.** Owner directive —
"get rid of the digi cam font, only the main font from now on". It had reached
25 rules: the clock, counters, wire handles, the passport MRZ and serial,
breadcrumbs, and the "MAGAZINE" sub-mark. All of them take --helv now. The
token, the @font-face and the three files are gone, and
`tests/type-stack.test.js` fails if a third face or the name comes back — a
removed font returns one rule at a time, and the moment to stop that is when
somebody types the name.

**Watch the metrics when moving anything off a retired face.** STM is WIDER than
VT323, and the passport machine zone silently broke on the swap: the same string
measured 1043px inside a 978px box and `overflow-x: hidden` CLIPPED the tail —
the part that encodes the real account number. Now 17px/0.46em, 912px, 66px of
headroom, verified against the font's own advance metrics rather than by eye.
Text carries a faint glow (--glow-ink); red text uses --glow-r. Uppercase
labels get letter-spacing ≥ 0.12em.
