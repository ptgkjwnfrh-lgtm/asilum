"use client";

// app/components/HoldMenu.jsx — THE CARD MENU. It was the HOLD menu (owner,
// 25 Oct 2026: "hide the × buttons … into a hidden pop-up that requires a tap
// and hold on the post"); since 28 Oct 2026 it opens from THREE DOTS in the
// card's top-right corner instead ("for every card lets add three dot buttons
// to the right corner to replace that touch and hold feature") — on every
// card of the Feed: a post, a BRDCST, a piece, a song, a place. The menu is
// unchanged: PASS (on a piece the brain's own signal, `onPass`; on anything
// else set aside on this device, lib/feed/hidden.js — never a claim that
// anyone was told) and, on a real post, the link. Escape, a tap on the veil or
// the CLOSE key puts it away. The dots are a real key, so a keyboard reaches
// the menu the same way a finger does.

import { useState } from "react";
import Icon from "./Icons.jsx";
import { hideCard } from "../../lib/feed/hidden.js";
import { haptic } from "../../lib/haptics.js";
import { useEscape } from "./dismiss.js";

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

/** THE THREE DOTS: the card's top-right key that opens its menu. */
export function CardDots({ what, open, onOpen }) {
  return (
    <button type="button" className="carddots" aria-haspopup="menu" aria-expanded={open} aria-label={"options for " + what} title="options"
      onClick={(e) => { e.stopPropagation(); haptic("press"); onOpen(); }}>
      <Icon name="dots" size={20} />
    </button>
  );
}
