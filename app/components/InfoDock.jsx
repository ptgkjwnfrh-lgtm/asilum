"use client";

// app/components/InfoDock.jsx — THE INFO DOCK (V.2 Blueprint, owner, 17 Oct
// 2026, Foundations "Screen map" and the fixtures sketch, Figure 19). The
// top-left fixture on every page but Direct Messages: LIKES, BAG and the
// bell (NOTICES), each opening its sheet over the root. The music circle
// and the |A| exploration indicator join it in later slices.
//
// It is a fixture, not navigation: nothing here is a route. The utilities
// are data in lib/dock.js so the tests read the same table. The glyphs are
// the three everyone knows; the readable label rides with each key for
// assistive technology and as a tooltip, and the fixture stays compact — the
// blueprint's priority is to spend as little real estate as possible.

import { useEffect, useState } from "react";
import { bagList } from "../../lib/client.js";
import { UTILITIES } from "../../lib/dock.js";
import { useDock, openSheet, closeSheet } from "../../lib/dockstate.js";
import Icon from "./Icons.jsx";

export default function InfoDock() {
  const dock = useDock();
  const [bagCount, setBagCount] = useState(0);
  useEffect(() => {
    const sync = () => setBagCount(bagList().length);
    sync();
    window.addEventListener("asilum:bag", sync);
    return () => window.removeEventListener("asilum:bag", sync);
  }, []);

  function tap(id) {
    if (dock.sheet && dock.sheet.id === id) { closeSheet(); return; }
    openSheet(id);
  }

  return (
    <div className="infodock fixture" role="group" aria-label="info dock">
      {UTILITIES.map((u) => {
        const cur = !!(dock.sheet && dock.sheet.id === u.id);
        return (
          <button
            key={u.id}
            type="button"
            className={"idkey" + (cur ? " cur" : "")}
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
    </div>
  );
}
