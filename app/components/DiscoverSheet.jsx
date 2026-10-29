"use client";

// app/components/DiscoverSheet.jsx — DISCOVER, the search tab's face for browsing without typing (owner, 29 Oct 2026:
// "current cravings should live in search tab. we have to device a way for a quick button to take users to a
// discover page that makes sense because of how our search toggle works"). The search key turns the deck into a
// field and the search popup waits for something typed (Figure 1), so there was no way in to browse: the deck's
// search bar now carries a DISCOVER key (ControlCenter.jsx), and the empty search popup a line, that open this
// popup — over the root, in the one popup (SheetHost.jsx "discover"), never a page of its own. It holds:
//   - THE CURRENT CRAVING (lib/craving.js), moved here from the Feed's row: what this moment needs; it steers the
//     Feed for this visit without rewriting the long-term taste;
//   - THE RAILS (DiscoverRails.jsx, live from reviewed sources — empty, they show nothing rather than invent): a
//     pill tapped is that reading searched, in the search tab;
//   - the way to the whole inventory, the /discover page.

import { useEffect, useState } from "react";
import { setQuery, pushSheet } from "../../lib/dockstate.js";
import { EMPTY_CRAVING, OCCASIONS, MOODS, NOVELTIES, CRAVING_MAX, readCraving, cravingActive, pointCraving } from "../../lib/craving.js";
import { DiscoverRails } from "./DiscoverRails.jsx";
import { haptic } from "../../lib/haptics.js";

export default function DiscoverSheet() {
  const [draft, setDraft] = useState(EMPTY_CRAVING);
  const [held, setHeld] = useState(EMPTY_CRAVING);
  const [said, setSaid] = useState("");
  useEffect(() => {
    try { const c = readCraving(window.sessionStorage); setDraft(c); setHeld(c); } catch { /* none held */ }
  }, []);
  const on = cravingActive(held);

  function point() {
    const c = pointCraving(draft);
    setHeld(c); setDraft(c);
    haptic(cravingActive(c) ? "confirm" : "tick");
    setSaid(cravingActive(c) ? "pointed — the Feed follows it for this visit; your long-term taste is not rewritten." : "nothing to point at — the Feed is back to your taste.");
  }
  function clear() {
    const c = pointCraving(EMPTY_CRAVING);
    setHeld(c); setDraft(c); haptic("tick");
    setSaid("cleared — the Feed is back to your taste.");
  }
  // a rail's reading, searched: the words of its tags in the search tab
  function pick(reading) {
    const words = (reading && Array.isArray(reading.tags) ? reading.tags : []).map((t) => String(t).toLowerCase()).join(" ").trim();
    if (!words) return;
    haptic("press");
    setQuery(words);
    pushSheet("search", { title: "SEARCH" });
  }

  return (
    <div className="discsheet">
      <p className="deck">Browse without typing. Point the Feed at a moment, or follow a rail.</p>

      <section className="discsec cravingline" aria-label="current craving">
        <div className="srchlbl">CURRENT CRAVING{on ? " · ON" : ""}</div>
        <p className="cravnote">tell the tollbooth what this moment needs. it steers your feed for this visit without changing your permanent taste.</p>
        <div className="cravinggrid">
          <input aria-label="what you are looking for" type="text" maxLength={CRAVING_MAX}
            placeholder="dark dinner look, clean but strange, airport armor…"
            value={draft.text}
            onChange={(e) => setDraft((c) => ({ ...c, text: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") point(); }} />
          <select aria-label="occasion" value={draft.occasion} onChange={(e) => setDraft((c) => ({ ...c, occasion: e.target.value }))}>
            <option value="">any occasion</option>
            {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select aria-label="mood" value={draft.mood} onChange={(e) => setDraft((c) => ({ ...c, mood: e.target.value }))}>
            <option value="">any mood</option>
            {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select aria-label="novelty" value={draft.novelty} onChange={(e) => setDraft((c) => ({ ...c, novelty: e.target.value }))}>
            {NOVELTIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button type="button" className="btn" onClick={point}>POINT THE WAY</button>
          {on ? <button type="button" className="txtbtn" onClick={clear}>CLEAR CRAVING</button> : null}
        </div>
        {said ? <p className="srchfine" role="status">{said}</p> : null}
      </section>

      <section className="discsec" aria-label="rails">
        <div className="srchlbl">RAILS</div>
        <DiscoverRails onPickTags={pick} empty={<p className="srchfine">no rails yet — they come only from reviewed sources, and none are behind them here.</p>} />
      </section>

      <a className="srchall" href="/discover">THE WHOLE INVENTORY →</a>
    </div>
  );
}
