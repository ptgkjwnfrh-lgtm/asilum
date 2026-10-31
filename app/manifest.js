// app/manifest.js — THE WEB APP MANIFEST, served at /manifest.webmanifest and linked from every page by Next
// (the store shell, 30 Oct 2026). It is what "Add to Home Screen" reads on a phone, and what Lighthouse's
// installability check looks for: the name, the icons (scripts/store-assets.mjs draws them from
// the wordmark), the ground's colour behind the splash and the standalone display. The native shell does not
// read it — Capacitor loads the live site in its own WebView — but a passenger without the app gets the same
// icon on the home screen.
import { GROUND } from "../lib/grounds.js";

export default function manifest() {
  return {
    id: "/",
    name: "*ASILUM",
    short_name: "*ASILUM",
    description: "A personalized culture and style terminal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: GROUND.dark,
    theme_color: GROUND.dark,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
