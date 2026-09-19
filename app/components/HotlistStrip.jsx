"use client";

// app/components/HotlistStrip.jsx — THE HOTLIST beside the stream (V.2
// round three). The ten booths for verified independent brands, server
// truth (/api/business?booths=1), in the glass strip the owner placed at
// the side of the wire; the whole ladder lives on /hotlist.

import { useEffect, useState } from "react";
import GlassPane from "./GlassPane.jsx";
import { postJSON, getUid, authorizedFetch } from "../../lib/client.js";

const BOOTHS = Array.from({ length: 10 }, (_, i) => i + 1);

export default function HotlistStrip() {
  const [booths, setBooths] = useState(null);
  useEffect(() => {
    authorizedFetch("/api/business?booths=1").then((r) => (r.ok ? r.json() : null))
      .then((d) => setBooths(d && Array.isArray(d.booths) ? d.booths : []))
      .catch(() => setBooths([]));
  }, []);
  function visit(holder) {
    if (holder && holder.sourceName) postJSON("/api/booth-visit", { user: getUid(), sourceName: holder.sourceName }).catch(() => {});
  }
  return (
    <GlassPane glass="lg-stream-hot" className="whot hotstrip" aria-label="the hotlist">
      <div className="elmast hotstripmast">THE HOTLIST</div>
      <p className="elnote">ten booths, held for verified independent brands. a booth is a real store and its real pieces.</p>
      <ol className="hotstriprows">
        {BOOTHS.map((n) => {
          const holder = booths ? booths[n - 1] : null;
          return (
            <li key={n} className={holder ? "held" : "open"}>
              <span className="elnum">{String(n).padStart(2, "0")}</span>
              {holder
                ? <a className="boothsite" href={"/discover?q=" + encodeURIComponent(holder.brandName)} onClick={() => visit(holder)}>{holder.brandName}</a>
                : <span className="boothopen">BOOTH OPEN</span>}
            </li>
          );
        })}
      </ol>
      <a className="txtbtn" href="/hotlist">THE WHOLE LADDER →</a>
    </GlassPane>
  );
}
