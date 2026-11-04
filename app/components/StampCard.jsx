"use client";

// app/components/StampCard.jsx — ONE STAMP (a pin) and ONE NOTE, shared by ALL STAMPS (StampsView.jsx) and a
// page's popup (PageSheet.jsx). A stamp is its picture — or the house's tile, its port's code in the machine
// face — in one of four sizes up to a fifth taller (lib/passport/stampTiers.js), its name and kind under it.
// Its NOTE is a small rounded square in the picture's top-right corner (owner, 3 Nov 2026: "notes … will appear
// as rounded squares … when clicked will expand slightly opening the note", then "note should be on right corner"): faint and
// empty until a note is written, filled once one is; a tap opens it a little to read and write, DONE or Escape
// closes it. The same square sits on a page's cover.

import { useEffect, useRef, useState } from "react";
import { stampCode } from "../../lib/passport/badges.js";
import { ocr } from "../../lib/passport/document.js";
import { TIER_SCALES } from "../../lib/passport/stampTiers.js";
import { NOTE_MAX } from "../../lib/passport/pages.js";

export const WORD = { place: "PLACE", event: "EVENT", artist: "ARTIST", designer: "DESIGNER", house: "HOUSE", person: "PASSENGER", post: "POST", article: "ARTICLE", piece: "PIECE" };
export function seeded(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

// the stamp's own picture, or the house's tile
export function Tile({ pin, small = false }) {
  if (pin && pin.image) return <img className="sbtileimg" src={pin.image} alt="" loading="lazy" />;
  if (!pin) return <span className="sbtile empty" aria-hidden="true" />;
  return (
    <span className={"sbtile" + (small ? " small" : "")} aria-hidden="true">
      <b>{ocr(stampCode(pin.title))}</b>
      {!small && <i>{WORD[pin.kind] || "STAMP"}</i>}
    </span>
  );
}

export function NoteSquare({ value = "", onChange, label = "note" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const boxRef = useRef(null);
  useEffect(() => { if (!open) setDraft(value); }, [value, open]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { onChange && onChange(draft); setOpen(false); } };
    window.addEventListener("keydown", esc, true);
    window.addEventListener("pointerdown", away, true);
    return () => { window.removeEventListener("keydown", esc, true); window.removeEventListener("pointerdown", away, true); };
  }, [open, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) {
    return (
      <button type="button" className={"ppnote" + (value ? " has" : "")} aria-label={value ? `${label}: ${value}` : `add a ${label}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>
        {value ? <span aria-hidden="true">≡</span> : <span aria-hidden="true">+</span>}
      </button>
    );
  }
  return (
    <div className="ppnote open" ref={boxRef} onClick={(e) => e.stopPropagation()} role="group" aria-label={label}>
      <textarea autoFocus maxLength={NOTE_MAX} value={draft} placeholder="a note…" aria-label={label} onChange={(e) => setDraft(e.target.value)} />
      <span className="ppnotekeys">
        <span className="ppnoten">{ocr(String(NOTE_MAX - draft.length))}</span>
        <button type="button" className="txtbtn" onClick={() => { onChange && onChange(draft); setOpen(false); }}>DONE ✓</button>
      </span>
    </div>
  );
}

/** One stamp. `tier` 0–3 sets its height; `note` / `onNote` its note; `actions` sits under its name. */
export default function StampCard({ pin, tier = 0, note = "", onNote, actions = null }) {
  return (
    <div className="sbpin">
      <span className="sbpinart" style={{ aspectRatio: `1 / ${TIER_SCALES[tier]}` }}>
        <a className="sbpinlink" href={pin.href || "#"} aria-label={pin.title}><Tile pin={pin} /></a>
        {onNote && <NoteSquare value={note} onChange={onNote} label={`note on ${pin.title}`} />}
      </span>
      <span className="sbpinttl">{pin.title}</span>
      <span className="sbpinmeta">{[WORD[pin.kind], pin.meta].filter(Boolean).join(" · ")}</span>
      {actions}
    </div>
  );
}
