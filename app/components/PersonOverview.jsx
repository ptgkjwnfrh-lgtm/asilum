"use client";

// app/components/PersonOverview.jsx — the sourced overview panel (V.2).
// A knowledge-panel's speed in ASILUM's voice: image with its credit, role,
// a short sourced description, the facts each with their source, why the
// overview exists, last updated, a correction path, and SAVE / FOLLOW.
// Nothing here is inferred about the person.

import { useState } from "react";
import SaveButton from "./SaveButton.jsx";
import ModelTag from "./ModelTag.jsx";
import { OVERVIEW_ELIGIBILITY } from "../../lib/people/overviews.js";
import { setFollowBrand, followedBrands } from "../../lib/social.js";

export default function PersonOverview({ person, compact = false }) {
  const [why, setWhy] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [note, setNote] = useState("");
  const [following, setFollowing] = useState(() => { try { return followedBrands().includes(person.name); } catch { return false; } });
  if (!person) return null;
  function toggleFollow() {
    const next = !following;
    setFollowing(next);
    try { setFollowBrand(person.name, next); } catch {}
  }
  function sendCorrection(e) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      const key = "asilum-corrections";
      const list = JSON.parse(window.localStorage.getItem(key) || "[]");
      list.unshift({ kind: "overview", id: person.id, note: note.trim().slice(0, 600), at: new Date().toISOString() });
      window.localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
    } catch {}
    setNote(""); setCorrect(false);
  }
  return (
    <section className={"pov" + (compact ? " compact" : "")} aria-label={"overview: " + person.name}>
      <div className="povimg">
        {person.image ? <img src={person.image} alt={person.imageCredit?.alt || person.name} loading="lazy" /> : <span className="povmono">{person.name.slice(0, 1)}</span>}
        {person.imageCredit && <a className="povcredit" href={person.imageCredit.url} target="_blank" rel="noreferrer">{person.imageCredit.credit} · {person.imageCredit.license}</a>}
      </div>
      <div className="povbody">
        <div className="povkick">OVERVIEW · {person.basis.toUpperCase()}</div>
        <h2 className="povname">{person.name}</h2>
        <div className="povrole">{person.role}</div>
        <p className="povsum">{person.summary}</p>
        {!compact && (
          <ul className="povfacts">
            {person.facts.map((f) => {
              const s = person.sources[f.source];
              return (
                <li key={f.claim}>
                  {f.claim}
                  {s && <a href={s.url} target="_blank" rel="noreferrer"> — {s.publisher} ↗</a>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="povmeta">
          LAST UPDATED {person.lastUpdated} · <button className="txtbtn" onClick={() => setWhy((v) => !v)}>WHY THIS OVERVIEW EXISTS</button> · <button className="txtbtn" onClick={() => setCorrect((v) => !v)}>SUGGEST A CORRECTION</button>
        </div>
        {why && (
          <p className="povwhy">
            {person.basis.startsWith("designer")
              ? `Designers qualify through ${OVERVIEW_ELIGIBILITY.designers.rule}.`
              : `Creators qualify at ${OVERVIEW_ELIGIBILITY.creators.rule}; missing history reads "not yet verified".`}
            {" "}{person.notAffiliated}
          </p>
        )}
        {correct && (
          <form className="povcorrect" onSubmit={sendCorrection}>
            <label id={"povlbl-" + person.id} htmlFor={"povnote-" + person.id} className="cclbl">WHAT IS WRONG, AND YOUR SOURCE</label>
            <textarea id={"povnote-" + person.id} aria-labelledby={"povlbl-" + person.id} rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="the claim, the correction, a link" />
            <div className="povcorrectrow">
              <ModelTag kind="device">QUEUED ON THIS DEVICE — the desk is not staffed yet</ModelTag>
              <button className="txtbtn" type="submit" disabled={!note.trim()}>QUEUE</button>
            </div>
          </form>
        )}
        <div className="povacts">
          <SaveButton kind="person" id={person.id} title={person.name} image={person.image} href={"/discover?q=" + encodeURIComponent(person.name)} meta={person.role} tags={person.tags} />
          <button className={"followbtn" + (following ? " on" : "")} aria-pressed={following} onClick={toggleFollow}>{following ? "FOLLOWING" : "FOLLOW"}</button>
          <a className="txtbtn" href={"/discover?q=" + encodeURIComponent(person.name)}>PIECES CREDITED →</a>
        </div>
      </div>
    </section>
  );
}
