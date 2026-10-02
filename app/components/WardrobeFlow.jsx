"use client";

// app/components/WardrobeFlow.jsx — THE CLOSET (V.2 brief §8): isolated item
// cards in a closet-like Cover Flow stack — one selected card centred and
// enlarged, stable neighbours either side, left/right navigation — beside
// GRID and LIST for a large wardrobe, reduced motion, and a direct lookup
// that is never hidden behind the wheel. Every gesture has a button; the
// arrow keys work when the stack has focus. The rules are
// lib/wardrobe/flow.js; this only draws them.
//
// The selected piece's full row (provenance, STYLE IT, GIFT, photo, retire,
// remove) is rendered by the tab under the stack — `onSelect` tells it which.

import { useEffect, useState } from "react";
import { FLOW_SPAN, VIEWS, filterWardrobe, flowWindow, keepSelection, step } from "../../lib/wardrobe/flow.js";
import { provenanceLabel } from "../../lib/wardrobe/gifts.js";

export default function WardrobeFlow({ items = [], selectedId = null, onSelect, view, onView }) {
  const [q, setQ] = useState("");
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    try {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(m.matches);
      const on = () => setReduced(m.matches);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    } catch { return undefined; }
  }, []);

  const shown = filterWardrobe(items, q);
  const sel = keepSelection(shown, selectedId);
  const current = shown[sel] || null;
  useEffect(() => { if (current && String(current.id) !== String(selectedId) && onSelect) onSelect(current.id); }, [current && current.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function move(delta) { const next = shown[step(sel, delta, shown.length)]; if (next && onSelect) onSelect(next.id); }

  const Card = ({ p, big = false }) => (
    <figure className={"wcard" + (big ? " big" : "")}>
      {p.photoUrl ? <img src={p.photoUrl} alt={p.title} loading="lazy" /> : <div className="wcardblank" aria-hidden="true"><span>{(p.category || p.title || "?").slice(0, 1).toUpperCase()}</span></div>}
      <figcaption>
        <b>{p.title}</b>
        <span>{[p.brand, p.sizeLabel].filter(Boolean).join(" · ") || provenanceLabel(p)}</span>
      </figcaption>
    </figure>
  );

  return (
    <div className="wflow">
      <div className="wflowhead">
        <input type="search" aria-label="find a piece in your wardrobe" placeholder="find a piece…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg" role="tablist" aria-label="view">
          {VIEWS.map((v) => (
            <button key={v} role="tab" type="button" aria-selected={view === v} className={"tab" + (view === v ? " cur" : "")} onClick={() => onView && onView(v)}>{v.toUpperCase()}</button>
          ))}
        </div>
        <span className="fine">{shown.length} piece{shown.length === 1 ? "" : "s"}{q.trim() ? " match" : ""}</span>
      </div>

      {view === "flow" && shown.length ? (
        <div
          className={"wstack" + (reduced ? " still" : "")}
          role="group"
          aria-label="your closet — one piece at a time; arrows move the selection"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); } if (e.key === "ArrowRight") { e.preventDefault(); move(1); } }}
        >
          <button type="button" className="wact wstep" aria-label="previous piece" onClick={() => move(-1)} disabled={sel <= 0}>←</button>
          <ol className="wstackcards">
            {flowWindow(shown, sel, FLOW_SPAN).map(({ item, offset }) => (
              <li key={item.id} className={"wslot" + (offset === 0 ? " sel" : "")} style={{ "--o": offset }} aria-hidden={offset !== 0}>
                <button type="button" className="wslotbtn" onClick={() => onSelect && onSelect(item.id)} tabIndex={offset === 0 ? 0 : -1} aria-current={offset === 0 ? "true" : undefined}>
                  <Card p={item} big={offset === 0} />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="wact wstep" aria-label="next piece" onClick={() => move(1)} disabled={sel >= shown.length - 1}>→</button>
          <p className="fine wstackpos" aria-live="polite">{current ? `${sel + 1} of ${shown.length} — ${current.title}` : ""}</p>
        </div>
      ) : null}

      {view === "grid" && shown.length ? (
        <ul className="wgrid" aria-label="your wardrobe, as a grid">
          {shown.map((p) => (
            <li key={p.id} className={String(p.id) === String(selectedId) ? "sel" : ""}>
              <button type="button" className="wslotbtn" onClick={() => onSelect && onSelect(p.id)} aria-pressed={String(p.id) === String(selectedId)}><Card p={p} /></button>
            </li>
          ))}
        </ul>
      ) : null}

      {!shown.length && q.trim() ? <p className="fine">nothing in your wardrobe matches that.</p> : null}
    </div>
  );
}
