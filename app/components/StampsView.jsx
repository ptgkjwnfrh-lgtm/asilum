"use client";

// app/components/StampsView.jsx — STAMP PASSPORT, the full-screen view (owner, 3 Nov 2026: "in pinterest terms
// you can stamp anything and you can put those stamps on a page. a stamp is a pin and a page is a board … in
// the stamps tab there will be two sub pages all stamps and pages"). Under one search bar and its + key:
//   ALL STAMPS  everything the passenger stamped (the one save, lib/save.js), in two columns in four sizes up
//               to a fifth taller (lib/passport/stampTiers.js); each with its note (StampCard.jsx) and
//               + PAGE, which puts it on any page or a new one
//   PAGES       the passenger's pages (lib/passport/pages.js): + makes and names one; each a cover of its
//               stamps' pictures in a layout of its own, parted by thin white lines, with its note; a tap opens
//               it in the popup, a large card (PageSheet.jsx), its stamps' notes still on them
// Typing searches the passenger's own stamps; + on ALL STAMPS turns the same bar to finding things to stamp —
// keeping ADD STAMP's three rules: what will be stamped is SHOWN before it is confirmed; the stamp just made can
// be UNDONE; stamping a passenger adds their PUBLIC taste influence, never their location or anything private.

import { useEffect, useMemo, useRef, useState } from "react";
import { listSaves, saveObject, unsave, isSaved } from "../../lib/save.js";
import { listArtists } from "../../lib/music-mapping/index.js";
import { findEntity } from "../../lib/entities/graph.js";
import { listPlaces } from "../../lib/places/registry.js";
import { setFollowUser } from "../../lib/social.js";
import { authorizedFetch, getUid } from "../../lib/client.js";
import { openSheet } from "../../lib/dockstate.js";
import { ocr } from "../../lib/passport/document.js";
import { haptic } from "../../lib/haptics.js";
import { stampTiers, TIER_SCALES } from "../../lib/passport/stampTiers.js";
import { listPages, createPage, renamePage, setPageNote, addToPage, removeFromPage, stampNotes, setStampNote, stampKey, coverLayout } from "../../lib/passport/pages.js";
import StampCard, { NoteSquare, Tile, WORD, seeded } from "./StampCard.jsx";

const pinOf = (s) => ({ key: stampKey(s), kind: s.kind, id: s.id, title: s.title, meta: s.meta || "", href: s.href || "", image: s.image || "" });

// the device's stamps and pages, kept current with every save and every page change
export function useStampsAndPages() {
  const [saves, setSaves] = useState([]);
  const [pages, setPages] = useState([]);
  const [notes, setNotes] = useState({});
  useEffect(() => {
    const sync = () => { setSaves(listSaves()); setPages(listPages()); setNotes(stampNotes()); };
    sync();
    window.addEventListener("asilum:save", sync);
    window.addEventListener("asilum:pages", sync);
    return () => { window.removeEventListener("asilum:save", sync); window.removeEventListener("asilum:pages", sync); };
  }, []);
  const pins = useMemo(() => saves.map(pinOf), [saves]);
  const byKey = useMemo(() => new Map(pins.map((p) => [p.key, p])), [pins]);
  return { pins, byKey, pages, notes };
}

