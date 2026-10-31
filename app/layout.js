// app/layout.js
// Root layout: every page renders inside the magazine shell.

import "./globals.css";
import Shell from "./shell.js";
import { SITE_ORIGIN, siteUrl } from "../lib/site.js";
import { GROUND } from "../lib/grounds.js";

// Site-level metadata. `metadataBase` makes every relative canonical and
// og:url below resolve; without it Next emits them relative and they are
// worthless to a crawler.
//
// The catalog can now contain both native Storefront inventory and the older
// demo archive. Metadata names both; each product surface carries the more
// specific provenance and checkout-readiness disclosure.
//
// Product JSON-LD is deliberately absent (the catalog is synthetic). og:image
// is NOT absent any more — app/opengraph-image.js generates it. See
// docs/seo-notes.md.
// THE WHOLE SCREEN (30 Oct 2026, the owner's iPhone recording: the Feed showed through the strip between the status
// bar and the Masthead). The shell was built for it — the Masthead's height and padding and its line add
// env(safe-area-inset-top), the deck's foot env(safe-area-inset-bottom) — but without viewport-fit=cover those
// insets were 0 and Safari left the strip to the page.
// THE BROWSER'S OWN CHROME IN THE GROUND'S COLOUR (the store shell, 30 Oct 2026): Safari's bars (and any
// browser's task switcher) take theme-color, one per scheme, from the same hex as the manifest and the native shell
// (lib/grounds.js). The theme follows the device unless pinned in Settings; a pinned theme keeps the device's bar.
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: GROUND.light },
    { media: "(prefers-color-scheme: dark)", color: GROUND.dark },
  ],
};

export const metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "*ASILUM",
    template: "%s · *ASILUM",
  },
  description:
    "A personalized culture and style terminal with native Storefront goods and clearly labeled synthetic sample records, routed through your optional Asterisk Passport.",
  alternates: { canonical: "/" },
  // THE HOME SCREEN (the store shell, 30 Oct 2026): the icons scripts/store-assets.mjs draws from the wordmark,
  // the home-screen name, and a standalone page under the status bar for "Add to Home Screen" (app/manifest.js
  // is the manifest, linked by Next). The native shell in ios/ carries its own copies.
  applicationName: "*ASILUM",
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "*ASILUM", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "*ASILUM — personalized fashion terminal",
    description:
      "A personalized culture and style terminal with native Storefront goods and clearly labeled synthetic sample records.",
    url: siteUrl("/"),
    siteName: "*ASILUM",
    type: "website",
    locale: "en_US",
  },
  // `summary_large_image` since 17 August, and ONLY because the image now
  // exists: app/opengraph-image.js generates a real 1200x630 card, verified
  // served as image/png at those exact dimensions. This was held at `summary`
  // while there was nothing to fill it — a large card with no image is worse
  // than a small one. The two move together, and tests/seo.test.js pins the
  // pairing in both directions so neither can ship without the other.
  twitter: { card: "summary_large_image", title: "*ASILUM — personalized fashion terminal" },
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

// The theme is applied before first paint so a returning passenger never
// sees a flash of the wrong chrome. (V.2: the ORB HUB second interface is
// gone; there is one interface.)
// The theme follows the device by default, with Light, Dark and System in
// Settings (V.2 Blueprint, owner, 17 Oct 2026, clause 2.24 — supersedes the
// 1 Oct "always light" default). Only an explicit pick ("dark"/"light" in
// asilum-theme) overrides the device.
// DESIGN CONSOLE hand edits (asilum-uilab) ride the same train: --ed-* vars
// land inline on <html> so an edited layout never flashes the shipped one.
// Key/value grammar mirrors lib/uilab.js validValue — keep them in sync.
const PREPAINT = `try{var r=document.documentElement;var t=localStorage.getItem("asilum-theme");if(t!=="dark"&&t!=="light")t=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";r.dataset.theme=t;var o=JSON.parse(localStorage.getItem("asilum-uilab")||"{}");for(var k in o){if(/^--ed-[a-z-]+$/.test(k)&&/^(none|-?\\d+(\\.\\d+)?(px|em|s|%|svh)?)$/.test(o[k]))r.style.setProperty(k,o[k]);}}catch(e){}`;

// THE TEST CONTROLS (the side buttons: the ticker's and the theme's) stay off the live site (owner, 29 Oct 2026, going
// live: "hide them live"); previews and local builds keep them. Vercel names the production deploy in VERCEL_ENV, read
// here on the server; unset (local), they show.
const TEST_CONTROLS = process.env.VERCEL_ENV !== "production";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
        <Shell testControls={TEST_CONTROLS}>{children}</Shell>
      </body>
    </html>
  );
}
