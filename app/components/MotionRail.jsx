"use client";

// app/components/MotionRail.jsx — THE MOTION ROW (owner's feed sketch, 25
// Oct 2026: "motions that will be recommended — 20 videos in the same
// formation as figure 20, the way X and Instagram recommend video"; late
// that night: the recommended motions are Figure 20 again, the size of a
// motion post, with "RECOMMENDED VIDEOS" where a carousel's author's name
// sits). The stream's MOTION posts, up to 20 (lib/feed/tetris.js
// motionRail), as 9:16 cards in Figure 20 (Fig20.jsx). Only the centre card
// plays, muted and looping; the rest hold their first frame. A tap on the
// centre card opens the motion in its popup. Reduced motion: nothing
// autoplays.

import { useCallback, useEffect, useRef } from "react";
import Fig20 from "./Fig20.jsx";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";

function videoOf(p) {
  const a = p.attachments || {};
  return (a.video && a.video.url ? a.video : null) || p.video || null;
}

export default function MotionRail({ posts }) {
  const ref = useRef(null);
  const settleRef = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const stage = root.querySelector(".f20stage");
    if (!stage) return undefined;
    let centre = Math.floor((posts.length - 1) / 2); // Figure 20 opens in the middle
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
    settleRef.current = (i) => { centre = i; play(); };
    window.addEventListener("scroll", play, { passive: true });
    play();
    return () => { settleRef.current = null; window.removeEventListener("scroll", play); };
  }, [posts]);
  const onSettle = useCallback((i) => { if (settleRef.current) settleRef.current(i); }, []);
  return (
    <section className="card motionrail" ref={ref} data-id="rail:motion" data-type="MOTION" aria-label={`${posts.length} recommended videos`}>
      <h3 className="f20head">RECOMMENDED VIDEOS</h3>
      <Fig20
        aspect={9 / 16}
        items={posts.map((p) => ({ key: String(p.serverId ?? p.id), p }))}
        label="recommended videos"
        onSettle={onSettle}
        render={({ p }) => {
          const v = videoOf(p);
          const open = () => { haptic("press"); openSheet("media", p.sample ? { id: p.id, sample: true, title: "MOTION" } : { id: p.serverId, title: "MOTION" }); };
          return (
            <button type="button" className="mrtile" onClick={open} aria-label={"open the motion: " + (p.title || p.name || p.handle || "")}>
              {v ? <video src={v.url} poster={v.poster || undefined} muted playsInline loop preload="metadata" aria-hidden="true" /> : null}
              <span className="mrname">{p.name || p.handle}</span>
            </button>
          );
        }}
      />
    </section>
  );
}
