"use client";

// app/components/GlassPane.jsx — one pane of the app's liquid glass, for any
// page (owner, 9 Sep evening: "make sure you utilize liquid glass when
// changing the account and the wire"). The optics are LiquidGlass.jsx's
// (useLiquidGlass: the refraction map on Chromium, the pointer's shine, the
// reduced-motion still); the look is the passport's pane and the upload
// station's card (.gxcard.lg), lifted into a class of its own — `.lgpane` in
// globals.css — so PROFILE and THE WIRE speak the same glass without a
// third copy of the recipe. No page-side bend: what lies under these panes
// is the page itself, and bending a page-sized element per frame is trap
// 151 territory — Safari gets the pane without the bend, as /upload does.
//
// <GlassPane glass="lg-unique-id" className="…" as="section">…</GlassPane>
// `glass` must be unique on the page: it is the SVG filter's id.

import { useRef } from "react";
import { useLiquidGlass } from "./LiquidGlass.jsx";

export default function GlassPane({ glass, className = "", strength = 0.5, as: Tag = "section", children, ...rest }) {
  const ref = useRef(null);
  const defs = useLiquidGlass(ref, { id: glass, strength });
  return (
    <Tag ref={ref} className={"lgpane lg " + className} {...rest}>
      {defs}
      {children}
    </Tag>
  );
}
