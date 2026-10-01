"use client";

// app/components/LikesSheet.jsx — LIKES (V.2 brief, owner, 1 Oct 2026, §5).
// Top subtabs: Pieces | Wire | Sold. The one save (lib/save.js) is the
// record: Pieces lists saved pieces, Wire lists saved posts. Sold keeps the
// likes whose listing later had a CONFIRMED sold status, with the listing
// snapshot and the sold date — a status that only a ListingStatus service
// with provider adapters can set (brief §13), which does not exist yet. So
// Sold shows that honestly as an unavailable state, and the Pieces tab
// cannot exclude sold listings it has no way to know about: it says so.
//
// Each subtab searches within itself through the dock's scoped field
// (scope likes-pieces / likes-wire / likes-sold; lib/dock.js) — exact
// substring over title, meta and tags, never an invented match. Each
// subtab's query is its own (lib/dockstate.js keeps one query per sheet
// life; the subtab change clears it so a Wire query never leaks into Sold).

import { useEffect, useMemo, useState } from "react";
import { listSaves, unsave } from "../../lib/save.js";
import { useDock, setLikesTab, setQuery } from "../../lib/dockstate.js";
import ModelTag from "./ModelTag.jsx";

const TABS = [["pieces", "PIECES"], ["wire", "WIRE"], ["sold", "SOLD"]];

function matches(rec, q) {
  if (!q) return true;
  const hay = [rec.title, rec.meta, ...(rec.tags || [])].join(" ").toLowerCase();
  return hay.includes(q);
}

export default function LikesSheet() {
  const dock = useDock();
  const tab = dock.likesTab;
  const [saves, setSaves] = useState([]);
  const [tick, setTick] = useState(0);
  const q = String(dock.q || "").trim().toLowerCase();

  useEffect(() => {
    const kind = tab === "pieces" ? "piece" : tab === "wire" ? "post" : null;
    setSaves(kind ? listSaves(kind) : []);
  }, [tab, tick]);

  const rows = useMemo(() => saves.filter((r) => matches(r, q)), [saves, q]);

  function pick(next) { setLikesTab(next); setQuery(""); }
  async function drop(rec) { await unsave(rec.kind, rec.id); setTick((t) => t + 1); }

  return (
    <div className="likes">
      <div className="seg likestabs" role="tablist" aria-label="likes">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" className={"tab" + (tab === id ? " cur" : "")} aria-selected={tab === id} onClick={() => pick(id)}>{label}</button>
        ))}
      </div>

      {tab === "sold" ? (
        <div className="sheetnote" role="status">
          <p className="deck">Sold likes wait on a listing-status source.</p>
          <p className="fine">A like moves here only when its listing has a <b>confirmed</b> sold status from the marketplace it came from. No status provider is connected on this deployment yet, so nothing can be confirmed sold — and a listing that merely disappeared is not counted as sold. <ModelTag kind="device">CONNECTION REQUIRED</ModelTag></p>
        </div>
      ) : (
        <>
          {tab === "pieces" && saves.length > 0 && (
            <p className="fine likesfine">Availability is not checked against the source yet — a saved piece may have sold since. <ModelTag kind="device">STATUS PENDING</ModelTag></p>
          )}
          {q && <p className="fine likesfine" role="status">{rows.length} of {saves.length} match “{dock.q}”</p>}
          {rows.length ? (
            <ul className="likelist">
              {rows.map((r) => (
                <li key={r.kind + ":" + r.id} className="likerow" data-id={r.id}>
                  {r.image ? <img className="likeimg" src={r.image} alt="" loading="lazy" /> : <span className="likeimg blank" aria-hidden="true" />}
                  <div className="likebody">
                    <a className="liketitle" href={r.href || "#"}>{r.title}</a>
                    {r.meta ? <span className="likemeta">{r.meta}</span> : null}
                    {r.tags && r.tags.length ? <span className="likemeta">{r.tags.slice(0, 3).join(" · ")}</span> : null}
                  </div>
                  <button className="txtbtn" onClick={() => drop(r)} aria-label={"remove " + r.title + " from likes"}>REMOVE</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pempty" role="status">
              {q ? "nothing in your " + (tab === "wire" ? "liked posts" : "liked pieces") + " matches that."
                : tab === "wire" ? "no liked Wire posts yet — SAVE on a post keeps it here." : "no liked pieces yet — SAVE on a piece keeps it here."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
