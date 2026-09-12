// app/layout.js
// Root layout: every page renders inside the magazine shell.

import "./globals.css";
import Shell from "./shell.js";
import { SITE_ORIGIN, siteUrl } from "../lib/site.js";

// Site-level metadata. `metadataBase` makes every relative canonical and
// og:url below resolve; without it Next emits them relative and they are
// worthless to a crawler.
//
// THE DESCRIPTION MAKES NO CLAIM ABOUT THE CATALOG'S NATURE, and that is
// deliberate. It used to say "a demo archive of synthetic sample records"
// (owner ruling #212), which was true of the 915 seeded rows and became false
// the moment they were deleted and 897 real eBay listings stood in their place
// — at which point every search result, link preview and shared card was
// telling strangers that real inventory was fake. Static metadata cannot see
// the shelf, so it describes what the site DOES, which is true in either
// state. The per-record DEMO flag and the page banner (lib/social.js
// anyDemoRecord) carry the disclosure, because they can actually look.
// (superseded note, kept for history) The description said "synthetic sample
// records" because they were; every piece carries a DEMO label
// on the page — so the sentence a search result shows must not promise
// inventory the site does not have. "The taste engine is real; the clothes are
// not" is the same claim the catalog makes to a reader's face.
//
// Product JSON-LD is deliberately absent (the catalog is synthetic). og:image
// is NOT absent any more — app/opengraph-image.js generates it. See
// docs/seo-notes.md.
export const metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "*ASILUM magazine — personalized fashion terminal",
    template: "%s · *ASILUM magazine",
  },
  description:
    "A personalized fashion terminal that learns what you wear and what you are looking for, and reads archive listings across the internet. Records shown for demonstration are labelled as such on the piece.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "*ASILUM magazine — personalized fashion terminal",
    description:
      "A personalized fashion terminal that learns what you wear and what you are looking for, and reads archive listings across the internet.",
    url: siteUrl("/"),
    siteName: "*ASILUM magazine",
    type: "website",
    locale: "en_US",
  },
  // `summary_large_image` since 17 August, and ONLY because the image now
  // exists: app/opengraph-image.js generates a real 1200x630 card, verified
  // served as image/png at those exact dimensions. This was held at `summary`
  // while there was nothing to fill it — a large card with no image is worse
  // than a small one. The two move together, and tests/seo.test.js pins the
  // pairing in both directions so neither can ship without the other.
  twitter: { card: "summary_large_image", title: "*ASILUM magazine — personalized fashion terminal" },
  // Search-console ownership proofs, env-gated: each tag renders ONLY when the
  // owner pastes the engine's code into Vercel env (SETUP-KEYS / seo-notes
  // "getting indexed"). These are public ownership tokens, not secrets — but an
  // absent env var must add nothing. Google Search Console → the "HTML tag"
  // method; Bing Webmaster Tools (whose index also serves Yahoo and
  // DuckDuckGo) → the meta-tag method.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.BING_SITE_VERIFICATION
      ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
      : {}),
  },
};

// Theme + interface mode are applied before first paint so a returning
// light-theme or ORB HUB user never sees a flash of the wrong chrome.
// Theme default follows the device (owner order, Aug 12): only an explicit
// SETTINGS pick ("dark"/"light" in asilum-theme) overrides prefers-color-scheme.
// DESIGN CONSOLE hand edits (asilum-uilab) ride the same train: --ed-* vars
// land inline on <html> so an edited layout never flashes the shipped one.
// Key/value grammar mirrors lib/uilab.js validValue — keep them in sync.
const PREPAINT = `try{var r=document.documentElement;var t=localStorage.getItem("asilum-theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";r.dataset.theme=t;r.dataset.model=localStorage.getItem("asilum-model")||"01";var o=JSON.parse(localStorage.getItem("asilum-uilab")||"{}");for(var k in o){if((/^--ed-[a-z-]+$/.test(k)||k==="--glow-ink")&&/^(none|-?\\d+(\\.\\d+)?(px|em|s|%)?)$/.test(o[k]))r.style.setProperty(k,o[k]);}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
