"use client";

// app/components/InfoDock.jsx — THE INFO DOCK (V.2 Blueprint, owner, 17 Oct
// 2026, Foundations "Screen map"; placed by the owner's fixture sketch of 19
// Oct 2026, Figure 5). Since 26 Oct 2026 it is BUTTONS, not a pane (owner:
// "the infodeck can be taken away leaving just the buttons"): LIKES, BAG and
// the bell (NOTICES) sit bare on the Masthead's glass at the top right,
// beside the Passport's globe, each opening its popup over the root (every
// popup carries EXPAND to open the full tab). On every page but Direct
// Messages. A key answers with one
// subtle tick (the deck's tab indicator is gone, 26 Oct 2026). The music circle
// joins it while audio plays (slice 9, 3.17: contextual — MusicCircle.jsx);
// the |A| exploration indicator (14.9, slice 10c) appears while Exploration
// Active is on; a tap turns exploration off, and off beats reactivation.
//
// It is a fixture, not navigation: nothing here is a route. The utilities
// are data in lib/dock.js so the tests read the same table. The glyphs are
// the three everyone knows; the readable label rides with each key for
// assistive technology and as a tooltip, and the fixture stays compact — the
// blueprint's priority is to spend as little real estate as possible.

import { useEffect, useRef, useState } from "react";
import { useHingedKeys } from "./hinge.js";
import { bagList } from "../../lib/client.js";
import { UTILITIES } from "../../lib/dock.js";
import { useDock, openSheet, closeSheet, leaveSearch } from "../../lib/dockstate.js";
import Icon from "./Icons.jsx";
import MusicCircle from "./MusicCircle.jsx";
import AMark from "./AMark.jsx";
import { haptic } from "../../lib/haptics.js";
import { getUid, postJSON } from "../../lib/client.js";

export default function InfoDock() {
  const dock = useDock();
  // the keys are hinged (they tip when pressed); the glass and its lamp are the Masthead's
  const keysRef = useRef(null);
  useHingedKeys(keysRef);
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
    <div ref={keysRef} className="infodock" role="group" aria-label="info dock" onClickCapture={() => haptic("tick")}>
      {UTILITIES.map((u) => {
        const cur = !!(dock.sheet && dock.sheet.id === u.id);
        return (
          <button
            key={u.id}
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
