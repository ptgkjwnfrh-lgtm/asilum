// app/opengraph-image.js — the social card, GENERATED, not committed.
//
// Why this exists (17 August). `og:image` was deliberately absent and
// `twitter:card` was held at `summary` for a stated reason: there was no asset in
// `public/`, and a card that declares an image it cannot serve renders broken,
// while inventing a placeholder to satisfy a checklist is the same failure in
// miniature (docs/seo-notes.md). Both halves are now honest, together.
//
// WHY A GENERATED ROUTE RATHER THAN A COMMITTED PNG. A binary in the repo is a
// second copy of the design language that nothing keeps in step — the palette
// moved twice in two days for contrast (#218/#219 moved --red, #216 moved --sig)
// and a PNG would have silently kept the old colours. This draws from the same
// token values the stylesheet uses, and tests/opengraph-image.test.js reads
// globals.css and fails if they drift apart. Same discipline as
// tests/theme-contrast.test.js, which recomputes its ratios from the stylesheet
// rather than trusting a number written down beside them.
//
// WHAT THE CARD SAYS, and this is the point of it. The catalog is a demo of
// synthetic sample records (owner ruling, #212) and the page says so to a
// reader's face in a red-bordered banner. A shared link is seen by people who
// have not reached the page yet, so the card carries the same sentence. A social
// card is the one piece of metadata a person actually looks at.
//
// TYPE — THE REAL BRAND FACES, and the card follows the site's own hierarchy.
// Satori reads TTF/OTF/WOFF but NOT WOFF2, and public/fonts only shipped WOFF2,
// so the first version of this card used the generator's built-in face. It does
// not any more: Michroma and Share Tech Mono are both SIL OFL, and Google ships
// them as TTF, so the TTFs sit beside the WOFF2s with their licences
// (public/fonts/OFL-*.txt). The WOFF2s stay — they are what the browser loads.
//
// The hierarchy is read off app/globals.css, not invented:
//   Michroma        .headline / .wordmark / .snav / .mq   -> the wordmark + kicker
//   STM (Share Tech Mono)  --helv, the body voice          -> both bottom lines
// `.headline` is Michroma at weight 400 with letter-spacing 0.1em, which is why
// the wordmark below is 400 and tracked, not bolded — Michroma HAS one weight,
// and asking for 700 would have Satori synthesise something the site never
// shows. tests/opengraph-image.test.js asserts the family/letter-spacing pairing
// against globals.css so the card cannot drift from the page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Read at module scope: /opengraph-image prerenders as a STATIC route (it shows
// as ○ in the build output), so this happens at build time on the build machine
// and there is no serverless file-tracing question to get wrong.
const FONT_DIR = join(process.cwd(), "public", "fonts");
const MICHROMA = readFileSync(join(FONT_DIR, "michroma.ttf"));
const STM = readFileSync(join(FONT_DIR, "sharetech.ttf"));

export const alt =
  "*ASILUM — fashion intelligence OS. The taste engine is real; the clothes are not.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Literal token values, because Satori resolves no CSS variables and reads no
// stylesheet. THESE ARE ASSERTED AGAINST app/globals.css BY TEST — if a token
// moves and this file does not, that test fails. Do not edit one without the
// other, and do not "tidy" these into a shared object that the test cannot read.
const BG = "#070b10";   // --bg
const INK = "#d4ffe8";  // --ink
const RED = "#ff3838";  // --red
const SIG = "#46ff96";  // --sig
const GREY = "#56937a"; // --grey

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "64px 72px",
          fontFamily: "STM",
        }}
      >
        {/* Top rule + kicker — the magazine furniture, not decoration. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", height: 2, background: RED, width: 180 }} />
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontFamily: "Michroma",
              fontSize: 24,
              letterSpacing: 10,
              color: GREY,
            }}
          >
            FASHION INTELLIGENCE OS
          </div>
        </div>

        {/* The wordmark. The asterisk sits LEFT of the word and is --red: that
            placement is the identity (every headline on the site does it). */}
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ display: "flex", fontFamily: "Michroma", fontSize: 116, color: RED, lineHeight: 1 }}>*</div>
          <div
            style={{
              display: "flex",
              fontFamily: "Michroma",
              fontSize: 116,
              color: INK,
              lineHeight: 1,
              letterSpacing: 12,
            }}
          >
            ASILUM
          </div>
        </div>

        {/* The honest line, same claim the catalog banner makes on the page. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", height: 1, background: GREY, width: "100%", opacity: 0.35 }} />
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 30,
              color: SIG,
              letterSpacing: 1,
            }}
          >
            the taste engine is real — the clothes are not
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 22,
              color: GREY,
              letterSpacing: 3,
            }}
          >
            A DEMO ARCHIVE OF SYNTHETIC SAMPLE RECORDS
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Michroma", data: MICHROMA, style: "normal", weight: 400 },
        { name: "STM", data: STM, style: "normal", weight: 400 },
      ],
    }
  );
}
