# V.2 slice 14 — the Feed and the look, to the owner's references (18 October 2026)

**Authority:** the owner's instruction of 18 October 2026 and the references
committed at `docs/v2/references/2026-10-18-feed/` (2.jpg–6.jpg). Verbatim
intent: "you have the feed layout rules; I saw some shit that said the wire —
THE WIRE DOESN'T EXIST ANYMORE; these are the references; I want page
gradients too; on dark mode if there is a popup the background should be
darker, not a cloudy white; the liquid glass isn't liquid enough — I want the
OG reactive rainbow liquid glass you made for ASILUM; everything should be
rounded out too." Branch `v2/build`, six commits, one per instruction.

## What landed

| # | Commit | What | Where |
| --- | --- | --- | --- |
| 1 | `ef89b1c` | **The Feed to the references.** The post card: media fills a rounded card; handle, title and caption over it in white; four outline actions (heart = LIKE, comment bubble = soon, hourglass = STAMP, share arrow) and the author's circle. The BRDCST footer exactly as drawn: BRDCST · the date and time · a rule · \*event · chevron. The place card: venue mark, distance in miles, name, globe; it opens the map popup. The map popup's head (4.jpg): mark, distance, MAPS ↗, name, kind, description, globe, and a rating slot that draws ONLY from a named source. The piece card: the photograph, one quiet line, × to pass. The listing popup (5.jpg): "unverified" on the photograph only from the ledger; ♡ · OFFER · bag · hourglass; "Brand: title", SIZE, "35.00 USD" in Michroma. The deck's ad strip wears *ADs in red. | `app/components/WireCard.jsx`, `PlaceCard.jsx`, `MapSheet.jsx`, `ListingSheet.jsx`, `ControlCenter.jsx`, `app/page.js`, `lib/feed/types.js` (`brdcstMoment`, `brdcstWhen`, `priceLine`, `offerMode`, `pieceName`), `lib/places/registry.js` (`mapsUrl`, `placeRating`, `milesLabel`), `Icons.jsx` (comment, hourglass, share, venue, star) |
| 2 | `8751674` | **The Wire does not exist.** Every visible Wire word is the Feed now — the cover, the hotlist (THE HOTLIST), the profile, stats, a passenger's page, the business account, the taste network, analytics, the 404, the Likes sheet's POSTS tab, the deck's POSTS toggle and scope, the posting errors. Module and data names stay. | 15 files; guard in `tests/v2-shell.test.js` |
| 3 | `0477e80` | **Page gradients.** `--bg` stays the base; `--bg-grad` (both palettes) is what the page wears on `<html>`: a light from the top corner in the page's own tint, a faint counter-light, a gentle fall of the ground. Each destination tints it through `--page-tint` (the shell names the page in `data-page`). | `app/globals.css`, `app/shell.js` |
| 4 | `461527e` | **Dark popups deepen the page.** `--scrim` is a deep translucent black in dark (both the device's dark and the pinned dark) and the reference's 42% slate wash in light (unchanged). `--shade` is black in dark; the twelve shadows that mixed from the light ink now mix from it. | `app/globals.css` |
| 5 | `6a5fd8d` | **The OG reactive rainbow liquid glass.** The 8 Sep glass (`LiquidGlass.jsx`: the bezel's displacement map, R/G/B dispersed, the pointer's shine) on the Info Dock, the Passport Button, the deck and every popup; WebKit bends the cards under the popup's edges instead. One listener set (`useGlassReactive`) turns the rainbow rim with the pointer, the tilt and the scroll, writing only to the glass elements. The page bends under the popup again: the scrim is no longer a backdrop root; the page softens under its own filter. | `LiquidGlass.jsx`, `InfoDock.jsx`, `PassportButton.jsx`, `ControlCenter.jsx`, `SheetHost.jsx`, `shell.js`, `globals.css`; the float and the ticket flow portal to `<body>` (`ListingSheet.jsx`, `TicketFlow.jsx`, `dismiss.js`) |
| 6 | (this commit) | **Rounded everywhere.** `--radius-card`, `--radius-field`, `--radius-key`; a floor that rounds every button and field; cards, popups, the deck, keys, chips and stickers on the tokens; the underline-only (hairline) fields become rounded filled fields; card photographs rounded by default (`--ed-img-rad` ships 22). The phone popup header gives the title and its session count their room. | `app/globals.css`, `lib/uilab.js` |

## Honesty kept

- **No fake rating.** The reference's "4.6 (24K)" is a slot: `placeRating`
  returns a figure only from a named source with a count and a link; no row
  in the places record carries one, so nothing is drawn.
- **No dead OFFER.** `offerMode` makes OFFER real on a native Storefront
  listing and on a Wardrobe piece whose owner takes offers (DM first, 13.4);
  anywhere else the word is quiet with its reason.
- **"unverified" only from the ledger** — the verification badge's state,
  never inferred.
- **Distance only from this device's own centre** (the current area it shared
  this session, else the confirmed base city); otherwise a dash.
- **The comment bubble is `soon`** — comments are not built.

## Verified

- `npm run build` green before every commit; `npm test` green before every
  commit (1,854 pass, 0 fail, 92 skipped at commit 5).
- Each new assertion was run against the source reverted to the commit
  before it and failed there (the reviewer's check, A2).
- Seen in the memory preview (`asilum-v2-mem`, port 3482) at 375px and
  desktop, light and dark, popup up and down: the post card, the footer
  (its markup injected under a real card — no memory-mode post carries an
  event), the place card and its map popup, the piece card and the listing
  popup, the dark and light scrims (rgba(1,3,4,.74) / rgba(37,55,73,.42)),
  data-refract on all four glass surfaces and the rim angle following the
  pointer.

## Proposed defaults (reported, not decided)

- The per-destination tints: the Feed blue, the Passport the accent, the
  account the violet, the map between.
- The rim at 0.62 (dark) / 0.72 (light) opacity, 1.5px; the popup at 80%
  ground, the fixtures at 58%, the deck at 66%.
- The page under a popup blurs 5px (its own filter).
- The search popup's underline field stays: it is the 6.jpg reference.

## Known gaps

- The BRDCST footer's real data path was not seen in the browser: no
  memory-mode post carries an event. The markup is pinned by tests and the
  CSS was seen with the component's markup injected.
- The tilt was not exercised on a phone; it was read from the code path and
  the pointer path was seen.
- Safari's page-side bend under the popup was not seen (no WebKit here).
- The cover and hotlist pages still use some older square chrome off the
  shell; the floor rounds their buttons and fields, not every panel.
