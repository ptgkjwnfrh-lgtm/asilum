"use client";

// app/components/Achievements.jsx — THE ACHIEVEMENTS, on the profile's WARDROBE (owner, 3 Nov 2026: "keep
// the achivements lets move them to warddobe" — they are not the Passport's stamps; a stamp is what a
// passenger stamps in). One rail of medals (PassportBadge.jsx), the earned first; each opens its space zone
// (StampSheet.jsx). The house's three are read here — a save on this device, three convictions in the
// brain's reading, a published post; the rest come from the server's reading of the passenger's own records
// (app/api/passport/stamps). What cannot be read is locked and says what it waits for (lib/passport/
// milestones.js); nothing is lit by a guess.

import { useEffect, useState } from "react";
import PassportBadge from "./PassportBadge.jsx";
import { MILESTONES } from "../../lib/passport/milestones.js";
import { openSheet } from "../../lib/dockstate.js";
import { authorizedFetch, getUid } from "../../lib/client.js";
import { listSaves } from "../../lib/save.js";
import { getLocation } from "../../lib/location.js";
import { vizState } from "../../lib/brain/memory.js";
import { convictionsOf, ocr } from "../../lib/passport/document.js";

export default function Achievements() {
  const [states, setStates] = useState({});

  useEffect(() => {
    const uid = getUid() || "";
    const q = "user=" + encodeURIComponent(uid);
    const loc = getLocation();
    const home = (loc && loc.baseCity && loc.baseCity.country) || "";
    let live = true;
    const merge = (patch) => { if (live) setStates((s) => ({ ...s, ...patch })); };
    merge({ collection: { earned: listSaves().length > 0 } });
    authorizedFetch("/api/passport/stamps?" + q + "&home=" + encodeURIComponent(home)).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.stamps) merge(d.stamps); }).catch(() => {});
    authorizedFetch("/api/profile?" + q).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.profile) merge({ taste: { earned: convictionsOf(vizState(d.profile).weights).length >= 3 } }); }).catch(() => {});
    authorizedFetch("/api/editorial?mine=1&limit=1&" + q).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.posts)) merge({ transmission: { earned: d.posts.length > 0 } }); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const order = [...MILESTONES].sort((x, y) => (states[y.id]?.earned ? 1 : 0) - (states[x.id]?.earned ? 1 : 0));
  const earned = MILESTONES.filter((m) => states[m.id]?.earned).length;

  return (
    <section className="ppach" aria-label="achievements">
      <div className="ppachhead">
        <span className="ppachttl">ACHIEVEMENTS</span>
        <span className="ppachn">{ocr(`${String(earned).padStart(2, "0")} / ${String(MILESTONES.length).padStart(2, "0")}`)}</span>
      </div>
      <ul className="ppbadges" aria-label="achievements — the earned first">
        {order.map((m) => {
          const st = states[m.id] || {};
          return (
            <li key={m.id}>
              <button className={"ppbadgekey" + (st.earned ? " earned" : "")} onClick={() => openSheet("stamp", { id: m.id, states, title: "ACHIEVEMENT" })}>
                <PassportBadge shape={m.shape} emblem={m.emblem} small={m.small} ink={m.ink} earned={!!st.earned} />
                <span className="ppbadgename">{m.title}</span>
                <span className="ppbadgewhen">{st.earned ? (st.at ? new Date(st.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase() : "EARNED") : m.read === "waits" ? "LOCKED" : "NOT YET"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
