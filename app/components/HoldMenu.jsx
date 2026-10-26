"use client";

// app/components/HoldMenu.jsx — THE HOLD MENU (owner, 25 Oct 2026: "hide
// the × buttons … into a hidden pop-up that requires a tap and hold on the
// post — a classic social media option"; then: "there's still visible ×s"
// — so every card in the Feed keeps its × here: a post, a BRDCST, a piece,
// a song). A press held LONG_PRESS_MS anywhere on the card, a right-click or
// the keyboard's context key opens a small menu over the card: PASS (on a
// piece the brain's own signal, `onPass`; on anything else set aside on
// this device, lib/feed/hidden.js — never a claim that anyone was told)
// and, on a real post, the link. Escape, a tap on the veil or the CLOSE key
// puts it away; a visually hidden OPTIONS key opens it for a keyboard.

import { useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { hideCard } from "../../lib/feed/hidden.js";
import { haptic } from "../../lib/haptics.js";
import { LONG_PRESS_MS } from "../../lib/disc.js"; // the one long-press clock (the deck, the Disc, a tag, a card)
import { useEscape } from "./dismiss.js";

export function useHold(onHold) {
  const st = useRef({ t: 0, x: 0, y: 0, fired: false, upAt: 0 });
  const clear = () => { const s = st.current; if (s.t) { clearTimeout(s.t); s.t = 0; } };
  const down = (e) => {
    if (e.button || e.target.closest(".holdmenu, .strip")) return; // the strip keeps its scroll
    const s = st.current;
    s.x = e.clientX; s.y = e.clientY; s.fired = false;
    clear();
    s.t = setTimeout(() => { s.t = 0; s.fired = true; haptic("confirm"); onHold(); }, LONG_PRESS_MS);
  };
  const move = (e) => { const s = st.current; if (s.t && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clear(); };
  const up = () => { clear(); st.current.upAt = performance.now(); };
  // the click that ends a hold is the hold's, not the card's — only the one
  // that comes at once; a tap a moment later is the reader's (on the veil, say)
  const click = (e) => { const s = st.current; if (s.fired) { s.fired = false; if (performance.now() - s.upAt < 350) { e.preventDefault(); e.stopPropagation(); } } };
  const context = (e) => { e.preventDefault(); haptic("press"); onHold(); };
  return { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onClickCapture: click, onContextMenu: context };
}

export function HoldMenu({ id, what, href = null, open, onClose, onPass = null }) {
  const [copied, setCopied] = useState("");
  useEscape(onClose, open);
  if (!open) return null;
  const copy = async () => {
    haptic("press");
    try { await navigator.clipboard.writeText(window.location.origin + href); setCopied("link copied ✓"); setTimeout(onClose, 900); } catch { setCopied("the link could not be copied"); }
  };
  return (
    <div className="holdveil">
      {/* the veil itself is a key: a tap anywhere outside the menu puts it away */}
      <button type="button" className="holdveilx" onClick={onClose} aria-label="close the menu" />
      <div className="holdmenu" role="menu" aria-label={"options for " + what}>
        <button type="button" role="menuitem" onClick={() => { haptic("press"); if (onPass) onPass(); else hideCard(id); onClose(); }}><Icon name="pass" size={18} /><span>{onPass ? "PASS · not for me" : "PASS · set it aside"}</span></button>
        {href ? <button type="button" role="menuitem" onClick={copy}><Icon name="link" size={18} /><span>{copied || "COPY THE LINK"}</span></button> : null}
        <button type="button" role="menuitem" onClick={() => { haptic("press"); onClose(); }}><Icon name="close" size={18} /><span>CLOSE</span></button>
      </div>
    </div>
  );
}

/** The keyboard's way in: a visually hidden OPTIONS key. */
export function HoldKey({ what, open, onOpen }) {
  return <button type="button" className="idlabel holdopt" aria-haspopup="menu" aria-expanded={open} onClick={onOpen}>options for {what}</button>;
}
