"use client";

// app/components/StampBoards.jsx — STAMP PASSPORT (owner, 3 Nov 2026: "the stamp passport should just look
// like pinterest boards with a search bar to search for their stamps and or search for things to stamp. dont
// make it too complicated"). The STAMPS popup (SheetHost VIEWS):
//   the bar      one search — your own stamps first, then things to stamp
//   the boards   with the bar empty: a board per kind of stamp (places, events, artists, designers & houses,
//                passengers, posts, pieces) and each of your moodboards, a three-tile cover over its name
//   a board      its stamps as pins in columns; a pin opens what it is, REMOVE takes it off
// Stamping keeps ADD STAMP's three rules (it lived in AddStamp.jsx until this): what will be added is SHOWN
// before it is confirmed; the stamp just made can be UNDONE; stamping a passenger adds their PUBLIC taste
// influence (a follow of their room) — never their location or anything private. Places come from the places
// registry, artists from ASILUM's own table (no music service is read), designers and houses from the entity
// graph, passengers from their published room by handle. A stamp without a picture is drawn as the house's
// tile — its port's code (lib/passport/badges.js) in the machine face.

import { useEffect, useMemo, useState } from "react";
import { listSaves, saveObject, unsave, isSaved } from "../../lib/save.js";
import { listArtists } from "../../lib/music-mapping/index.js";
import { findEntity } from "../../lib/entities/graph.js";
import { listPlaces } from "../../lib/places/registry.js";
import { setFollowUser } from "../../lib/social.js";
import { authorizedFetch, getUid, thumbFor } from "../../lib/client.js";
import { stampCode } from "../../lib/passport/badges.js";
import { ocr } from "../../lib/passport/document.js";
import { haptic } from "../../lib/haptics.js";

const KIND_BOARDS = [
  { id: "place", label: "PLACES", kinds: ["place"] },
  { id: "event", label: "EVENTS", kinds: ["event"] },
  { id: "artist", label: "ARTISTS", kinds: ["artist"] },
  { id: "designer", label: "DESIGNERS & HOUSES", kinds: ["designer", "house"] },
  { id: "person", label: "PASSENGERS", kinds: ["person"] },
  { id: "post", label: "POSTS", kinds: ["post", "article"] },
  { id: "piece", label: "PIECES", kinds: ["piece"] },
];
const WORD = { place: "PLACE", event: "EVENT", artist: "ARTIST", designer: "DESIGNER", house: "HOUSE", person: "PASSENGER", post: "POST", article: "ARTICLE", piece: "PIECE" };
const seeded = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

// one tile: the stamp's own picture, or the house's tile
function Tile({ pin, tall }) {
  if (pin.image) return <img className="sbtileimg" src={pin.image} alt="" loading="lazy" />;
  return (
    <span className={"sbtile" + (tall ? " tall" : "")} aria-hidden="true">
      <b>{ocr(stampCode(pin.title))}</b>
      <i>{WORD[pin.kind] || "STAMP"}</i>
    </span>
  );
}

function BoardCard({ board, onOpen }) {
  const [a, b, c] = board.pins;
  return (
    <button className="sbboard" onClick={onOpen}>
      <span className="sbcover">
        <span className="sbcovera">{a ? <Tile pin={a} tall /> : <span className="sbtile empty" />}</span>
        <span className="sbcoverb">{b ? <Tile pin={b} /> : <span className="sbtile empty" />}</span>
        <span className="sbcoverc">{c ? <Tile pin={c} /> : <span className="sbtile empty" />}</span>
      </span>
      <span className="sbboardname">{board.label}</span>
      <span className="sbboardn">{ocr(String(board.pins.length).padStart(2, "0"))} STAMP{board.pins.length === 1 ? "" : "S"}</span>
    </button>
  );
}

function Pins({ pins, onRemove }) {
  if (!pins.length) return <p className="sbnote">nothing here yet.</p>;
  return (
    <ul className="sbpins">
      {pins.map((p) => (
        <li key={p.kind + p.id} className="sbpin">
          <a className="sbpinart" href={p.href || "#"} style={p.image ? undefined : { aspectRatio: `1 / ${(1 + seeded(p.id) * 0.6).toFixed(2)}` }}>
            <Tile pin={p} tall />
          </a>
          <span className="sbpinttl">{p.title}</span>
          <span className="sbpinmeta">{[WORD[p.kind], p.meta].filter(Boolean).join(" · ")}</span>
          {onRemove && p.removable && <button className="txtbtn sbpinrm" onClick={() => onRemove(p)}>REMOVE</button>}
        </li>
      ))}
    </ul>
  );
}

