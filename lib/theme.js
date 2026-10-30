// lib/theme.js — TURNING THE THEME, in one place (28 Oct 2026, "tighten up all animations and loose ends": the
// side button and Settings each wrote the theme themselves). A pick of "light" or "dark" is pinned on this device
// (asilum-theme, which the prepaint in app/layout.js reads first); "system" hands the theme back to the device.
// The turn cross-fades (a View Transition, the page's old look fading into the new over --dur-2) where the browser
// has them and motion is allowed; otherwise it is immediate. The fade also hides the turn's one heavy frame — every
// token on the page changes, a whole-page restyle — behind the old picture.

export const THEME_KEY = "asilum-theme";
export const THEMES = Object.freeze(["light", "dark", "system"]);

/** What a theme pick does to the page and to this device's memory, as plain steps (testable without a page). */
export function themeSteps(mode, prefersLight) {
  if (mode === "system") return { theme: prefersLight ? "light" : "dark", store: null };
  if (mode === "light" || mode === "dark") return { theme: mode, store: mode };
  return null;
}

/** Turn the page to `mode` ("light", "dark" or "system"), cross-faded unless `animate` is false or motion is
 *  reduced. Returns the theme the page shows, or null for a mode it does not know. */
export function applyTheme(mode, { animate = true } = {}) {
  if (typeof document === "undefined") return null;
  const steps = themeSteps(mode, window.matchMedia("(prefers-color-scheme: light)").matches);
  if (!steps) return null;
  const turn = () => {
    document.documentElement.dataset.theme = steps.theme;
    try {
      if (steps.store) window.localStorage.setItem(THEME_KEY, steps.store);
      else window.localStorage.removeItem(THEME_KEY);
    } catch { /* a private window: the turn still happens, for this page view */ }
  };
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !still && typeof document.startViewTransition === "function") document.startViewTransition(turn);
  else turn();
  return steps.theme;
}
