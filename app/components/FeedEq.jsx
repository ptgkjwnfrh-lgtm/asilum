"use client";

// app/components/FeedEq.jsx — THE FEED'S EQ (owner, 29 Oct 2026: "underneath the feed with the FOR YOU page select
// right next to it lets have a collapsed filter button that looks like its from a music player that allows users to
// change what types of cards show on their feed and at the bottom it has a remember toggle so it remebers its feed
// choices"; the choice itself is lib/feed/choice.js). Collapsed, it is one key of a music player's face: an
// equaliser's three faders and a small light that is lit while the mix is not the whole Feed. Open, it is the
// equaliser: a channel for each kind of card, a fader up when it plays and down when it is muted, its light lit;
// and at the foot a hold switch, REMEMBER, which keeps the mix on this device (off, the mix lasts this visit).
// It closes on Escape and on a click away (dismiss.js). The last channel playing will not mute. The key rides in the
// Feed's row of modes, which scrolls sideways on a phone and would clip anything hanging out of it, so the
// equaliser opens into `dock`, a place the page keeps just under the row.

import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CHANNELS, allOn, toggleChannel, normalChoice } from "../../lib/feed/choice.js";
import { useEscape, useClickAway } from "./dismiss.js";

function EqGlyph() {
  // three faders, their knobs at three heights
  return (
    <svg className="eqglyph" viewBox="0 0 18 14" aria-hidden="true" focusable="false">
      <path d="M3 1v12M9 1v12M15 1v12" />
      <rect x="1" y="7.5" width="4" height="2.4" rx="1" />
      <rect x="7" y="3" width="4" height="2.4" rx="1" />
      <rect x="13" y="9.5" width="4" height="2.4" rx="1" />
    </svg>
  );
}

export default function FeedEq({ choice, onChange, dock }) {
  const c = normalChoice(choice);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null), panelRef = useRef(null);
  const id = "feq" + useId().replace(/:/g, "");
  const close = useCallback(() => setOpen(false), []);
  useEscape(close, open);
  useClickAway(panelRef, close, { active: open, excludeRef: wrapRef }); // the key toggles; a click anywhere else closes
  const mixed = !allOn(c);
  return (
    <span className="feq" ref={wrapRef}>
      <button
        type="button"
        className={"eqkey" + (open ? " open" : "") + (mixed ? " mixed" : "")}
        aria-expanded={open}
        aria-controls={id}
        aria-label={mixed ? `the feed's mix: ${c.on.length} of ${CHANNELS.length} kinds playing` : "the feed's mix: every kind playing"}
        title="the feed's mix"
        onClick={() => setOpen((o) => !o)}
      >
        <EqGlyph />
        <i className="eqled" aria-hidden="true" />
      </button>
      {open && dock ? createPortal(
        <div className="eqpanel" ref={panelRef} id={id} role="group" aria-label="which kinds of card play on your feed">
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
        </div>, dock) : null}
    </span>
  );
}
