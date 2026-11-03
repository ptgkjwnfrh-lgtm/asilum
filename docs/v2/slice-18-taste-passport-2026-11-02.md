# V.2 slice 18 — the Taste Passport (2 November 2026)

The owner's mock-up (`docs/v2/mocks/2026-11-02-taste-passport/`, the
annotated copy beside it) and the word that came with it: the MRZ at the
foot "a little more even" and under "the same underneath clouded low
opacity effect as the passport clouded masthead"; every translation "either
French, German, Spanish, Japanese or Arabic, random selection"; "close the
kerning on the ASILUM TASTE PASSPORT to match the ASILUM logo and up the
size and boldness so it looks more important"; "replace SEX/ with IDNTY/ so
people can feel free to type in whatever they want"; the Paris road map
kept as the background "but very very very lower opacity"; the tiny photo
box "a photo line negative of the primary photo like how driver licenses
have"; the passenger signature "just going to be the passenger's user name
but they have the option to actually sign it". The mock-up's annotations:
the masthead "center fixture level clouded", its blue text "lower opacity
and only slightly glows underneath cloud", the serial the "month and day of
passenger account creation", the number "000,000–999,999", the bar code a
"negative cut out in the Liquid Glass".

## What landed

| Need | Where | Status |
| --- | --- | --- |
| A portrait document, the mock-up's page: the clouded masthead (a band of the fixtures' frost — a touch of blur, the deck's saturation — with the ticker's wisps drawn lighter), its foot level under the serial and swept down to the number's deeper right so the name sits in the notch; on a phone the foot runs level and the name takes the whole measure | `app/globals.css` (`.ppdoc`, `.ppmast`, `.ppcloud`, `--pp-cloud`, `--pp-wisp`, `--pp-under`) | shipped |
| The serial `AS<<<MM<<DD` — the month and day the account was created, a machine line of 16 — and the passport number `№ OASM·000·000`, six digits read off the account number (FNV-1a), both the document's colour at a lower opacity, glowing a little, UNDER the cloud | `lib/passport/document.js` (`serialLine`, `SERIAL_WIDTH`, `passportNumber`, `passportNumberDisplay`), `app/board/page.js`, `PassportPreview.jsx` | shipped |
| The name as type in the logo's set — Michroma, the wordmark's −0.096em between every pair, bolder by a stroke round each letter (the face has one weight), the document's ink unlit as the logo's word is — one line, sized to the notch by the document's own width | `app/globals.css` (`.pptitle`); `PassportPlate.jsx` deleted with its rules | shipped |
| The data page: SURNAME and GIVEN NAME off the username (the last word the surname), DATE OF BIRTH and IDNTY written on the page by the passenger and kept with the display name on the device, NATIONALITY, TASTE TYPE, DATE OF ISSUE; every label `ENGLISH /` then the drawn language's word, with its `lang` and direction | `lib/passport/document.js` (`nameParts`), `app/board/page.js` (`writeField`, `.ppwrite`), `lib/social.js` profile info | shipped |
| One language per passport, drawn from French, German, Spanish, Japanese and Arabic off the account number — random across passports, the same every time one passport opens; Arabic right to left | `lib/passport/document.js` (`LANGUAGES`, `LANGUAGE_CODES`, `passportLanguage`) | shipped |
| PASSENGER SIGNATURE: the username until the passenger signs; SIGN opens a pad in the slot (pointer events, `touch-action: none`), the stroke in the document's ink, DONE keeps it on the device as a mask so it takes either theme's ink, CLEAR returns the username | `app/components/PassportSignature.jsx` (`SIGNATURE_KEY`), `app/globals.css` (`.ppsig*`) | shipped |
| The ghost: the photo again, small, inverted, drained of colour, faint, at the lower right | `app/globals.css` (`.ppghost`) | shipped |
| The bar code: a cosine ramp into bars read off the passport number — not a symbology, nothing reads it — cut in the document's ink: the logo's white in dark, in its glow | `lib/passport/barcode.js`, `app/components/PassportBarcode.jsx`, `app/globals.css` (`.ppbarcode`, `.ppcut`) | shipped |
| The machine zone: TWO lines of the 52 measure, even — IDNTY, the taste type, the date of issue, the passport number; the nationality, the surname and the given name, the account number's first nine, the date of birth — clouded as the masthead is, at the same lower opacity; the keys moved under it so the bar code runs into the zone | `lib/passport/document.js` (`mrzZone`, `mrzDate`), `app/globals.css` (`.ppdoc .ppmrz`, `.ppdoc .ppdocacts`) | shipped |
| The map under everything, one layer at 9% opacity, unlit — the hot window, the summit marker and the microprint band gone; the registration pluses and the `01` kept | `app/components/PassportSecurity.jsx`, `app/globals.css` (`.ppholo-a`) | shipped |
| The preview on /profile reads the same strings — the serial, the number, the language, the two-line zone | `app/components/PassportPreview.jsx`, `app/globals.css` (`.ppmini`) | shipped |
| Pinned: the serial and the number, the language draw, the name split, the zone's two even lines and its real fields, the signature's contract, the bar code's geometry, the cloud's rules, the name's set, no literal colour | `tests/passport-document.test.js`, `tests/v2-device.test.js`, `tests/v2-fixtures-sketch.test.js` | pinned |
| Gone: the name plate and its red asterisk, the four-language title block, the `№ AS·00·08` serial of boards and convictions, the four-line zone and the TD3 pair, the hologram window, the microprint, the old band (`.ppsec`, `.ppnation`, `.ppplate*`, `.ppterrain`, `.ppsummit`, `.ppholo-b`, `.ppmicro`), the ticket count the zone no longer encodes | — | deleted |

## Decisions recorded (the owner may overrule)

1. **The language is drawn, not rolled.** "Random selection" is read as
   random ACROSS passports: the draw comes off the account number, so one
   passport reads the same language every time it opens. A document that
   changed language on every visit would read as a glitch, and a draw made
   on the server and again on the device would not match.
2. **DATE OF BIRTH is what the passenger writes on the page.** The birth
   date an account asserts at signup is never served to the shell
   (`app/api/account/age/route.js`, "deliberately never the date"), so the
   document prints the date the passenger types into it, kept on the
   device with IDNTY and the display name; empty, it prints `—` and the
   zone encodes `000000`. Serving the stored date to the bearer would be a
   privacy ruling of its own.
3. **The passport number is read off the account, not issued.** Six digits
   by FNV-1a over the account number: stable, not a secret, not an
   identifier (the account number is). The bar code is read off it the
   same way and is decoration — the zone carries the data.
4. **SURNAME is the username's last word.** One word is a surname alone;
   nothing is invented for the other half.
5. **The keys sit under the zone.** The mock-up has no keys; OPEN MAP and
   STAMP PASSPORT stay, at the very foot, so the bar code runs into the
   zone as drawn.
6. **The document is portrait** (560 wide at most, centred on a desktop):
   the mock-up is a page, not the landscape card of 31 Oct.

## Checked

Memory mode (`DATABASE_URL=` empty), no keys: /board at desktop and 375px,
dark and light; the pad signed with a drag and kept (SIGN AGAIN · CLEAR
shown), IDNTY typed and read back from the profile store with the zone
re-encoding it live; the zone's 52 characters measured to fit at 375px
(`clientWidth === scrollWidth` on both lines); /profile's preview drawn
from the same strings (`docs/v2/screens/taste-passport/`). `npm run build`
and `npm test` green; the passport batteries fail
with the change reverted (the serial, the language draw, the two-line zone
and the glow-wearers list all go red against the 31 Oct sources).
