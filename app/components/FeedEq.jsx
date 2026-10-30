"use client";

// app/components/FeedEq.jsx — THE FEED'S EQ (owner, 29 Oct 2026: "underneath the feed with the FOR YOU page select
// right next to it lets have a collapsed filter button that looks like its from a music player that allows users to
// change what types of cards show on their feed and at the bottom it has a remember toggle so it remebers its feed
// choices"; the choice itself is lib/feed/choice.js). Collapsed, it is one key of a music player's face: an
// equaliser's three faders and a small light that is lit while the mix is not the whole Feed. Open, it is the
// equaliser: a channel for each kind of card, a fader up when it plays and down when it is muted, its light lit;
// and at the foot a hold switch, REMEMBER, which keeps the mix on this device (off, the mix lasts this visit).
// It closes on Escape and on a click away (dismiss.js). The last channel playing will not mute.
//
// THE SOURCE (owner, 29 Oct 2026, the same evening: "the collaspable togge thing should replace current craving and
// following and the toggle should be on the left"): FOLLOWING left the row for the equaliser's head, a player's
// source switch — FOR YOU or FOLLOWING, its light on the one playing. (The craving went to the search tab's DISCOVER.)
//
// THE KEY BESIDE THE FEED (owner, the same evening: "fuck the for you take that shit out and just leave the feed, let
// the toggle button be in liquid glass and have its little symbol glow and make the symbol match the rest of the
// symbols and put it in the right corner of the screen inline with the fee[d]" … "the toggle button should appear if
// the user scrolls up and if the user scrolls back down the toggle button should remain where it is so it appears like
// its being scrolled back up"). The row of modes is gone; the key stands at the right of THE FEED, a pane of the
// fixtures' liquid glass (useLiquidGlass), its symbol the house's own (Icons.jsx "eq": the fixtures' one stroke),
// glowing in the ground's ink (lib/ink.js GROUND_TEXT). It comes back as a "quick return" (lib/scrollmotion.js): away
// with the page as the reader scrolls down, down into view under the Masthead as they scroll up, and from there away
// again at the page's own pace. The equaliser hangs under the key wherever it is. The craving, set in DISCOVER, shows
// on the equaliser while it steers the Feed (the key's light is lit for it too), and can be cleared there.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CHANNELS, allOn, toggleChannel, normalChoice } from "../../lib/feed/choice.js";
import { quickReturn, quickOffset } from "../../lib/scrollmotion.js";
import { useEscape, useClickAway } from "./dismiss.js";
import { useLiquidGlass } from "./LiquidGlass.jsx";
import Icon from "./Icons.jsx";
import { brightSurfaceAt } from "./InkWatch.jsx";
import { TINT_BRIGHT } from "../../lib/ink.js";
import { subscribeFrame, requestFrame } from "../../lib/frame.js";

// the quick return, in the one frame (lib/frame.js): read where the key's place is, how far the page moved and what
// lies under where the key will be drawn; then write its transform and its ink
function useQuickReturn(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let last = window.scrollY, offset = 0, q = -Infinity;
    return subscribeFrame({
      name: "eq-return",
      read() {
        const y = window.scrollY, d = y - last; last = y;
        // under the Masthead as it stands (its height counts a phone's notch, which --head-h's text cannot be read for)
        const mast = document.querySelector(".masthead");
        const stick = (mast ? mast.getBoundingClientRect().bottom : 66) + 8, h = el.offsetHeight || 40, hide = stick + h + 8;
        if (q === -Infinity) q = -hide; // it starts out of sight: only scrolling up brings it
        q = quickReturn(q, d, hide);
        const box = el.getBoundingClientRect(), natural = box.top - offset;
        const next = quickOffset(natural, stick, q);
        // floating over the Feed, it can sit on a white card, where the ground's glowing white would vanish: there its
        // symbol takes the solid ink (the logo's own test, InkWatch.jsx brightSurfaceAt; one point, only while it floats)
        const bright = next > 0 && !!brightSurfaceAt(box.left + box.width / 2, natural + next + h / 2, el, TINT_BRIGHT);
        return { next, bright };
      },
      write({ next, bright }) {
        // moved: one frame more, so what reads the key's place (its ground ink, GroundInk.jsx) reads where it now
        // stands — in the one frame every read comes before every write, and the last scroll asks for no other
        if (Math.abs(next - offset) > 0.1) { offset = next; el.style.transform = offset ? `translate3d(0, ${offset.toFixed(1)}px, 0)` : ""; requestFrame(); }
        el.classList.toggle("floating", offset > 0);
        const key = el.firstElementChild;
        if (key) { if (bright) key.dataset.bright = ""; else delete key.dataset.bright; }
      },
    });
  }, [ref]);
}

