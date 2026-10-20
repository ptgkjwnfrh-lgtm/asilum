"use client";

// app/components/InfoDock.jsx — THE INFO DOCK (V.2 Blueprint, owner, 17 Oct
// 2026, Foundations "Screen map"; placed and shaped by the owner's fixture
// sketch of 19 Oct 2026, Figure 5). The top fixture on every page but
// Direct Messages, sitting at the top RIGHT beside the Passport Button, its
// right edge in line with the deck's: LIKES, BAG and the bell (NOTICES),
// parted by cuts in the glass, each opening its popup over the root (every
// popup carries EXPAND to open the full tab). Its outer (left) end is round,
// the end that meets the Passport Button is straight. A key blinks the
// deck's tab indicator twice (lib/indicator.js). The music circle
// joins it while audio plays (slice 9, 3.17: contextual — MusicCircle.jsx);
// the |A| exploration indicator (14.9, slice 10c) appears while Exploration
// Active is on; a tap turns exploration off, and off beats reactivation.
//
// It is a fixture, not navigation: nothing here is a route. The utilities
// are data in lib/dock.js so the tests read the same table. The glyphs are
// the three everyone knows; the readable label rides with each key for
// assistive technology and as a tooltip, and the fixture stays compact — the
// blueprint's priority is to spend as little real estate as possible.

import { Fragment, useEffect, useRef, useState } from "react";
import { useLiquidGlass, useGlassLamps, FIXTURE_BEND } from "./LiquidGlass.jsx";
import { useHingedKeys } from "./hinge.js";
import { bagList } from "../../lib/client.js";
import { UTILITIES } from "../../lib/dock.js";
import { useDock, openSheet, closeSheet, leaveSearch } from "../../lib/dockstate.js";
import Icon from "./Icons.jsx";
import MusicCircle from "./MusicCircle.jsx";
import AMark from "./AMark.jsx";
import { blinkIndicator } from "../../lib/indicator.js";
import { getUid, postJSON } from "../../lib/client.js";

export default function InfoDock() {
  const dock = useDock();
  // the OG liquid glass (slice 14): the bezel bends what passes beneath, the rim's rainbow answers the hand
  const glassRef = useRef(null);
  const glass = useLiquidGlass(glassRef, { id: "lg-infodock", strength: 1, bend: FIXTURE_BEND, bezel: "fixture", shine: false });
  useHingedKeys(glassRef);
  useGlassLamps(glassRef);
  const [bagCount, setBagCount] = useState(0);
  const [exploration, setExploration] = useState(null); // { active, auto, off, step, ratio }
  useEffect(() => {
    const on = (e) => setExploration(e.detail || null);
    window.addEventListener("asilum:exploration", on);
    return () => window.removeEventListener("asilum:exploration", on);
  }, []);
  async function stopExploring() {
    try {
      const res = await postJSON("/api/asterisk/memory", { user: getUid(), explorationOff: true });
      if (res.ok) { setExploration((x) => ({ ...(x || {}), active: false, off: true })); window.dispatchEvent(new CustomEvent("asilum:feed-refresh")); }
    } catch {}
  }
  useEffect(() => {
    const sync = () => setBagCount(bagList().length);
    sync();
    window.addEventListener("asilum:bag", sync);
    return () => window.removeEventListener("asilum:bag", sync);
  }, []);

  function tap(id) {
    // a utility pressed while searching leaves search first (owner, 19 Oct 2026)
    if (dock.mode === "search") { leaveSearch(); openSheet(id); return; }
    if (dock.sheet && dock.sheet.id === id) { closeSheet(); return; }
    openSheet(id);
  }

  return (
    <div ref={glassRef} className="infodock fixture" role="group" aria-label="info dock" onClickCapture={blinkIndicator}>
      {glass}
      <i className="fxrim" aria-hidden="true" />
      {UTILITIES.map((u, i) => {
        const cur = !!(dock.sheet && dock.sheet.id === u.id);
        return (
          <Fragment key={u.id}>
          {i > 0 ? <i className="cccut idcut" data-lens-shape="cut" data-lens-band="5" data-lens-gain="0.08" aria-hidden="true" /> : null}
          <button
            type="button"
            className={"idkey hkey" + (cur ? " cur" : "")}
            onClick={() => tap(u.id)}
            aria-label={u.label.toLowerCase()}
            aria-pressed={cur}
            title={u.label}
          >
            <Icon name={u.icon} size={20} />
            {u.id === "bag" && bagCount > 0 ? <span className="idcount" aria-hidden="true">{bagCount > 99 ? "99+" : bagCount}</span> : null}
            <span className="idlabel">{u.label}</span>
          </button>
          </Fragment>
        );
      })}
      {exploration && exploration.active ? (
        <button type="button" className="idkey idexplore" onClick={stopExploring} aria-label="exploration active — tap to turn it off" title={`Exploration Active${exploration.ratio ? ` · about ${exploration.ratio}:1 unfamiliar to familiar` : ""} — tap to turn it off`}>
          <AMark className="on" label="|A|" />
          <span className="idlabel">EXPLORING</span>
        </button>
      ) : null}
      <MusicCircle />
    </div>
  );
}
