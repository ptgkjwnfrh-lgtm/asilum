# Claims register — 16 August 2026

The launch audit asked for a register of every public claim ASILUM makes and
whether it is true. This is that register for the **accessibility statement**
(`app/accessibility/page.js`), the page with the most load-bearing claims and
the one the audit flagged for promising more than the product delivered.

**Why this document exists.** A published accessibility commitment the product
does not meet is a trust problem stacked on top of an access one. The failure
mode is not malice — it is drift: the statement was written on 19 July against
an intended design, and the product moved. Nothing re-checked it. Two of its
claims were plainly false when this register was compiled, and one had been
false since the day it was written.

**Method.** Every claim below was checked against the code, not against
memory or intent. "Verified" means a named file, a test, or a measurement.
Where a claim cannot be checked from the repository — a screen-reader pass, a
response-time promise — it is marked **unverified** rather than assumed true.

---

## Verdicts at a glance

| # | Claim | Verdict |
|---|---|---|
| 1 | WCAG 2.1 AA is the target standard | **true** (as a target) |
| 2 | Accessibility checks are in the release gates | **true** |
| 3 | Semantic structure: headings and landmarks | **true** |
| 4 | Skip-to-content link | **true** |
| 5 | Full keyboard operability of navigation and controls | **partly — unverified** |
| 6 | Visible focus | **was FALSE — fixed** |
| 7 | Text alternatives on imagery, including generated placeholders | **true** |
| 8 | High-contrast palette in both themes | **true** (one stale literal fixed) |
| 9 | Motion respects reduce-motion; marquees and tickers stop | **true** |
| 10 | Forms with real labels | **was FALSE — fixed** |
| 11 | Explicit confirmation for destructive actions | **true** |
| 12 | Works with VoiceOver, NVDA, JAWS | **unverified** |
| 13 | Browser zoom to 200% | **unverified** |
| 14 | Response within five business days | **not verifiable from code** |

---

## The two that were false

### 10. "forms with real labels"

**False from the day it was written until #233.** 43 of 62 form controls across
18 files had no accessible name at all — a screen reader announced them as
"edit text, blank". The catalog search, the discover filters, the wardrobe entry
form, the business application, the room handle, the transmission composer and
the admin token field were all silent.

A placeholder is not a label: it is not reliably exposed as the accessible name,
and it disappears once the user types, so someone tabbing back to a half-filled
field is told nothing about what it holds.

**Now true.** Guarded by `tests/a11y-form-labels.test.js`, which counts a control
as named for `aria-label`, `aria-labelledby` *or* a wrapping `<label>`.

*Correction worth keeping:* the first scan reported 59, because it did not
recognise implicit association — an `<input>` nested inside a `<label>` is
already correctly named. 16 controls were already right. The real number was 43.

### 6. "visible focus"

**False for four controls.** `.search` (top-bar search), `.controls
input[type='text']` (the passport trainer and new-board field), `.usearch input`
(people search) and `.composer2 textarea` (the transmission composer) each set
`outline: none` and defined no `:focus` style anywhere — so a keyboard user
tabbing into them saw nothing. WCAG 2.4.7, Level AA.

**Now true.** Each takes the focus convention already used elsewhere in
`globals.css`: a border shift to `--sig`, the interaction voice. Guarded by
`tests/a11y-focus-visible.test.js`, which fails on any rule that suppresses the
outline without replacing it.

**Three of the four fixes are live; one is pre-emptive.** `.composer2` appears
**only in `globals.css`** — no JSX uses that class, so its block (lines 772–784)
is dead CSS and its new focus rule guards nothing today. Left in place rather
than removed: deleting a styled-but-unmounted component is a judgement call
about whether it is coming back, not an accessibility fix. Flagged here so the
next reader knows it is unused.

**Verified live, not inferred.** With the search panel open and a real click,
`.search` matches `:focus` and its `border-bottom-color` computes to
`rgb(70, 255, 150)` — `--sig` in the phosphor theme — where it previously
computed to `--line`. An earlier probe that reported "no change" was wrong for a
harness reason worth remembering: **an automated `el.focus()` sets
`document.activeElement` but does NOT make the element match `:focus` unless the
browser window itself has focus.** Click, do not call `.focus()`, when checking
focus styles.

**A second defect found the same way:** `.skiplink:focus` hard-coded
`#e5342b` — the pre-#218 red, which measured **3.92:1 and failed AA**. #218
darkened `--red` to `#cc2219` to pass, and this literal was missed, so the skip
link's own focus ring still used the failing colour. Now `var(--red)`. This is
precisely what UI law rule 3 (colours only through tokens) exists to prevent,
and the register's token test now enforces it for every focus rule.

---

## The verified true

- **2. Release gates.** `.github/workflows/ci.yml` runs `npm test` on every PR,
  and the suite includes `a11y-structure`, `a11y-form-labels`,
  `a11y-focus-visible` and `theme-contrast`. The claim was aspirational when
  written; it is now literally true.
- **3. Semantic structure.** Every masthead route ships exactly one `<h1>`
  (pinned in `a11y-structure`), and `<header>`, `<nav>`, `<main>` and
  `<footer>` are all present.
- **4. Skip link.** `app/shell.js` — `<a className="skiplink" href="#main">`.
- **7. Text alternatives.** All 20 `<img>` carry an `alt`; 8 are deliberately
  `alt=""` (decorative, so a card announces one name rather than two), and
  generated placeholders carry `alt={item.title}`.
- **8. Contrast.** #216 and #218 brought every audited token to AA in both
  themes; `tests/theme-contrast.test.js` recomputes from the stylesheet, so a
  future palette edit fails there rather than in someone's eyes.
- **9. Reduced motion.** `prefers-reduced-motion` blocks stop `.mq` (the
  ticker), `.os-roll`, `.os-blob`, `.pulse` and `.gxplug`, plus a global
  `animation-duration: 0.01ms !important` override.
- **11. Destructive confirmation.** Erasure requires typing
  `DELETE PERSONALIZATION`; the server checks the same string.

---

## The unverified — and why they stay that way

These are **not** claimed to be false. They are claimed without evidence, which
is the same problem in a quieter form.

- **5. "Full keyboard operability of navigation and controls."** #214 made card
  titles real controls and the item detail a proper dialog, so the specific
  failures found have been fixed. But "full" is a claim about every control on
  every route, and no exhaustive keyboard pass has been done. **Either narrow
  the wording or do the pass.**
- **12. VoiceOver / NVDA / JAWS.** No assistive-technology pass has ever been
  run. The static tests in this repo check *structure*; they cannot tell you
  what a screen reader says. This is the largest remaining gap.
- **13. Zoom to 200%.** Untested. WCAG 1.4.4 is the criterion, and it is the one
  the sub-12px type question actually bears on.
- **14. Five business days.** A process commitment, unverifiable from code.
  Left to the owner.

---

## Not a defect: the sub-12px type count

169 of 302 `font-size` declarations in `globals.css` are under 12px. The audit
raised it, and it is worth the owner's attention — but **no WCAG success
criterion mandates a minimum font size.** The relevant criterion is 1.4.4
(Resize Text), which asks that text survive 200% zoom, and that is claim 13
above — untested either way. Small type is the OS design language; changing it
is a design decision, not an accessibility fix.

---

## Standing instruction

**Do not revise `app/accessibility/page.js` until claims 5, 12 and 13 are either
verified or narrowed.** The page is closer to true than it was — the two false
claims are now true — but "full keyboard operability" and the named screen
readers are still asserted without evidence. Fixing the statement means either
doing the work or softening the wording; it does not mean editing the page to
match what we wish were true.
