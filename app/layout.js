// app/layout.js
// Root layout: every page renders inside the magazine shell.

import "./globals.css";
import Shell from "./shell.js";

export const metadata = {
  title: "*ASILUM — fashion intelligence OS",
  description:
    "A learning moodboard engine that reads your taste across six bridges and builds a personal feed of listings.",
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
