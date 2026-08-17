// app/opengraph-image.js — the social card, GENERATED, not committed.
//
// Rebuilt 17 August against the owner's reference comp. What that comp asked
// for and what shipped:
//   terminal grid + phosphor bloom      -> SVG data-URI grid + radial --sig glow
//   red block and rule across the top   -> kept, --red
//   kicker over the wordmark            -> "PERSONALIZED FASHION TERMINAL"
//   chrome *ASILUM, glowing red asterisk-> gradient clipped to text, --red glow
//   green glowing "magazine.com"        -> --sig in VT323, tracked, glowing
//   three-word strip                    -> DISCOVERY · COMMERCE · COMMUNITY
//   the demo line                       -> kept verbatim
//
// TWO DELIBERATE DEPARTURES FROM THE COMP, both worth saying out loud:
//   1. The comp reads "COMMERECE". Shipping a misspelling into every link
//      preview is not a design choice, so it is COMMERCE here.
//   2. The comp's chrome is a silver-blue, and its "magazine.com" is a plain
//      grotesque. Neither exists in this palette or this type stack, and
//      asilum-ui rule 2/3 is explicit: no further accent colours, ever, and
//      colours only through tokens. So the chrome is built from --ink and
//      --grey — the same metallic banding read in the phosphor palette — and
//      "magazine.com" is set in OSD/VT323, which is what `.wordmark em` already
//      uses for the word MAGAZINE on every page. The comp's INTENT is matched
//      with the house's own materials rather than importing new ones.
//
// THE NAME IS "*ASILUM magazine" AND THE WORD magazine IS NEVER DROPPED (owner
// directive, 17 August). It was being dropped in fourteen metadata strings —
// title template, siteName, og/twitter titles — while the shell wordmark had it
// right all along. tests/brand-name.test.js is that rule, executable.
//
// WHY A GENERATED ROUTE RATHER THAN A COMMITTED PNG. A binary in the repo is a
// second copy of the design language that nothing keeps in step — the palette
// moved twice in two days for contrast (#218/#219 --red, #216 --sig) and a PNG
// would have kept the old colours silently. tests/opengraph-image.test.js reads
// app/globals.css and fails if the card and the stylesheet disagree.
//
// TYPE: Satori reads TTF/OTF/WOFF but NOT WOFF2, and public/fonts shipped only
// WOFF2. All three faces are SIL OFL and Google publishes TTFs, so the TTFs sit
// beside the WOFF2s with their licences. The WOFF2s stay — the browser loads
// those. Hierarchy is read off globals.css, not invented:
//   Michroma  --mich  .headline/.wordmark/.snav/.mq  -> kicker, wordmark, strip
//   VT323     --osd   .wordmark em (the MAGAZINE line) -> "magazine.com"
//   STM       --helv  the body voice                 -> the demo line
// No fontWeight anywhere: each face ships ONE weight, and asking for 700 makes
// Satori synthesise something the site never shows.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Read at module scope: /opengraph-image prerenders as a STATIC route (○ in the
// build output), so this happens at build time and there is no serverless
// file-tracing question to get wrong.
const FONT_DIR = join(process.cwd(), "public", "fonts");
const MICHROMA = readFileSync(join(FONT_DIR, "michroma.ttf"));
const STM = readFileSync(join(FONT_DIR, "sharetech.ttf"));
const VT323 = readFileSync(join(FONT_DIR, "vt323.ttf"));

export const alt =
  "*ASILUM magazine — personalized fashion terminal. A demo archive of synthetic sample records.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Literal token values, because Satori resolves no CSS variables and reads no
// stylesheet. asilum-ui rule 3 says colours only through tokens; this is the
// closest a build-time image can get, so THESE ARE ASSERTED AGAINST
// app/globals.css BY TEST. Do not edit one without the other, and do not "tidy"
// them into a shared object the test cannot read.
const BG = "#070b10";    // --bg
const INK = "#d4ffe8";   // --ink
const RED = "#ff3838";   // --red
const SIG = "#46ff96";   // --sig
const GREY = "#56937a";  // --grey
const FAINT = "#2f5947"; // --faint

