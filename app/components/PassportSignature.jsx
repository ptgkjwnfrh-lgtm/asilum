"use client";

// app/components/PassportSignature.jsx — PASSENGER SIGNATURE (owner's mock-up,
// 2 Nov 2026: "for passenger signature it's just going to be the passenger's
// user name but they have the option to actually sign it to add their own
// signature"). The slot prints the username until the passenger signs; SIGN
// opens a pad in the slot itself (no popup — the document is signed where
// it is signed), the stroke drawn in the document's ink, DONE keeps the
// signature ON THIS DEVICE (like the bearer photo: nothing leaves the
// phone), CLEAR returns the slot to the username. The kept signature is a
// mask, not a picture, so it takes the document's ink in either theme.
//
// Pointer events, so a finger, a pencil and a mouse all sign; touch-action
// none on the pad so the page does not scroll under the stroke.

import { useEffect, useRef, useState } from "react";

export const SIGNATURE_KEY = "asilum-pp-sign";

export function readSignature() {
  try { return window.localStorage.getItem(SIGNATURE_KEY) || null; } catch { return null; }
}

export default function PassportSignature({ name, label, translation, dir = "ltr" }) {
  const [signature, setSignature] = useState(null);
  const [signing, setSigning] = useState(false);
  const [inked, setInked] = useState(false);
  const padRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => { setSignature(readSignature()); }, []);

  // the pad takes its box's size at the screen's density, once per opening
  useEffect(() => {
    if (!signing) return;
    const c = padRef.current;
    if (!c) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const box = c.getBoundingClientRect();
    c.width = Math.round(box.width * dpr);
    c.height = Math.round(box.height * dpr);
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(c).color; // the document's ink, whatever the theme
    setInked(false);
  }, [signing]);

  function at(e) {
    const box = padRef.current.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  }
  function down(e) {
    const ctx = padRef.current.getContext("2d");
    drawing.current = true;
    padRef.current.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y); // a dot is a stroke too
    ctx.stroke();
    setInked(true);
  }
  function move(e) {
    if (!drawing.current) return;
    const ctx = padRef.current.getContext("2d");
    const [x, y] = at(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function up() { drawing.current = false; }

  function keep() {
    const data = padRef.current && padRef.current.toDataURL("image/png");
    if (!data) return;
    try { window.localStorage.setItem(SIGNATURE_KEY, data); } catch {}
    setSignature(data);
    setSigning(false);
  }
  function clear() {
    try { window.localStorage.removeItem(SIGNATURE_KEY); } catch {}
    setSignature(null);
    setSigning(false);
  }

  const printed = (name || "").trim();
  return (
    <div className="ppsig">
      <dt>{label} /<em lang={translation ? undefined : "en"} dir={dir}>{translation}</em></dt>
      <dd>
        {signing ? (
          <canvas ref={padRef} className="ppsigpad" aria-label="sign here" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        ) : signature ? (
          <span className="ppsignink" role="img" aria-label={"signature of " + (printed || "the passenger")} style={{ WebkitMaskImage: `url(${signature})`, maskImage: `url(${signature})` }} />
        ) : (
          <span className="ppsigname">{printed || "—"}</span>
        )}
      </dd>
      <div className="ppsigkeys">
        {signing ? (
          <>
            <button type="button" className="txtbtn" onClick={keep} disabled={!inked}>DONE ✓</button>
            <button type="button" className="txtbtn" onClick={() => setSigning(false)}>CANCEL</button>
          </>
        ) : (
          <>
            <button type="button" className="txtbtn" onClick={() => setSigning(true)}>{signature ? "SIGN AGAIN →" : "SIGN →"}</button>
            {signature ? <button type="button" className="txtbtn" onClick={clear}>CLEAR</button> : null}
          </>
        )}
      </div>
    </div>
  );
}
