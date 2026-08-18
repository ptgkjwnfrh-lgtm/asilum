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


## The wordmark stack (17 August)

Three lines, and **all three are exactly the width of the ASILUM run**:

```
*ASILUM                      Michroma, --ed-fs-wordmark (19px / 15px mobile)
M A G A Z I N E              STM 10px, flex space-between, --mag-glow
PERSONALIZED FASHION TERMINAL  STM 7px, flex space-between, three words
```

**Justified, not tracked.** Each sub-line is one span per letter (or per word for
the tagline) spread with `justify-content: space-between`, so the first and last
glyphs sit exactly on the box edges. A hand-tuned `letter-spacing` only matched at
one font-size and stopped matching the moment the face or the breakpoint changed
— which is what had happened.

**The box is sized by ASILUM alone.** Both sub-lines carry `width: 0;
min-width: 100%`, keeping them out of the parent's shrink-to-fit measurement.
Before that, "FASHION INTELLIGENCE OS" was the widest child at 147px and MAGAZINE
justified to the *tagline's* width, overshooting ASILUM by 22px.

**Watch the slack when the tagline changes.** `space-between` needs free space to
distribute; at 8px the 27 letters of PERSONALIZED FASHION TERMINAL measured ~134px
against a 125px box and the words collapsed into each other. 7px with no tracking
leaves ~23px across two gaps. Recompute if either the wordmark size or the tagline
text changes.

**MAGAZINE never hides.** It was `display: none` below 760px, so the corner logo
read a bare "*ASILUM" on every phone. It is sized down now, not hidden; the
tagline is what goes, because a tagline is not the name.

**`--mag-glow`** is a purely horizontal stretched glow on the MAGAZINE line only —
blur radius grows while the vertical offset stays 0, so light pulls sideways out
of the letters. ASILUM carries no shadow of its own. Static, so no
reduced-motion escape hatch is owed.
