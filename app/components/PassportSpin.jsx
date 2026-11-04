"use client";

// app/components/PassportSpin.jsx — THE PASSPORT, LIFTED AND SPUN (owner, 3 Nov
// 2026: "I want a user to click on their passport and have it isolate it in
// space and spin it"). A tap on the document on /board lifts it out of the
// page: the page stays where it was behind the fog (PieceFloat's), and the
// passport hangs in the middle as a card with two faces — the data page in
// front, exactly the page the board prints (PassportDocument.jsx, read-only),
// and on the back the small outlined asterisk over ASILUM TASTE PASSPORT in
// the logo's white, glowing, on black in dark and the feed's ground in light.
//
// THE TURN (the owner's turntable, rendered first as a film the same day):
// the front held, a slow spin that winds into one fast full turn, slowing
// onto the back — where the asterisk blinks red three times and holds one
// glow — then round to the front again; after that the card hangs with a
// gentle sway and turns under the hand (a drag spins it, with a little
// inertia). A tap on the fog, ×, Escape or the key puts it back.
//
// Reduced motion: the card lifts and holds still — no turn, no blink, no
// sway; a drag still turns it, since that is the person's own hand.

import { useEffect, useRef, useState } from "react";
import { useEscape, useFocusTrap } from "./dismiss.js";
import PassportDocument from "./PassportDocument.jsx";
import PassportSecurity from "./PassportSecurity.jsx";
import { haptic } from "../../lib/haptics.js";
import { TURN, turnAt } from "../../lib/passport/turn.js";

const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function PassportSpin({ uid, info, taste, lang, mrz, photo, map, onClose }) {
  const layerRef = useRef(null);
  const cardRef = useRef(null);
  const astRef = useRef(null);
  const closeRef = useRef(null);
  const [still] = useState(reduced);
  useEscape(onClose, true);
  useFocusTrap(layerRef, true);

  useEffect(() => {
    haptic("press");
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // the turn, then the hand: one clock drives the card; a drag adds its own spin with a little inertia
  useEffect(() => {
    const card = cardRef.current, ast = astRef.current;
    if (!card) return undefined;
    let raf = 0, t0 = performance.now(), extra = 0, vel = 0, dragging = false, lastX = 0, lastT = 0;
    const draw = (now) => {
      const t = (now - t0) / 1000;
      const turn = still ? { angle: 0, red: false, glow: 0 } : turnAt(t);
      if (!dragging) { extra += vel; vel *= 0.95; if (Math.abs(vel) < 0.01) vel = 0; }
      const sway = still || t < TURN ? 0 : 4 * Math.sin((t - TURN) * 0.9);
      const tilt = still ? 0 : -(6 + 2 * Math.sin(t * 0.9));
      const bob = still ? 0 : 10 * Math.sin(t * 1.3);
      card.style.transform = `translateY(${bob}px) rotateX(${tilt}deg) rotateY(${turn.angle + sway + extra}deg)`;
      if (ast) {
        ast.classList.toggle("red", turn.red);
        ast.style.setProperty("--swell", String(turn.glow));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const down = (e) => { dragging = true; lastX = e.clientX; lastT = performance.now(); vel = 0; card.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      const now = performance.now(); const dx = e.clientX - lastX;
      extra += dx * 0.5; vel = (dx * 0.5) / Math.max(1, (now - lastT) / 16); lastX = e.clientX; lastT = now;
    };
    const up = () => { dragging = false; };
    card.addEventListener("pointerdown", down); card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up); card.addEventListener("pointercancel", up);
    return () => { cancelAnimationFrame(raf); card.removeEventListener("pointerdown", down); card.removeEventListener("pointermove", move); card.removeEventListener("pointerup", up); card.removeEventListener("pointercancel", up); };
  }, [still]);

  return (
    <div className="ppspin" ref={layerRef} role="dialog" aria-modal="true" aria-label="your passport, lifted out of the page">
      <button type="button" className="ppspinfog" aria-label="back to the page" tabIndex={-1} onClick={onClose} />
      <button ref={closeRef} type="button" className="floatclose ppspinclose" aria-label="back to the page" onClick={onClose}>×</button>
      <div className="ppspinstage">
        <div className="ppspincard" ref={cardRef}>
          <div className="ppspinface ppspinfront">
            <div className="ppdoc ppspindoc" lang="en">
              <PassportSecurity map={map} />
              <PassportDocument uid={uid} info={info} taste={taste} lang={lang} mrz={mrz} photo={photo} />
            </div>
          </div>
          <div className="ppspinface ppspinback" aria-hidden="true">
            <span className="ppspinast" ref={astRef}>*</span>
            <span className="ppspinword">ASILUM TASTE PASSPORT</span>
          </div>
        </div>
      </div>
      <p className="ppspinhint">{still ? "drag to turn it" : "drag to turn it · tap the fog to put it back"}</p>
    </div>
  );
}
