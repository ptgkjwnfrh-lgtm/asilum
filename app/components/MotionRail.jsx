"use client";

// app/components/MotionRail.jsx — THE MOTION ROW (owner's feed sketch, 25
// Oct 2026: "motions that will be recommended — 20 videos in the same
// formation as figure 20, the way X and Instagram recommend video"; late
// that night: the recommended motions are Figure 20 again, the size of a
// motion post; then: "make it so it has VIDEOS YOU MAY LIKE floating where
// it says the profile pic and user names, and for each video it lands on
// allow its caption to appear as well, so the caption fixture changes for
// each video"). The stream's MOTION posts, up to 20 (lib/feed/tetris.js
// motionRail), as 9:16 cards in Figure 20 (Fig20.jsx), laid out as a
// carousel post is — the head and the caption float on the feed, no housing.
// Only the centre card plays, muted and looping; the rest hold their first
// frame; the caption is the centre card's. A tap on the centre card opens
// the motion in its popup. Reduced motion: nothing autoplays.

import { useCallback, useEffect, useRef, useState } from "react";
import Fig20 from "./Fig20.jsx";
import { Cut } from "./Cut.jsx";
import { Caption } from "./PostCard.jsx";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";

function videoOf(p) {
  const a = p.attachments || {};
  return (a.video && a.video.url ? a.video : null) || p.video || null;
}

export default function MotionRail({ posts }) {
  const ref = useRef(null);
  const settleRef = useRef(null);
  const [at, setAt] = useState(Math.floor((posts.length - 1) / 2)); // the centre card, whose caption shows
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
  const onSettle = useCallback((i) => { setAt(i); if (settleRef.current) settleRef.current(i); }, []);
  const cur = posts[Math.max(0, Math.min(posts.length - 1, at))] || {};
  const caption = [cur.title, cur.text].filter(Boolean).join(" — ") || cur.name || cur.handle || "";
  return (
    <section className="card wpostcard p2 withmedia f20post motionrail" ref={ref} data-id="rail:motion" data-type="MOTION" aria-label={`${posts.length} videos you may like`}>
      <div className="p2stage">
      <header className="p2head">
        <h3 className="p2user">VIDEOS YOU MAY LIKE</h3>
      </header>
      <Cut className="p2rule" />
      <div className="p2media">
      <Fig20
        aspect={1 / 2}
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
      </div>
      <div className="p2foot">
        {/* the centre video's own caption; keyed so it folds again for each one */}
        <Caption key={String(cur.serverId ?? cur.id ?? at)} text={caption} />
      </div>
      </div>
    </section>
  );
}
