"use client";

// app/components/BrdcstSheet.jsx — THE BRDCST POPUP (owner's drawing, 25 Oct
// 2026: the strip's clouded photograph "when tapped opens the brdcst popup
// and the image isn't clouded anymore"). The record's photograph clear at
// the top, the badge, the name large, where and when small, the record's
// own words, then the map (the "map" popup, 5.5) and the organizer's
// tickets link — never a sale here. A sample fixture says so.

import { listPlaces } from "../../lib/places/registry.js";
import { BlockText } from "./Blocks.jsx";
import { brdcstLines } from "./PostCard.jsx";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";

export default function BrdcstSheet({ id }) {
  const ev = id ? listPlaces().find((p) => p.id === id) || null : null;
  if (!ev) return <p className="srchfine" role="status">no broadcast on record for this id.</p>;
  const { big, sub, small } = brdcstLines(ev);
  return (
    <section className="bsheet" aria-label={"broadcast: " + ev.name}>
      {ev.image ? <img className="bsheetimg" src={ev.image} alt="" /> : null}
      <div className="bsheethead">
        <span className="bsbadge" aria-hidden="true"><b>BRDCST</b><i /></span>
        <div className="bsheetbody">
          <h3 className="bsheetname">{big}</h3>
          <p className="bsheetwhen">{[sub, small].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {ev.note ? <BlockText as="p" className="bsheetnote" text={ev.note} /> : null}
      <p className="fine">{[ev.organizer, ev.address, ev.admission].filter(Boolean).join(" · ")}</p>
      <div className="brdcstacts">
        <button type="button" className="txtbtn" onClick={() => { haptic("press"); openSheet("map", { pin: ev.id, title: "MAP" }); }}>PASSPORT MAP →</button>
        {ev.sourceUrl ? <a className="txtbtn" href={ev.sourceUrl} target="_blank" rel="noopener noreferrer">TICKETS · THE ORGANIZER ↗</a> : <span className="fine">tickets: no organizer link on record</span>}
      </div>
    </section>
  );
}
