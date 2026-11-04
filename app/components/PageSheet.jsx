"use client";

// app/components/PageSheet.jsx — A PAGE, opened (owner, 3 Nov 2026: "when a page is clicked it will be a large
// card size popup showing all the stamps in the page and if theres notes on the stamps they will all still
// remain"). The PAGE popup (SheetHost VIEWS, props { id }), as much room for the cards as it can give ("the
// header and footer is wayy too big"): ONE slim row — the page's name written in place, its count, + (ADD
// STAMPS: every stamp a tap on or off the page) and its note's square — then its stamps in two columns in four
// sizes, each with its own note, each one TAKE OFF away; DELETE THE PAGE a line of type at the foot, asked twice.
// Its stamps stay stamped — a page only holds them.

import { useState } from "react";
import { renamePage, setPageNote, addToPage, removeFromPage, deletePage, setStampNote } from "../../lib/passport/pages.js";
import { closeSheet } from "../../lib/dockstate.js";
import { ocr } from "../../lib/passport/document.js";
import { haptic } from "../../lib/haptics.js";
import { useStampsAndPages } from "./StampsView.jsx";
import StampCard, { NoteSquare, Tile, seeded } from "./StampCard.jsx";

export default function PageSheet({ id }) {
  const { pins, byKey, pages, notes } = useStampsAndPages();
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(false);
  const page = pages.find((p) => p.id === id);
  if (!page) return <p className="sbnote">this page is no longer here.</p>;
  const on = (page.stamps || []).map((k) => byKey.get(k)).filter(Boolean);
  const has = new Set(page.stamps || []);

  return (
    <section className="sb sbpage" aria-label={`the page ${page.name}`}>
      <div className="sbpagehead">
        <input className="sbpagename" defaultValue={page.name} key={page.id} maxLength={60} aria-label="the page's name"
          onBlur={(e) => renamePage(page.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="sbboardn">{ocr(String(on.length).padStart(2, "0"))} STAMP{on.length === 1 ? "" : "S"}</span>
        <button type="button" className={"sbplus sbpageadd" + (adding ? " on" : "")} aria-expanded={adding} aria-label={adding ? "done adding stamps" : "+ ADD STAMPS"} onClick={() => setAdding((v) => !v)}>{adding ? "✓" : "+"}</button>
        <span className="sbpagenote"><NoteSquare value={page.note || ""} onChange={(v) => setPageNote(page.id, v)} label={`note on the page ${page.name}`} /></span>
      </div>

      {adding && (pins.length ? (
        <ul className="sbadd" aria-label="your stamps — a tap puts one on the page or takes it off">
          {pins.map((p) => (
            <li key={p.key}>
              <button type="button" className={"sbaddone" + (has.has(p.key) ? " on" : "")} aria-pressed={has.has(p.key)}
                onClick={() => { (has.has(p.key) ? removeFromPage : addToPage)(page.id, p.key); haptic("tick"); }}>
                <span className="sbaddart"><Tile pin={p} small /></span>
                <span className="sbaddttl">{p.title}</span>
                <i>{has.has(p.key) ? "✓" : "+"}</i>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="sbnote">nothing stamped yet — stamp something, then put it here.</p>)}

      {on.length ? (
        <ul className="sbpins">
          {on.map((p) => (
            <li key={p.key} className="sbpinli">
              <StampCard pin={p} tier={Math.floor(seeded(p.key) * 4)} note={notes[p.key] || ""} onNote={(v) => setStampNote(p.key, v)}
                actions={<span className="sbpinacts"><button type="button" className="txtbtn" onClick={() => { removeFromPage(page.id, p.key); haptic("tick"); }}>TAKE OFF</button></span>} />
            </li>
          ))}
        </ul>
      ) : !adding && <p className="sbnote">this page is empty — + ADD STAMPS puts your stamps on it.</p>}

      <div className="sbpagefoot">
        {!asking ? <button type="button" className="txtbtn" onClick={() => setAsking(true)}>DELETE THE PAGE</button> : (
          <span className="sbconfirmkeys">
            <span className="sbnote">delete “{page.name}”? its stamps stay stamped.</span>
            <button type="button" className="txtbtn warn" onClick={() => { deletePage(page.id); haptic("confirm"); closeSheet(); }}>DELETE ✓</button>
            <button type="button" className="txtbtn" onClick={() => setAsking(false)}>KEEP IT</button>
          </span>
        )}
      </div>
    </section>
  );
}