// things to stamp, across every kind at once — the same sources ADD STAMP read
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

export default function StampBoards() {
  const [saves, setSaves] = useState([]);
  const [boards, setBoards] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);   // a board's id
  const [pick, setPick] = useState(null);   // a thing to stamp, shown before it is confirmed
  const [last, setLast] = useState(null);   // the stamp just made, for UNDO
  const [note, setNote] = useState("");

  useEffect(() => {
    const sync = () => setSaves(listSaves());
    sync();
    window.addEventListener("asilum:save", sync);
    authorizedFetch("/api/boards?user=" + encodeURIComponent(getUid() || "")).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.boards)) setBoards(d.boards); }).catch(() => {});
    return () => window.removeEventListener("asilum:save", sync);
  }, []);

  const pinsOf = (list) => list.map((s) => ({ kind: s.kind, id: s.id, title: s.title, meta: s.meta || "", href: s.href || "", image: s.image || "", removable: true }));
  const all = useMemo(() => {
    const out = KIND_BOARDS.map((b) => ({ id: "kind:" + b.id, label: b.label, pins: pinsOf(saves.filter((s) => b.kinds.includes(s.kind))) })).filter((b) => b.pins.length);
    for (const b of boards) out.push({ id: "board:" + b.id, label: String(b.name || "moodboard").toUpperCase(), share: b.id,
      pins: (b.items || []).map((it) => ({ kind: "piece", id: it.id, title: it.title || "piece", meta: it.brand || "", href: "/?item=" + encodeURIComponent(it.id), image: it.img || thumbFor(it) })) });
    return out;
  }, [saves, boards]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = q.trim().toLowerCase();
  const mine = needle ? pinsOf(saves.filter((s) => [s.title, s.meta, WORD[s.kind]].join(" ").toLowerCase().includes(needle))) : [];
  const stampables = useStampables(q).filter((c) => !isSaved(c.kind, c.id));
  const board = open ? all.find((b) => b.id === open) : null;

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
  const remove = (p) => { unsave(p.kind, p.id); haptic("tick"); };

  return (
    <section className="sb" aria-label="your stamps">
      <input className="sbsearch" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }}
        placeholder="search or stamp something" aria-label="search your stamps, or find something to stamp" />
      {note && <p className="sbnote" role="status" aria-live="polite">{note}{last && <> <button className="txtbtn" onClick={undo}>UNDO</button></>}</p>}

      {needle ? (
        <>
          {mine.length > 0 && <><h4 className="sbhead">YOUR STAMPS</h4><Pins pins={mine} onRemove={remove} /></>}
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
          ) : <p className="sbnote">{needle.length < 2 ? "keep typing — a place, an event, an artist, a house, or a passenger's handle." : "nothing by that name to stamp."}</p>}
          {pick && (
            <div className="sbconfirm" role="group" aria-label="what will be stamped">
              <span className="sbfindkind">{WORD[pick.kind]}</span><b>{pick.title}</b>
              {pick.kind === "person" && <span className="sbnote">stamping a passenger adds their public taste influence (a follow of their room) — never their location or anything private.</span>}
              {pick.kind === "artist" && <span className="sbnote">from ASILUM&apos;s own artist table — no listening data is read anywhere.</span>}
              <span className="sbconfirmkeys"><button className="ppbtn primary" onClick={stamp}>STAMP ✓</button><button className="txtbtn" onClick={() => setPick(null)}>CANCEL</button></span>
            </div>
          )}
        </>
      ) : board ? (
        <>
          <div className="sbbar">
            <button className="txtbtn" onClick={() => setOpen(null)}>← BOARDS</button>
            <span className="sbbarttl">{board.label}</span>
            {board.share && <button className="txtbtn" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + "/?board=" + encodeURIComponent(board.share)); setNote("share link copied — it seeds the feed of whoever opens it"); } catch {} }}>SHARE ↗</button>}
          </div>
          <Pins pins={board.pins} onRemove={board.share ? null : remove} />
        </>
      ) : all.length ? (
        <ul className="sbboards">
          {all.map((b) => <li key={b.id}><BoardCard board={b} onOpen={() => setOpen(b.id)} /></li>)}
        </ul>
      ) : (
        <p className="sbnote">no stamps yet — search above for a place, an artist, a house or a passenger, or the SAVE word on anything you see stamps it.</p>
      )}
    </section>
  );
}
