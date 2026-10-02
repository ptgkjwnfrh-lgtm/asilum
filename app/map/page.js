"use client";

// app/map/page.js — MAP (V.2 brief, owner, 1 Oct 2026, §11). A root of its
// own — the Passport BRANCH's geographic face — distinct from the personal
// Passport, which stays an Account subview and opens from the STAMP tool
// here. The local and global fashion map (PlacesPanel: real OpenStreetMap
// streets, the sourced rows and the labelled fixtures, the list
// alternative, the privacy controls) with the three tools the owner's
// sketch drew on the right edge, each with its visible label:
//
//   STAMP    → the personal Passport (Account › Collection), where a place
//              or event this map keeps is stamped into the record.
//   CONNECT  → permitted passenger discovery: who to follow, by handle.
//              Never a position — a passenger's location is opt-in, coarse
//              and expiring, and this page shows none.
//   DISCOVER → the cultural directory: the global search sheet.
//
// Entering the map puts the dock in its "Search places and events" scope
// (ControlCenter); the query narrows the pins and the list live and never
// widens to the whole app on its own.

import { useState } from "react";
import PageMast from "../components/PageMast.jsx";
import PlacesPanel from "../components/PlacesPanel.jsx";
import Icon from "../components/Icons.jsx";
import { WhoToFollowList } from "../components/UserBits.jsx";
import { useDock, openSheet } from "../../lib/dockstate.js";
import { MAP_TOOLS } from "../../lib/dock.js";

export default function MapPage() {
  const dock = useDock();
  const [open, setOpen] = useState(null); // "connect" | null — the expanded tool
  const q = dock.mode === "search" ? dock.q : "";

  function tool(id) {
    if (id === "stamp") { window.location.href = "/board?tab=collection"; return; }
    if (id === "discover") { openSheet("search"); return; }
    setOpen((o) => (o === id ? null : id));
  }

  return (
    <div className="wrap mappage">
      <header className="cthead">
        <PageMast word="MAP" sub="PLACES · EVENTS · PASSENGERS" />
      </header>
      <div className="maplayout">
        <div className="mapmain">
          <PlacesPanel query={q} />
        </div>
        <aside className="maptools" aria-label="map tools">
          {MAP_TOOLS.map((t) => (
            <button key={t.id} className={"maptool" + (open === t.id ? " on" : "")} onClick={() => tool(t.id)} aria-expanded={t.id === "connect" ? open === "connect" : undefined}>
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
              <small>{t.hint}</small>
            </button>
          ))}
        </aside>
      </div>
      {open === "connect" && (
        <section className="mapdrawer" aria-label="connect">
          <div className="cclbl">CONNECT · PASSENGERS BY HANDLE</div>
          <p className="fine">Follow lists and handles — never a position. A passenger's location is opt-in, coarse and expiring, and this page shows none.</p>
          <WhoToFollowList withSearch />
        </section>
      )}
    </div>
  );
}
