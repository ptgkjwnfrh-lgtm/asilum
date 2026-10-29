"use client";

// app/components/GroundInk.jsx — THE GROUND'S INK, measured (owner, 29 Oct 2026: "all text should be reactive, glow
// when background is dark, solid black or grey when background is light, so THE FEED should glow in light mode
// because its on a dark background"; lib/ink.js GROUND_TEXT, groundLuma, groundMix). Mounted once by the shell. The
// words on the page's own ground carry --gl, how far they lean to the dark ink (0 on a dark ground, glowing white;
// 1 on a bright one, solid), and data-ground; the CSS mixes their colour and their glow from it. The ground is a
// fixed gradient the words scroll through, so --gl is worked out on every scroll frame for the words near the
// screen — arithmetic on each one's box, no hit test, no pixel read — and written only when it moves.

import { useEffect } from "react";
import { GROUND_TEXT, groundLuma, groundMix, groundFrac } from "../../lib/ink.js";

// WebKit on iOS paints a fixed background as scrolling (app/globals.css, the html rule): there the ground runs the
// page's height, not the screen's. Told by a property only that engine has (a platform-and-touch guess took a
// desktop browser emulating a phone for an iPad, 29 Oct 2026, and read every word as at the page's dark top).
const groundScrolls = () => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-touch-callout", "none");

export default function GroundInk() {
  useEffect(() => {
    const SEL = GROUND_TEXT.join(", ");
    const fixed = !groundScrolls();
    const near = new Set();
    let raf = 0;
    const run = () => {
      raf = 0;
      const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      const at = { fixed, vh: window.innerHeight || 1, scrollY: window.scrollY, docH: document.documentElement.scrollHeight || 1 };
      for (const el of near) {
        if (!el.isConnected) { near.delete(el); continue; }
        const r = el.getBoundingClientRect();
        if (!(r.height > 0)) continue;
        const gl = groundMix(groundLuma(groundFrac(r, at), theme));
        if (el.__gl != null && Math.abs(el.__gl - gl) < 0.01) continue;
        el.__gl = gl;
        el.style.setProperty("--gl", gl.toFixed(3));
        const side = gl > 0.5 ? "light" : "dark";
        if (el.dataset.ground !== side) el.dataset.ground = side;
      }
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(run); };
    // the words within half a screen of the view are worked out each frame; the rest wait their turn
    const io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) near.add(e.target); else near.delete(e.target); } ask(); }, { rootMargin: "50% 0px 50% 0px" });
    const watch = () => document.querySelectorAll(SEL).forEach((el) => { if (!el.__ground) { el.__ground = true; io.observe(el); } });
    watch();
    let wr = 0;
    const mo = new MutationObserver(() => { if (!wr) wr = requestAnimationFrame(() => { wr = 0; watch(); ask(); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    // the words move without a scroll when the page's layout settles under them (the fonts arrive, the Feed loads
    // above them): seen 29 Oct 2026, the modes kept the reading they had at mount, before the layout settled
    const ro = new ResizeObserver(ask);
    ro.observe(document.body);
    window.addEventListener("load", ask);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ask, () => {});
    const theme = new MutationObserver(() => { near.forEach((el) => { el.__gl = null; }); ask(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      io.disconnect(); mo.disconnect(); theme.disconnect(); ro.disconnect();
      window.removeEventListener("load", ask);
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (raf) cancelAnimationFrame(raf);
      if (wr) cancelAnimationFrame(wr);
    };
  }, []);
  return null;
}
