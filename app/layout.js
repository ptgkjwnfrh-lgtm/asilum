// app/layout.js
// Root layout: every page renders inside the magazine shell.

import "./globals.css";
import Shell from "./shell.js";

// Site-level metadata. `metadataBase` makes every relative canonical and
// og:url below resolve; without it Next emits them relative and they are
// worthless to a crawler.
//
// The description says "synthetic sample records" because they are. The
// catalog is a demo (owner ruling, #212) and every piece carries a DEMO label
// on the page — so the sentence a search result shows must not promise
// inventory the site does not have. "The taste engine is real; the clothes are
// not" is the same claim the catalog makes to a reader's face.
//
// Deliberately absent: og:image and Product JSON-LD. See docs/seo-notes.md.
export const metadata = {
  metadataBase: new URL("https://www.asilummagazine.com"),
  title: {
    default: "*ASILUM — fashion intelligence OS",
    template: "%s · *ASILUM",
  },
  description:
    "A learning moodboard engine that reads your taste across six bridges. The catalog is a demo archive of synthetic sample records — the taste engine is real; the clothes are not.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "*ASILUM — fashion intelligence OS",
    description:
      "A learning moodboard engine that reads your taste across six bridges. The catalog is a demo archive of synthetic sample records.",
    url: "https://www.asilummagazine.com/",
    siteName: "*ASILUM",
    type: "website",
    locale: "en_US",
  },
  // `summary`, not `summary_large_image`: there is no OG image asset in
  // public/, and declaring a card size we cannot fill would render a broken
  // preview. Upgrade this the day a real image ships.
  twitter: { card: "summary", title: "*ASILUM — fashion intelligence OS" },
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