// The terminal grid and the phosphor bloom, as PRIMITIVES.
//
// Both were first written the way you would write them in CSS — an SVG data-URI
// tile for the grid, a `radial-gradient` for the bloom. Satori painted NEITHER,
// and the giveaway was that editing their values produced a byte-identical PNG:
// if a change to a colour changes nothing, the thing is not being drawn. So the
// grid is positioned hairlines and the bloom is a blurred box-shadow, which
// Satori does render. Verified by looking at the output, not by reading a
// support table.
const GRID_STEP = 30;
const GRID_COLOR = "rgba(120,255,190,0.07)"; // --line, thinned for a backdrop
const COLS = Math.ceil(1200 / GRID_STEP);
const ROWS = Math.ceil(630 / GRID_STEP);

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BG,
          fontFamily: "STM",
        }}
      >
        {/* --- background plates, back to front --- */}
        {Array.from({ length: COLS }, (_, i) => (
          <div key={`v${i}`} style={{ position: "absolute", left: i * GRID_STEP, top: 0, bottom: 0, width: 1, display: "flex", background: GRID_COLOR }} />
        ))}
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={`h${i}`} style={{ position: "absolute", top: i * GRID_STEP, left: 0, right: 0, height: 1, display: "flex", background: GRID_COLOR }} />
        ))}
        {/* the phosphor bloom, bottom-left, as in the comp — a blurred shadow,
            because a radial-gradient silently does not paint here.
            THE EMITTER MUST BE TINY. A box-shadow paints OUTSIDE its element, so
            the first version used 380x300 boxes and printed two dark discs where
            their own bodies sat — visible in the render, invisible in the code. */}
        <div
          style={{
            position: "absolute", left: 90, bottom: 40, width: 4, height: 4,
            display: "flex", borderRadius: 9999,
            boxShadow: "0 0 260px 170px rgba(70,255,150,0.22)",
          }}
        />
        <div
          style={{
            position: "absolute", left: 250, bottom: -10, width: 4, height: 4,
            display: "flex", borderRadius: 9999,
            boxShadow: "0 0 180px 110px rgba(70,255,150,0.14)",
          }}
        />
        {/* The comp's floating UI frames, drawn as four hairlines each.
            They went missing for two builds: an earlier edit to the bloom
            replaced the whole span up to this marker and took them with it, and
            because "change a value, get an identical PNG" is also what a
            not-rendered element looks like, I first blamed Satori. It was my
            patch. Kept as hairlines rather than a `border` only because the grid
            above already proves this primitive paints. */}
        {[
          { x: 942, y: 176, w: 218, h: 136, o: 0.34 },
          { x: 1028, y: 344, w: 132, h: 78, o: 0.22 },
        ].map((f, i) => (
          <div key={`f${i}`} style={{ position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h, display: "flex" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: f.w, height: 1, display: "flex", background: GREY, opacity: f.o }} />
            <div style={{ position: "absolute", left: 0, top: f.h - 1, width: f.w, height: 1, display: "flex", background: GREY, opacity: f.o }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: 1, height: f.h, display: "flex", background: GREY, opacity: f.o }} />
            <div style={{ position: "absolute", left: f.w - 1, top: 0, width: 1, height: f.h, display: "flex", background: GREY, opacity: f.o }} />
          </div>
        ))}
        <div style={{ position: "absolute", left: 1114, top: 156, width: 46, height: 3, display: "flex", background: RED, opacity: 0.85 }} />

        {/* --- the card --- */}
        <div
          style={{
            position: "relative", width: "100%", height: "100%",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            padding: "56px 72px 60px",
          }}
        >
          {/* red block + rule, straight from the comp */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 118, height: 14, background: RED }} />
              <div style={{ display: "flex", flex: 1, height: 2, background: RED, opacity: 0.85 }} />
            </div>
            <div style={{ display: "flex", marginTop: 26, fontFamily: "Michroma", fontSize: 25, letterSpacing: 9, color: GREY }}>
              PERSONALIZED FASHION TERMINAL
            </div>
          </div>

          {/* The wordmark. The asterisk sits LEFT of the word and is --red with a
              glow — that placement is the identity on every headline. ASILUM is
              chrome: a gradient clipped to the glyphs, banded --ink -> --grey so
              the metallic read comes out of the palette, not out of a new one. */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: -18 }}>
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <div
                style={{
                  display: "flex", fontFamily: "Michroma", fontSize: 112, lineHeight: 1,
                  color: RED, textShadow: `0 0 28px rgba(255,56,56,0.85), 0 0 60px rgba(255,56,56,0.45)`,
                }}
              >
                *
              </div>
              <div
                style={{
                  display: "flex", fontFamily: "Michroma", fontSize: 112, lineHeight: 1, letterSpacing: 8,
                  backgroundImage: `linear-gradient(180deg, ${INK} 0%, ${GREY} 42%, ${INK} 54%, ${GREY} 100%)`,
                  backgroundClip: "text", color: "transparent",
                }}
              >
                ASILUM
              </div>
            </div>
            {/* magazine.com — never dropped. VT323 is what .wordmark em uses for
                the MAGAZINE line, tracked the same way, in --sig with the glow. */}
            <div
              style={{
                display: "flex", justifyContent: "flex-end", width: 830, marginTop: -14,
                fontFamily: "VT323", fontSize: 74, letterSpacing: 3, color: SIG,
                textShadow: `0 0 22px rgba(70,255,150,0.75), 0 0 52px rgba(70,255,150,0.35)`,
              }}
            >
              magazine.com
            </div>
          </div>

          {/* the strip, then the honest line the catalog banner also carries */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Michroma", fontSize: 27, letterSpacing: 6, color: GREY }}>
              DISCOVERY · COMMERCE · COMMUNITY
            </div>
            <div style={{ display: "flex", height: 1, marginTop: 22, background: FAINT, opacity: 0.7 }} />
            <div style={{ display: "flex", marginTop: 18, fontSize: 22, letterSpacing: 3, color: GREY }}>
              A DEMO ARCHIVE OF SYNTHETIC SAMPLE RECORDS
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Michroma", data: MICHROMA, style: "normal", weight: 400 },
        { name: "STM", data: STM, style: "normal", weight: 400 },
        { name: "VT323", data: VT323, style: "normal", weight: 400 },
      ],
    }
  );
}