export const SOURCES = Object.freeze([["curated", "FOR YOU"], ["following", "FOLLOWING"]]);

export default function FeedEq({ choice, onChange, source = "curated", onSource, craving = false, onClearCraving }) {
  const c = normalChoice(choice);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null), panelRef = useRef(null), keyRef = useRef(null);
  const glass = useLiquidGlass(keyRef, { id: "lg-eqkey", strength: 0.8, shine: false, bezel: "fixture" });
  useQuickReturn(wrapRef);
  const id = "feq" + useId().replace(/:/g, "");
  const close = useCallback(() => setOpen(false), []);
  // Escape from inside the equaliser gives the focus back to its key, not to the page (the panel it was in goes)
  useEscape(() => { if (panelRef.current && panelRef.current.contains(document.activeElement) && keyRef.current) keyRef.current.focus(); close(); }, open);
  useClickAway(panelRef, close, { active: open, excludeRef: wrapRef }); // the key toggles; a click anywhere else closes
  const mixed = !allOn(c) || !!craving;
  return (
    <span className="feq" ref={wrapRef}>
      <button
        ref={keyRef}
        type="button"
        className={"eqkey" + (open ? " open" : "") + (mixed ? " mixed" : "")}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`the feed's mix: ${allOn(c) ? "every kind playing" : `${c.on.length} of ${CHANNELS.length} kinds playing`}${source === "following" ? ", following" : ""}${craving ? ", a craving steering it" : ""}`}
        title="the feed's mix"
        onClick={() => setOpen((o) => !o)}
      >
        {glass}
        <Icon name="eq" size={20} />
        <i className="eqled" aria-hidden="true" />
      </button>
      {open ? (
        <div className="eqpanel" ref={panelRef} id={id} role="group" aria-label="the feed's source and which kinds of card play on it">
          <div className="eqsource" role="radiogroup" aria-label="source">
            <span className="eqsrclbl" aria-hidden="true">SOURCE</span>
            {SOURCES.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={source === k} className={"eqsrc" + (source === k ? " on" : "")} onClick={() => { if (source !== k && onSource) onSource(k); }}>
                <i className="eqchled" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          {craving ? (
            <div className="eqcraving">
              <span>A CRAVING STEERS THE FEED</span>
              <button type="button" className="txtbtn" onClick={() => {
                // the line goes with the craving: the focus moves to the source playing, still in the equaliser
                const src = panelRef.current && panelRef.current.querySelector(".eqsrc.on");
                if (onClearCraving) onClearCraving();
                if (src) src.focus();
              }}>CLEAR</button>
            </div>
          ) : null}
          <div className="eqchans">
            {CHANNELS.map((ch) => {
              const on = c.on.includes(ch.key);
              const last = on && c.on.length === 1;
              return (
                <button
                  key={ch.key}
                  type="button"
                  className={"eqchan" + (on ? " on" : "")}
                  aria-pressed={on}
                  aria-disabled={last || undefined}
                  title={last ? "the last kind playing stays on" : on ? `mute ${ch.label.toLowerCase()}` : `play ${ch.label.toLowerCase()}`}
                  onClick={() => { if (!last) onChange(toggleChannel(c, ch.key)); }}
                >
                  <i className="eqchled" aria-hidden="true" />
                  <span className="eqtrack" aria-hidden="true"><span className="eqknob" /></span>
                  <span className="eqname">{ch.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={"eqhold" + (c.remember ? " on" : "")}
            role="switch"
            aria-checked={c.remember}
            onClick={() => onChange({ ...c, remember: !c.remember })}
          >
            <span className="eqslot" aria-hidden="true"><span className="eqslide" /></span>
            <span className="eqholdword">REMEMBER</span>
            <span className="eqholdstate">{c.remember ? "ON — KEPT ON THIS DEVICE" : "OFF — THIS VISIT ONLY"}</span>
          </button>
        </div>
      ) : null}
    </span>
  );
}
