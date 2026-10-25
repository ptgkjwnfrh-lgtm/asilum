"use client";

// app/components/MotionRail.jsx — THE MOTION ROW (owner's feed sketch, 25
// Oct 2026: "motions that will be recommended — 20 videos in the same
// formation as figure 20 that mimic the video recommendations on X and on
// Instagram"). The stream's MOTION posts, up to 20 (lib/feed/tetris.js
// motionRail), as tall 9:16 tiles in Figure 20. Only the centre tile plays,
// muted and looping; the rest hold their first frame. A tap opens the
// motion in its popup. Reduced motion: nothing autoplays.

import { useEffect, useRef } from "react";
import Fig20 from "./Fig20.jsx";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";

function videoOf(p) {
  const a = p.attachments || {};
  return (a.video && a.video.url ? a.video : null) || p.video || null;
}

export default function MotionRail({ posts }) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const stage = root.querySelector(".f20stage");
    if (!stage) return undefined;
    let centre = Math.floor((posts.length - 1) / 2); // Fig20 opens in the middle
    const play = () => {
      const r = stage.getBoundingClientRect();
      const inView = r.bottom > 0 && r.top < window.innerHeight;
      stage.querySelectorAll(".f20card").forEach((card, i) => {
        const v = card.querySelector("video");
        if (!v) return;
        if (i === centre && inView) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        else v.pause();
      });
    };
    const settle = (e) => { centre = e.detail.index; play(); };
    stage.addEventListener("f20settle", settle);
    window.addEventListener("scroll", play, { passive: true });
    play();
    return () => { stage.removeEventListener("f20settle", settle); window.removeEventListener("scroll", play); };
  }, [posts]);
  return (
    <section className="card motionrail" ref={ref} data-id="rail:motion" data-type="MOTION" aria-label={`${posts.length} motions for you`}>
      <h3 className="mrhead">MOTIONS FOR YOU</h3>
      <Fig20
        aspect={9 / 16}
        items={posts.map((p) => ({ key: String(p.serverId ?? p.id), p }))}
        label="motions"
        render={({ p }) => {
          const v = videoOf(p);
          const open = () => { haptic("press"); openSheet("media", p.sample ? { id: p.id, sample: true, title: "MOTION" } : { id: p.serverId, title: "MOTION" }); };
          return (
            <button type="button" className="mrtile" onClick={open} aria-label={"open the motion: " + (p.title || p.name || p.handle || "")}>
              {v ? <video src={v.url} poster={v.poster || undefined} muted playsInline loop preload="metadata" aria-hidden="true" /> : null}
              <span className="mrname">{p.sample ? p.name : (p.name || p.handle)}{p.sample ? " · SAMPLE" : ""}</span>
            </button>
          );
        }}
      />
    </section>
  );
}
