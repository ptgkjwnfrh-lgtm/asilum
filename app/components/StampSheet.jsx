"use client";

// app/components/StampSheet.jsx — THE SPACE ZONE (owner, 3 Nov 2026: "so you click them and they go into a
// space zone and theyre 3d and the description of what it is appears"). The STAMP popup (SheetHost VIEWS):
// the badge as a coin in depth — its face (PassportBadge.jsx), an edge of stacked layers of its own metal, a
// back with the house's mark — flung in on opening and settling into a slow turn; drag to spin it with
// momentum, tap to turn it over; then what it means, how it is read, and where it stands: EARNED with the
// date and the piece that earned it, NOT YET, or LOCKED with what the house waits for (never a guess).
// PREV / NEXT walk the catalogue. Under prefers-reduced-motion the coin stands still and turns only by hand.
//
// An ACHIEVEMENT's (the Wardrobe's, Achievements.jsx): props `id` and `states`, the reading of every
// achievement (id → { earned, at, evidence, waits }), so the zone shows exactly what the rail showed, PREV /
// NEXT walking the catalogue. Props are the popup's (JSON).

import { useEffect, useRef, useState } from "react";
import PassportBadge from "./PassportBadge.jsx";
import { MILESTONES, GROUPS, milestone } from "../../lib/passport/milestones.js";
import { shapePath } from "../../lib/passport/badges.js";
import { haptic } from "../../lib/haptics.js";

const EDGE = 14; // layers in the coin's edge
const when = (at) => { const d = at ? new Date(at) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() : ""; };

function Coin({ m, earned }) {
  const coinRef = useRef(null);
  const st = useRef({ a: -540, v: 0, drag: null, last: 0 });
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = st.current;
    S.a = reduced ? 0 : -540; S.v = reduced ? 0 : 22; // flung in: fast, then settling
    let raf = 0;
    const draw = () => { if (coinRef.current) coinRef.current.style.transform = `rotateX(-8deg) rotateY(${S.a.toFixed(2)}deg)`; };
    const tick = () => {
      if (!S.drag) {
        S.a += S.v;
        S.v *= 0.94;
        if (!reduced && Math.abs(S.v) < 0.35) S.v = S.v >= 0 ? 0.35 : -0.35; // the idle turn
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    if (reduced) draw(); else raf = requestAnimationFrame(tick);
    const el = coinRef.current && coinRef.current.parentElement;
    const down = (e) => { S.drag = { x: e.clientX, a: S.a, t: performance.now(), moved: false }; S.last = e.clientX; el.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!S.drag) return;
      const dx = e.clientX - S.drag.x;
      if (Math.abs(dx) > 4) S.drag.moved = true;
      S.v = (e.clientX - S.last) * 0.6; S.last = e.clientX;
      S.a = S.drag.a + dx * 0.8;
      if (reduced) draw();
    };
    const up = () => {
      if (!S.drag) return;
      if (!S.drag.moved) { S.v = reduced ? 0 : 9; if (reduced) { S.a += 180; draw(); } haptic("tick"); } // a tap turns it over
      S.drag = null;
      if (reduced) S.v = 0;
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, [m.id]);

  const d = shapePath(m.shape);
  return (
    <div className="ppspacestage" role="img" aria-label={`${m.title} — ${earned ? "earned" : "not earned"}. drag to spin it, tap to turn it over.`}>
      <div className="ppcoin" ref={coinRef}>
        {Array.from({ length: EDGE }, (_, i) => (
          <svg key={i} className={"ppcoinedge ink-" + m.ink + (earned ? "" : " locked")} viewBox="0 0 120 120" aria-hidden="true"
            style={{ transform: `translateZ(${(-(i + 1) * 0.9).toFixed(1)}px)` }}>
            <path d={d} />
          </svg>
        ))}
        <div className="ppcoinface back" style={{ transform: `rotateY(180deg) translateZ(${(EDGE + 1) * 0.9}px)` }}>
          <PassportBadge shape={m.shape} emblem="*" small="ASILUM" ink={m.ink} earned={earned} />
        </div>
        <div className="ppcoinface front"><PassportBadge shape={m.shape} emblem={m.emblem} small={m.small} ink={m.ink} earned={earned} /></div>
      </div>
      <div className="ppcoinshadow" aria-hidden="true" />
    </div>
  );
}

export default function StampSheet({ id, states = {} }) {
  return <Achievement id={id} states={states} />;
}

function Achievement({ id, states }) {
  const [cur, setCur] = useState(id);
  const m = milestone(cur) || MILESTONES[0];
  const s = states[m.id] || {};
  const earned = !!s.earned;
  const waits = m.read === "waits" ? m.waits : s.waits || "";
  const i = MILESTONES.indexOf(m);
  const step = (k) => { haptic("tick"); setCur(MILESTONES[(i + k + MILESTONES.length) % MILESTONES.length].id); };
  const group = GROUPS.find((g) => g.id === m.group);

  return (
    <section className="ppspace" aria-label="stamp">
      <Coin m={m} earned={earned} />
      <div className="ppspaceread" aria-live="polite">
        <span className="ppspacegroup">{group ? group.label : ""} · {String(i + 1).padStart(2, "0")} / {String(MILESTONES.length).padStart(2, "0")}</span>
        <h3 className={"ppspacettl ink-" + m.ink + (earned ? " earned" : "")}>{m.title}</h3>
        <p className="ppspacemeans">{m.means}</p>
        <div className={"ppspacestate" + (earned ? " earned" : waits ? " waits" : "")}>
          {earned ? (
            <>
              <b>EARNED{when(s.at) ? " · " + when(s.at) : ""}</b>
              {s.evidence && (s.evidence.title || s.evidence.brand) && <span>{[s.evidence.brand, s.evidence.title].filter(Boolean).join(" — ")}</span>}
            </>
          ) : waits ? (
            <><b>LOCKED</b><span>waits for {waits}.</span></>
          ) : (
            <><b>NOT YET</b><span>it lights the moment it happens — no timer, no streak to lose.</span></>
          )}
        </div>
        {m.how && <p className="ppspacehow">{m.how}</p>}
        <div className="ppspacekeys">
          <button className="txtbtn" onClick={() => step(-1)}>← PREV</button>
          <button className="txtbtn" onClick={() => step(1)}>NEXT →</button>
        </div>
      </div>
    </section>
  );
}
