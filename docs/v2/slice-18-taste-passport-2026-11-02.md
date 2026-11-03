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

The owner's second word, the same day, on the first build: "the formatting is
so so off and i only wanted the map to stay … just trace the picture … the
barcode isnt a negative cutout, i wanted it a negative cut out like the logo
and take away the MRZ cloudy … the barcode slope should match the logo
slope the header slope should match the logo slope. and the fonts must match
michroma, thin out the barcode"; then "some of the text is OCR A Extended
and i replaced the Os with 0s … identify all the fonts used in the mock …
there must be 4 translations underneath the photo." The faces in the mock-up,
read piece by piece: the serial and the number OCR A Extended (the Os
zeros), the № a serif numero, the four words under the photo OCR A
Extended, the machine zone OCR A Extended, the name, the labels and the
values Michroma; the bar code's slits show the Liquid Glass alone.
Later that day: "open up the kerning a little bit and reduce boldness, make
the masthead glow white a little, underneath the negative photo add
PASSENGER BIOMETRIC PHOTO, take the bezel off the barcode, take the map
watermark out, the numero sign must match the mock."

## What landed

| Need | Where | Status |
| --- | --- | --- |
| THE PAGE TRACED: a document of the mock-up's proportions (650 × 1120), every piece placed and sized in hundredths of its width (`cqw`), so a phone, a desktop and the /profile preview show the same page; the clouded masthead (the fixtures' frost over the band's words), glowing white a little in the logo's white (the cut on the cloud, the glow on the band, so the foot's slant is not clipped), its foot level under the serial then down THE LOGO'S OWN SLANT (`lib/wordmark.js`: the brick's shoulder, run 1.496, its bends) to the number's deeper right, the name in the notch; the keys OPEN MAP and STAMP PASSPORT under the page (the mock-up carries none) | `app/components/PassportDocument.jsx` (one page for /board and /profile), `app/globals.css` (`.ppdoc`, `.ppmast`, `.ppcloud`) | shipped |
| The serial `AS<<<MM<<DD` — the month and day the account was created, a machine line of 16 — and the passport number `№ 0ASM·000·000`, six digits read off the account number (FNV-1a), both in OCR A Extended with the Os as zeros (`ocr`), the № drawn as the mock-up draws it — a bold serif N and a small raised o, underlined (`--numero`) — both the document's colour at a lower opacity, glowing a little, UNDER the cloud | `lib/passport/document.js` (`serialLine`, `SERIAL_WIDTH`, `passportNumber`, `passportNumberDisplay`, `ocr`), `public/fonts/ocr-a-extended.ttf` (the owner's own copy, shipped at the owner's word), `app/globals.css` (`--ocr`, `--numero`) | shipped |
| The name as type in the logo's set — Michroma at −0.06em (the wordmark's −0.096em opened a little), bolder by a 0.02em stroke round each letter (half the first setting), the document's ink unlit — one line, sized to the notch | `app/globals.css` (`.pptitle`); `PassportPlate.jsx` deleted with its rules | shipped |
| The data page: SURNAME and GIVEN NAME off the username (the last word the surname), DATE OF BIRTH and IDNTY written on the page by the passenger and kept with the display name on the device, NATIONALITY, TASTE TYPE, DATE OF ISSUE; every label `ENGLISH /` then the drawn language's word, with its `lang` and direction | `lib/passport/document.js` (`nameParts`), `app/board/page.js` (`writeField`, `.ppwrite`), `lib/social.js` profile info | shipped |
| One language per passport for the labels, drawn from French, German, Spanish, Japanese and Arabic off the account number — random across passports, the same every time one passport opens; Arabic right to left. Under the photo the mock-up's FOUR words exactly, on two lines: `PASSP0RT/REISEPASS` over `パスポート/PASSEP0RT`, in OCR A | `lib/passport/document.js` (`LANGUAGES`, `LANGUAGE_CODES`, `passportLanguage`, `PASSPORT_WORDS`, `passportWords`) | shipped |
| PASSENGER SIGNATURE: the username until the passenger signs; SIGN opens a pad in the slot (pointer events, `touch-action: none`), the stroke in the document's ink, DONE keeps it on the device as a mask so it takes either theme's ink, CLEAR returns the username | `app/components/PassportSignature.jsx` (`SIGNATURE_KEY`), `app/globals.css` (`.ppsig*`) | shipped |
| The ghost: the photo again, small, inverted, drained of colour, faint, at the lower right, captioned PASSENGER BIOMETRIC PHOTO | `app/globals.css` (`.ppghost`, `.ppghostcap`) | shipped |
| The bar code is THE LOGO'S BRICK MIRRORED: its line running in from the left, rising at the logo's slant (the shoulder's run and bends, `brickGeometry`/`brickPath`) into the block, 8 hundredths deep; the plate the logo's white, unlit (its glow read as a line along the top and bottom and came off), the bars CUT OUT of it as the word is cut out of the logo (one mask) and through the slits the Liquid Glass alone — no tint, no ink; the bars read off the passport number — not a symbology, nothing reads it | `lib/passport/barcode.js`, `app/components/PassportBarcode.jsx`, `app/globals.css` (`.ppbarcode`, `.ppbarplate`, `.ppbarhole`) | shipped |
| The machine zone: TWO lines of the 52 measure, EVEN — every character a flex item spread over the zone's width, so both lines end on one edge whatever they say — IDNTY, the taste type, the date of issue, the passport number; the nationality, the surname and the given name, the account number's first nine, the date of birth; OCR A, one colour (the filler dimmer), unclouded | `lib/passport/document.js` (`mrzZone`, `mrzDate`), `app/components/Blocks.jsx` (`MrzLine` wraps each character), `app/globals.css` (`.ppmrz`) | shipped |
| The map under everything, one layer at 9% opacity, unlit — nothing else of the old artwork: the registration pluses, the page number, the hot window, the summit marker, the microprint band and the credit line are gone (the site credits OpenStreetMap on the map page and the street map, where the data is read in full) | `app/components/PassportSecurity.jsx`, `app/globals.css` (`.ppholo-a`) | shipped |
| The preview on /profile IS the page (`PassportDocument.jsx`, read-only) at the rail's width | `app/components/PassportPreview.jsx`, `app/globals.css` (`.ppmini`) | shipped |
| Pinned: the serial and the number, the language draw, the name split, the zone's two even lines and its real fields, the signature's contract, the bar code's geometry, the cloud's rules, the name's set, no literal colour | `tests/passport-document.test.js`, `tests/v2-device.test.js`, `tests/v2-fixtures-sketch.test.js` | pinned |
| Gone: the name plate and its red asterisk, the `№ AS·00·08` serial of boards and convictions, the four-line zone and the TD3 pair, the hologram window, the microprint, the registration pluses and the `01`, the old band and body (`.ppsec`, `.ppnation`, `.ppplate*`, `.ppterrain`, `.ppsummit`, `.ppholo-b`, `.ppmicro`, `.ppuv*`, `.pvplus`, `.ppbody`, `.pplower`), the ticket count the zone no longer encodes, the cloud over the zone, the mono face on the document | — | deleted |

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
5. **The keys sit under the page.** The mock-up has no keys; OPEN MAP and
   STAMP PASSPORT stay, below the document, so the page is the picture.
6. **The document is portrait** (560 wide at most, centred on a desktop):
   the mock-up is a page, not the landscape card of 31 Oct.
7. **OCR A Extended ships from the owner's own font library** (Monotype's
   digitisation, `OCRAEXT.TTF`); its licence for the site is the owner's
   to settle — it was bundled at the owner's word, as the mock-up sets it.
8. **The four words under the photo are the mock-up's**, fixed — English,
   German, Japanese, French — whatever language the labels drew.

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
