# V.2 slice 17 — the Tron Passport (31 October 2026)

The owner's word (31 Oct 2026), after the Masthead, the logo and the deck
took the sleek look of 28–30 Oct: "we have to redesign the passport to
mimic the new style of the app, yk we're going for a sleek tron type of
vibe now; i want more [MRZ] or whatever the little text on passports are,
and chevrons." On the screenshot the owner circled in red what stays: the
serial at the top right (`№ AS·00·08`) and the four-language title block
(PASSPORT / パスポート / REISEPASS / PASSEPORT).

## What landed

| Need | Where | Status |
| --- | --- | --- |
| The document in the app's language: no hairline anywhere (no border, no rule under a band, no dashed line over the zone), the bands parted by tone, the glass frame a card's corners | `app/globals.css` (`.ppdoc`, `.ppsec`, `.ppnation`, `.ppphoto`, `.ppmicro`, `.ppmrz`) | shipped |
| The name cut out of the logo's white plate — the letters holes, the glass and the hologram through them; the asterisk the house red, glowing red; the plate in the logo's white glow | `app/components/PassportPlate.jsx` (the wordmark's recipe: one mask, the name drawn once in it and once over it from the same measure; the glow on the masked element so it is computed before the letters are cut; `text-shadow: none` on the SVG text, or the nation line's inherited glow is painted inside the holes) | shipped |
| More MRZ: a four-line machine zone of the real fields — type P, code ASM, the username, the account number, member-since and the counters (the TD3 pair, unchanged), then the class, BASED IN and the country of origin, then the handle, the taste class, SAVED and CONVICTIONS — the chevrons the filler, every line the 52 measure | `lib/passport/document.js` (`mrzZone`, `mrzWord`, `MRZ_WIDTH`) | shipped |
| The device's machine-readable line: the data in the document's colour, glowing in dark; the filler the red thread, unlit; a block cursor at the end that holds still under reduced motion; the serial again at the band's left and the microprint set the same way | `app/components/Blocks.jsx` (`MrzLine`), `PassportSecurity.jsx` (`MICROPRINT`), `PassportPreview.jsx` (the /profile preview reads the same line; `MrzTint` deleted) | shipped |
| The zone always fits: the lines encode the real account number, so a clipped tail is a lie — the size follows the zone's own width (container units) down to a phone's, and the passport ratio became a minimum height (a box held to the ratio with its overflow hidden clipped the zone) | `app/globals.css` (`.ppdoc .ppmrz`, `.ppdoc .ppmrz .mrzline`) | shipped |
| The keys with the device's lamps: OPEN MAP and STAMP PASSPORT blink when pressed; the primary key carries the logo's white glow in dark | `app/board/page.js`, `app/globals.css` (`.ppbtn`) | shipped |
| Kept exactly: `.ppnum` and `.ppquad`, markup and rules; of the original document the registration pluses, the `01`, the photo slot's print lines and the hologram window | `tests/passport-document.test.js`, `tests/v2-device.test.js` | pinned |
| Gone: the strip's iridescent sweep and tiled pluses (and the green-check exemption they needed in `tests/v2-shell.test.js`), the nation line of type on the document, the dashed rule over the zone, the photo's border | — | deleted |

## Decisions recorded (the owner may overrule)

1. **Chevrons are a machine zone's filler, never a text placeholder.** The
   25 Oct word ("fuck the chevrons — I want [blocks] used as text place
   holders") stands: `BlockText` and `BlockLine` keep that job, and
   `tests/v2-device.test.js` still forbids `>>>>` standing in for text.
   `MrzLine` is the one place chevrons return, as `<` — what a real MRZ
   fills with.
2. **The zone encodes what the page prints, nothing else.** An empty field
   (no city, no account) encodes to nothing between its separators — never
   a dash, never a word the page does not show. The first two lines are the
   TD3 pair the /profile preview already carried, unchanged.
3. **The public Passport is untouched.** The document renders only for the
   bearer (`!shared`); the hidden-city ring (ADR-006) draws as before.
4. **The MRZ face is `--mono`** (Share Tech Mono, the small print since the
   owner's 25 Oct mockup), as the original document's zone was; the plate
   and the labels are Michroma.

## Checked

Memory mode (`DATABASE_URL=` empty), no keys: /board at desktop and 375px,
dark and light, with the LIKES popup up and down; the machine zone's 52
characters measured to fit at both widths (`clientWidth === scrollWidth`);
the page's foot clears the deck (`.main`'s `--cc-space` padding). `npm run
build` and `npm test` green. The battery fails with the change reverted
(the zone test, the device test's passport pin and the shell test's green
check all go red against `origin/v2/build`'s sources).
