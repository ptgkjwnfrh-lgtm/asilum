// lib/grounds.js — THE GROUNDS AS HEX, for the few places that cannot read a CSS token: the browser's theme-color
// (app/layout.js), the web app manifest (app/manifest.js), the native shell's background (capacitor.config.json)
// and the store icons and splashes (scripts/store-assets.mjs). app/globals.css is the source — --bg in :root and
// in [data-theme="light"], --warn in :root — and tests/store-readiness.test.js reads it to keep these equal to it;
// a colour that lives in two files is a colour that drifts. Nothing else may read these: a component takes its
// colours from the tokens (the UI law, .claude/skills/asilum-ui).
export const GROUND = Object.freeze({ dark: "#030505", light: "#f4f8fb" });

/** The asterisk's red (--warn in dark; the logo's star is --wm-star: var(--warn)). */
export const WARN = "#ff4136";
