"use client";

// app/components/KeyBrick.jsx — THE KEY BRICK (owner, 4 Nov 2026: "pay
// attention to the shape the Asilum logo is in. I want the housing for the
// wardrobe, statistics and bank buttons to look like that shape, for the
// follow and message buttons to fit cleanly into it also, allow room for a
// banner in there and for the banner to end in a gradient"; then: "I want
// the shape to be flipped horizontally so that the buttons stay where they
// are, they just now have the shape encasing it").
//
// The logo's brick, mirrored, at the row's right end (lib/wordmark.js
// housing, side "right"): white in the Masthead's white glow, square where
// it runs off the pane's right edge, flat along the top, then the slant at
// the logo's angle through the rounded shoulder and toe down to the thin
// line, which runs on to the left under FOLLOW (or EDIT PROFILE) and MESSAGE
// — those keys stay where they were, standing on the line as the Masthead's
// keys stand on the logo's. The slab encases the wardrobe · statistics ·
// banking cluster, cut the logo's way (the logo's black on the white), with
// the BANNER's band above it: the person's picture fills the slab from the
// right and ends in a gradient into the white before the slant (an SVG mask,
// so the fade is the brick's, not a box's). Without a banner the band stays.
//
// Drawn to what it measures (a ResizeObserver on the row): the slab's
// shoulder is set from the cluster's own edge — the slant clears it at the
// cluster's top by a breath — and the toe stops short of MESSAGE, so the
// angle is the logo's at every width the row allows. On a phone the row
// folds: FOLLOW and MESSAGE on a row of their own, the brick on the next,
// its line running from the pane's left edge.

import { useId, useLayoutEffect, useRef, useState } from "react";
import { housing, SLANT_RUN } from "../../lib/wordmark.js";

const PHONE = 560;

export default function KeyBrick({ banner = null, left = null, right = null, className = "" }) {
  const house = useRef(null);
  const brick = useRef(null);
  const cluster = useRef(null);
  const leftRef = useRef(null);
  const [m, setM] = useState(null);
  const id = "kb" + useId().replace(/[^a-zA-Z0-9]/g, "");
  useLayoutEffect(() => {
    const el = house.current, br = brick.current;
    if (!el || !br || typeof ResizeObserver === "undefined") return undefined;
    const read = () => {
      const H = el.getBoundingClientRect(), B = br.getBoundingClientRect();
      const C = cluster.current ? cluster.current.getBoundingClientRect() : null;
      const L = leftRef.current ? leftRef.current.getBoundingClientRect() : null;
      const next = {
        w: H.width, h: B.height, off: B.left - H.left,            // the brick's box, and where it starts in the row
        clusterLeft: C ? C.left - H.left : null, clusterTop: C ? C.top - B.top : null,
        leftRight: L && L.width > 0 && L.top < B.bottom && L.bottom > B.top ? L.right - H.left : 0, // the left keys' end, when they share the brick's row
      };
      setM((p) => (p && Object.keys(next).every((k) => Math.abs((p[k] ?? -1) - (next[k] ?? -1)) < 0.5) ? p : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el); ro.observe(br);
    if (cluster.current) ro.observe(cluster.current);
    if (leftRef.current) ro.observe(leftRef.current);
    return () => ro.disconnect();
  }, [left, right]);

  const phone = !m || m.w < PHONE;
  const band = phone ? 34 : 48;                       // the banner's room above the cluster
  const bend = phone ? 6 : 8, line = phone ? 2.5 : 3, breath = bend + 8;
  let g = null;
  if (m) {
    // the slab must hold the cluster: at the cluster's top the slant stands a breath left of it
    const want = m.clusterLeft != null ? (m.w - m.clusterLeft) + breath - SLANT_RUN * (m.clusterTop ?? band) : m.w * 0.45;
    // the toe stops a breath short of the left keys (none on the brick's row: the pane's edge)
    const lineRun = Math.max(breath, m.leftRight + breath);
    g = housing(m.w, m.h, { side: "right", line, bend, lineRun, shoulder: want });
    if (m.clusterLeft != null && g.at(m.clusterTop ?? band) > m.clusterLeft - breath) {
      // steepened: widen the slab by what the slant still takes at the cluster's top
      g = housing(m.w, m.h, { side: "right", line, bend, lineRun, shoulder: want + (g.at(m.clusterTop ?? band) - (m.clusterLeft - breath)) });
    }
  }
  const fadeFrom = g ? g.shoulderX - 0.18 * (m.w - g.shoulderX) : 0, fadeTo = g ? g.shoulderX + 0.5 * (m.w - g.shoulderX) : 0;
  // nothing to encase and no banner (a public page without a cluster): the keys stand on the line alone
  const bare = !right && !banner;
  return (
    <div ref={house} className={("kbhouse " + (bare ? "bare " : "") + className).trim()} style={{ "--kb-band": band + "px", "--kb-line": line + "px" }}>
      {left ? <div ref={leftRef} className="kbleft">{left}</div> : null}
      <div ref={brick} className="kbrick">
        {bare && m ? (
          <svg className="kbart bare" style={{ left: -m.off + "px" }} width={m.w} height={line} viewBox={`0 0 ${m.w} ${line}`} aria-hidden="true" focusable="false">
            <rect className="kbslab" x="0" y="0" width={m.w} height={line} />
          </svg>
        ) : g ? (
          <svg className="kbart" style={{ left: -m.off + "px" }} width={m.w} height={m.h} viewBox={`0 0 ${m.w} ${m.h}`} aria-hidden="true" focusable="false">
            <defs>
              <clipPath id={id + "c"}><path d={g.d} /></clipPath>
              {/* the banner's end: solid from the slab's right, gone a little past the shoulder — in the white, before the slant */}
              <linearGradient id={id + "f"} gradientUnits="userSpaceOnUse" x1={fadeFrom} y1="0" x2={fadeTo} y2="0">
                <stop offset="0" stopColor="#000" />
                <stop offset="1" stopColor="#fff" />
              </linearGradient>
              <mask id={id + "m"} maskUnits="userSpaceOnUse" x="0" y="0" width={m.w} height={m.h}>
                <rect x="0" y="0" width={m.w} height={m.h} fill={`url(#${id}f)`} />
              </mask>
            </defs>
            <path className="kbslab" d={g.d} />
            {banner ? (
              <image className="kbbanner" href={banner} x={g.shoulderX - 0.3 * (m.w - g.shoulderX)} y="0" width={1.3 * (m.w - g.shoulderX)} height={m.h}
                preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id}c)`} mask={`url(#${id}m)`} />
            ) : null}
          </svg>
        ) : null}
        <div className="kbright">{right ? <div ref={cluster} className="kbcluster">{right}</div> : null}</div>
      </div>
    </div>
  );
}