// things to stamp, across every kind at once — the sources ADD STAMP read
function useStampables(q) {
  const [person, setPerson] = useState(null);
  const needle = q.trim().toLowerCase();
  const found = useMemo(() => {
    if (needle.length < 2) return [];
    const out = [];
    for (const p of listPlaces({}).filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 5))
      out.push({ kind: p.dated ? "event" : "place", id: p.id, title: p.name, meta: [p.kind, p.city || p.region || ""].filter(Boolean).join(" · "), href: "/map", tags: p.tags || [] });
    for (const a of listArtists().filter((a) => a.name.includes(needle)).slice(0, 4))
      out.push({ kind: "artist", id: a.id, title: a.name, meta: a.descriptors.slice(0, 3).join(" · "), href: "", tags: Object.keys(a.tags) });
    const e = findEntity(needle);
    if (e && (e.type === "designer" || e.type === "house")) out.push({ kind: e.type, id: e.id, title: e.name, meta: e.type, href: "/discover?entity=" + encodeURIComponent(e.id), tags: [] });
    return out;
  }, [needle]);
  useEffect(() => {
    const handle = needle.replace(/^[*@]/, "");
    if (!/^[a-z0-9-]{3,24}$/.test(handle)) { setPerson(null); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await authorizedFetch("/api/profile/room?handle=" + encodeURIComponent(handle) + "&user=" + encodeURIComponent(getUid() || ""), { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        if (live) setPerson(d && (d.room || d.handle || d.published) ? { kind: "person", id: handle, title: handle, meta: "a published passenger", href: "/u/" + encodeURIComponent(handle), tags: [] } : null);
      } catch { if (live) setPerson(null); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [needle]);
  return person ? [...found, person] : found;
}

// + PAGE: the pages a stamp is on, ticked; any of them a tap away; a new one named in place
function PagePicker({ pin, pages, onClose }) {
  const [name, setName] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", away, true); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div className="sbpicker" ref={ref} role="group" aria-label={`pages for ${pin.title}`}>
      <span className="sbpickerhead">PUT ON A PAGE</span>
      {pages.map((p) => {
        const on = (p.stamps || []).includes(pin.key);
        return (
          <button key={p.id} type="button" className={"sbpickrow" + (on ? " on" : "")} aria-pressed={on}
            onClick={() => { (on ? removeFromPage : addToPage)(p.id, pin.key); haptic("tick"); }}>
            <span>{p.name}</span><i>{on ? "✓" : "+"}</i>
          </button>
        );
      })}
      <form className="sbpicknew" onSubmit={(e) => { e.preventDefault(); const pg = createPage(name || "untitled page"); addToPage(pg.id, pin.key); setName(""); haptic("confirm"); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="a new page…" aria-label="name a new page" maxLength={60} />
        <button type="submit" className="txtbtn">MAKE ✓</button>
      </form>
    </div>
  );
}

// a page's cover: its first stamps' pictures in the page's own layout, parted by thin white lines
export function PageCover({ page, byKey, tier = 0 }) {
  const layout = coverLayout(page.id);
  const pins = (page.stamps || []).map((k) => byKey.get(k)).filter(Boolean);
  return (
    <span className={"sbcover l-" + layout.id} style={{ "--sb-scale": TIER_SCALES[tier] }}>
      {Array.from({ length: layout.tiles }, (_, i) => <span key={i} className={"sbcell c" + i}><Tile pin={pins[i]} small={i > 0} /></span>)}
    </span>
  );
}

function PageCard({ page, byKey, tier, onOpen }) {
  const n = (page.stamps || []).filter((k) => byKey.has(k)).length;
  return (
    <div className="sbboard">
      <span className="sbcoverwrap">
        <button type="button" className="sbcoverbtn" onClick={onOpen} aria-label={`open the page ${page.name}`}><PageCover page={page} byKey={byKey} tier={tier} /></button>
        <NoteSquare value={page.note || ""} onChange={(v) => setPageNote(page.id, v)} label={`note on the page ${page.name}`} />
      </span>
      <button type="button" className="sbboardname" onClick={onOpen}>{page.name}</button>
      <span className="sbboardn">{ocr(String(n).padStart(2, "0"))} STAMP{n === 1 ? "" : "S"}</span>
    </div>
  );
}

export default function StampsView() {
  const { pins, byKey, pages, notes } = useStampsAndPages();
  const [sub, setSub] = useState("all");      // all | pages
  const [q, setQ] = useState("");
  const [finding, setFinding] = useState(false); // + on ALL STAMPS: the bar finds things to stamp
  const [pick, setPick] = useState(null);        // a thing to stamp, shown before it is confirmed
  const [last, setLast] = useState(null);        // the stamp just made, for UNDO
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState(null);    // the stamp whose + PAGE is open
  const [naming, setNaming] = useState(null);    // a page just made, its name being written
  const inputRef = useRef(null);

  const needle = q.trim().toLowerCase();
  const mine = needle ? pins.filter((p) => [p.title, p.meta, WORD[p.kind]].join(" ").toLowerCase().includes(needle)) : pins;
  const stampables = useStampables(finding ? q : "").filter((c) => !isSaved(c.kind, c.id));
  const shownPages = needle ? pages.filter((p) => [p.name, p.note].join(" ").toLowerCase().includes(needle)) : pages;
  const pageTiers = stampTiers(shownPages.map((p) => (p.stamps || []).filter((k) => byKey.has(k)).length));

  function plus() {
    haptic("tick");
    if (sub === "pages") { const pg = createPage("untitled page"); setNaming(pg.id); return; }
    setFinding((f) => !f); setPick(null);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  }
  async function stamp() {
    if (!pick) return;
    try {
      await saveObject({ kind: pick.kind, id: pick.id, title: pick.title, href: pick.href, meta: pick.meta, tags: pick.tags });
      if (pick.kind === "person") setFollowUser(pick.id, true);
      setLast(pick); setNote(`stamped: ${pick.title}.`); setPick(null); haptic("confirm");
    } catch (e) { setNote(String((e && e.message) || "that could not be stamped.")); }
  }
  async function undo() {
    if (!last) return;
    await unsave(last.kind, last.id).catch(() => {});
    if (last.kind === "person") setFollowUser(last.id, false);
    setNote(`removed: ${last.title}.`); setLast(null);
  }

  return (
    <section className="sb" aria-label="stamps">
      <nav className="sbsubs" aria-label="stamps or pages">
        {[["all", "ALL STAMPS", pins.length], ["pages", "PAGES", pages.length]].map(([k, l, n]) => (
          <button key={k} type="button" className={"sbsub" + (sub === k ? " cur" : "")} aria-pressed={sub === k} onClick={() => { setSub(k); setFinding(false); setPick(null); }}>
            {l} <i>{ocr(String(n).padStart(2, "0"))}</i>
          </button>
        ))}
      </nav>
      <div className="sbbarrow">
        <input ref={inputRef} className="sbsearch" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }}
          placeholder={finding ? "find something to stamp" : sub === "pages" ? "search your pages" : "search your stamps"}
          aria-label={finding ? "find something to stamp" : sub === "pages" ? "search your pages" : "search your stamps"} />
        <button type="button" className={"sbplus" + (finding ? " on" : "")} onClick={plus} aria-pressed={sub === "all" ? finding : undefined}
          aria-label={sub === "pages" ? "make a new page" : finding ? "back to your stamps" : "stamp something new"}>{finding ? "×" : "+"}</button>
      </div>
      {note && <p className="sbnote" role="status" aria-live="polite">{note}{last && <> <button className="txtbtn" onClick={undo}>UNDO</button></>}</p>}

      {sub === "all" && finding && (
        <>
          <h4 className="sbhead">STAMP SOMETHING NEW</h4>
          {stampables.length ? (
            <ul className="sbfound">
              {stampables.map((c) => (
                <li key={c.kind + c.id}>
                  <button className={"sbfind" + (pick && pick.id === c.id && pick.kind === c.kind ? " cur" : "")} onClick={() => setPick(c)}>
                    <span className="sbfindkind">{WORD[c.kind]}</span><b>{c.title}</b>{c.meta && <span className="sbfindmeta">{c.meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="sbnote">{needle.length < 2 ? "type a place, an event, an artist, a house, or a passenger's handle." : "nothing by that name to stamp."}</p>}
          {pick && (
            <div className="sbconfirm" role="group" aria-label="what will be stamped">
              <span className="sbfindkind">{WORD[pick.kind]}</span><b>{pick.title}</b>
              {pick.kind === "person" && <span className="sbnote">stamping a passenger adds their public taste influence (a follow of their room) — never their location or anything private.</span>}
              {pick.kind === "artist" && <span className="sbnote">from ASILUM&apos;s own artist table — no listening data is read anywhere.</span>}
              <span className="sbconfirmkeys"><button className="ppbtn primary" onClick={stamp}>STAMP ✓</button><button className="txtbtn" onClick={() => setPick(null)}>CANCEL</button></span>
            </div>
          )}
        </>
      )}

      {sub === "all" && !finding && (mine.length ? (
        <ul className="sbpins">
          {mine.map((p) => (
            <li key={p.key} className="sbpinli">
              <StampCard pin={p} tier={Math.floor(seeded(p.key) * 4)} note={notes[p.key] || ""} onNote={(v) => setStampNote(p.key, v)}
                actions={<span className="sbpinacts">
                  <button type="button" className="txtbtn" onClick={() => setPicker(picker === p.key ? null : p.key)} aria-expanded={picker === p.key}>+ PAGE</button>
                  <button type="button" className="txtbtn" onClick={() => { unsave(p.kind, p.id); haptic("tick"); }}>REMOVE</button>
                </span>} />
              {picker === p.key && <PagePicker pin={p} pages={pages} onClose={() => setPicker(null)} />}
            </li>
          ))}
        </ul>
      ) : <p className="sbnote">{needle ? "none of your stamps by that name." : "no stamps yet — + finds a place, an artist, a house or a passenger to stamp, and the SAVE word on anything you see stamps it."}</p>)}

      {sub === "pages" && (
        <>
          {naming && pages.some((p) => p.id === naming) && (
            <form className="sbname" onSubmit={(e) => { e.preventDefault(); setNaming(null); haptic("confirm"); }}>
              <input autoFocus defaultValue="" placeholder="name the new page…" aria-label="name the new page" maxLength={60}
                onChange={(e) => renamePage(naming, e.target.value)} />
              <button type="submit" className="txtbtn">DONE ✓</button>
            </form>
          )}
          {shownPages.length ? (
            <ul className="sbboards">
              {shownPages.map((pg, i) => (
                <li key={pg.id}><PageCard page={pg} byKey={byKey} tier={pageTiers[i]} onOpen={() => openSheet("page", { id: pg.id, title: String(pg.name).toUpperCase() })} /></li>
              ))}
            </ul>
          ) : <p className="sbnote">{needle ? "none of your pages by that name." : "no pages yet — + makes one; put stamps on it from here or from ALL STAMPS. pages and notes live on this device for now."}</p>}
        </>
      )}
    </section>
  );
}
