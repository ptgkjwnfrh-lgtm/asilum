"use client";

// app/components/KeyBrick.jsx — THE KEY BRICK (owner, 4 Nov 2026: "pay
// attention to the shape the Asilum logo is in. I want the housing for the
// wardrobe, statistics and bank buttons to look like that shape, for the
// follow and message buttons to fit cleanly into it also, allow room for a
// banner in there and for the banner to end in a gradient").
//
// The account page's key row sits in the logo's own brick (lib/wordmark.js
// housing): white, in the Masthead's white glow, square at its left edge
// where it runs off the pane, flat along the top, then the slant at the
// logo's angle through the rounded shoulder and toe onto the thin line, which
// runs on to the pane's right edge. The keys are cut the logo's way — the
// logo's black on the white — and sit under a band left for the BANNER: the
// person's own picture fills the brick from the left and ends in a gradient
// into the white before the slant (an SVG mask, so the fade is the brick's,
// not a box's). Without a banner the band stays: it is the brick's room.
//
// The brick is drawn to the box it measures (a ResizeObserver; the keys set
// the height — the band, then the rows), so the angle is the logo's at
// every width: on a phone the keys wrap under the band and the slant takes
// the banner's top-right corner, where the gradient has already faded it.
// `--kb-cut` is the slant's intrusion at the keys' top, kept clear of them.

import { useId, useLayoutEffect, useRef, useState } from "react";
import { housing } from "../../lib/wordmark.js";

const PHONE = 560;

export default function KeyBrick({ banner = null, children, className = "" }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  const id = "kb" + useId().replace(/[^a-zA-Z0-9]/g, "");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const read = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (b && Math.abs(b.w - r.width) < 0.5 && Math.abs(b.h - r.height) < 0.5 ? b : { w: r.width, h: r.height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const phone = !box || box.w < PHONE;
  const band = phone ? 34 : 48;                       // the banner's room above the keys
  const g = box ? housing(box.w, box.h, { line: phone ? 2.5 : 3, bend: phone ? 6 : 8 }) : null;
  // the slant's intrusion at the keys' top, less the bend and a breath
  const cut = g ? Math.max(0, Math.ceil(box.w - (g.at(band) - g.bend - 8))) : 0;
  return (
    <div ref={ref} className={("kbrick " + className).trim()} style={{ "--kb-band": band + "px", "--kb-cut": cut + "px" }}>
      {g ? (
        <svg className="kbart" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true" focusable="false">
          <defs>
            <clipPath id={id + "c"}><path d={g.d} /></clipPath>
            {/* the banner's end: solid to 42% of the brick, gone by 80% — before the slant, in the white */}
            <linearGradient id={id + "f"} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0.42" stopColor="#fff" />
              <stop offset="0.8" stopColor="#000" />
            </linearGradient>
            <mask id={id + "m"} maskUnits="userSpaceOnUse" x="0" y="0" width={box.w} height={box.h}>
              <rect x="0" y="0" width={box.w} height={box.h} fill={`url(#${id}f)`} />
            </mask>
          </defs>
          <path className="kbslab" d={g.d} />
          {banner ? (
            <image className="kbbanner" href={banner} x="0" y="0" width={box.w} height={box.h} preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${id}c)`} mask={`url(#${id}m)`} />
          ) : null}
        </svg>
      ) : null}
      <div className="kbkeys">{children}</div>
    </div>
  );
}
