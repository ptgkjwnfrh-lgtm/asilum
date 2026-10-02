"use client";

// app/components/ControlCenter.jsx — THE CONTROL CENTER (V.2 brief, owner,
// 1 Oct 2026, §1). Centred at the bottom above the safe area, on every
// size. BASE mode: the four labelled tabs (lib/nav.js) and, visually
// secondary, the three utilities — Likes, Search, Messages. SEARCH mode:
// the scoped field takes the row with its scope printed as the placeholder
// (lib/dock.js SEARCH_SCOPES); the tabs shrink to their glyphs but keep
// their 44px targets; the three search controls — PIECES · WIRE ·
// ASTERISK — sit under the field; CLOSE returns to Base. On a phone the
// dock grows DOWNWARD into rows for search instead of squeezing one row.
// The ad strip is a separate, stable-height part of the same dock
// (AdStrip below): a mode change never resizes it or resets it.
//
// Search mode opens on the Search key, and on entering Map, Likes or
// Messages — and never opens the keyboard by itself (no autoFocus on
// entry; focus only when the reader taps the field). Submitting a global
// search opens the results sheet over the root; a scoped search filters
// the surface it belongs to live and never widens on its own.
//
// The MESSAGES key IS the mail desk's own button when the desk is
// available (MailDesk.jsx renders it, with its counts and its panel); when
// the desk renders nothing — signed out, or messaging off — the fallback
// key beside it opens the honest MessagesSheet. CSS hides whichever is
// not needed (.cckey-mail:has(.maildesk) .ccfallback).

import { useEffect, useRef, useState } from "react";
import { navFor } from "../../lib/nav.js";
import { UTILITIES, SEARCH_TOGGLES, scopeFor } from "../../lib/dock.js";
import { useDock, setMode, setQuery, setTyping, flipToggle, openSheet, closeSearch, closeSheet } from "../../lib/dockstate.js";
import Icon from "./Icons.jsx";
import MailDesk from "./MailDesk.jsx";
import { usePlacements } from "./Placements.jsx";

const ROTATE_MS = 7000;

/** The ad strip: Sponsored placements first, then this device's own
 *  promotion drafts (to their author, labelled DRAFT), then LISTED dated
 *  events from the places record — lib/placements.js is the law. With
 *  nothing eligible it shows an ASiLUM notice in the same space, never a
 *  blank and never an invented offer. Rotation pauses on hover, focus,
 *  reduced motion, and while the reader types; it is not announced. */
function AdStrip({ typing }) {
  const items = usePlacements();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  useEffect(() => {
    try { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch {}
  }, []);
  useEffect(() => {
    if (!items || items.length < 2 || paused || typing || reduced.current) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [items, paused, typing]);
  const cur = items && items.length ? items[i % items.length] : null;
  const step = (d) => { if (items && items.length) setI((n) => (n + d + items.length) % items.length); };
  return (
    <div className="adstrip" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {cur ? (
        <>
          <a className="adline" href={cur.href} aria-label={cur.label.toLowerCase() + " placement: " + cur.line}>
            <span className={"adtag " + cur.kind}>{cur.label}</span>
            <span className="adtext">{cur.line}</span>
          </a>
          {items.length > 1 && (
            <span className="adnav">
              <button className="adbtn" onClick={() => step(-1)} aria-label="previous placement"><Icon name="back" size={14} /></button>
              <span className="adcount" aria-hidden="true">{i % items.length + 1}/{items.length}</span>
              <button className="adbtn" onClick={() => step(1)} aria-label="next placement"><Icon name="back" size={14} className="flip" /></button>
            </span>
          )}
        </>
      ) : (
        <span className="adline notice">
          <span className="adtag asilum">ASILUM</span>
          <span className="adtext">{items === null ? "…" : "no sponsored placements yet — a business requests one in its Studio"}</span>
        </span>
      )}
    </div>
  );
}

export default function ControlCenter({ kind, pathname }) {
  const dock = useDock();
  const nav = navFor(kind);
  const inSearch = dock.mode === "search";
  const scope = scopeFor({ pathname, sheet: dock.sheet && dock.sheet.id, likesTab: dock.likesTab });
  const fieldRef = useRef(null);

  // entering Map puts the dock in search mode — no keyboard
  useEffect(() => {
    if (String(pathname || "").startsWith("/map")) setMode("search");
    else if (!dock.sheet) setMode("base");
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e) {
    e.preventDefault();
    const q = String(dock.q || "").trim();
    if (scope.id === "global") { if (q) openSheet("search"); return; }
    if (scope.id === "messages") {
      // the mail desk's own find, never the whole app
      window.dispatchEvent(new CustomEvent("asilum:dm-find", { detail: { q } }));
    }
    // map and likes scopes filter live through the dock state
  }

  function utility(id) {
    if (id === "search") { setMode("search"); if (dock.sheet && dock.sheet.id !== "search") closeSheet(); setTimeout(() => fieldRef.current && fieldRef.current.focus(), 30); return; }
    if (id === "likes") { openSheet("likes"); return; }
    if (id === "messages") { openSheet("messages"); return; }
  }

  return (
    <div className={"ccenter" + (inSearch ? " ccsearching" : "")} data-scope={scope.id} data-mode={inSearch ? "search" : "base"}>
      <nav className="tabbar" aria-label="destinations">
        {inSearch && (
          <form className="ccsearch" role="search" onSubmit={submit}>
            <label className="ccfield">
              <Icon name="search" size={18} />
              <input
                ref={fieldRef}
                type="search"
                aria-label={scope.placeholder}
                placeholder={scope.placeholder}
                value={dock.q}
                onChange={(e) => { setQuery(e.target.value); setTyping(true); }}
                onBlur={() => setTyping(false)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(e); }}
                enterKeyHint="search"
              />
              <span className="ccscope" aria-hidden="true">{scope.placeholder.replace(/^Search /, "").toUpperCase()}</span>
            </label>
            <button type="button" className="cckey ccclose" onClick={closeSearch} aria-label="close search"><Icon name="close" size={20} /><span>CLOSE</span></button>
          </form>
        )}
        <div className="ccrow">
          <div className="cctabs">
            {nav.map((n) => {
              const cur = n.match(pathname || "/");
              return (
                <a key={n.href} className={"tabl" + (cur ? " cur" : "")} href={n.href} aria-current={cur ? "page" : undefined}>
                  <Icon name={n.icon} size={22} />
                  <span className="tbl">{n.label}</span>
                </a>
              );
            })}
          </div>
          <div className="ccutil" role="group" aria-label="utilities">
            {UTILITIES.map((u) => (
              u.id === "messages" ? (
                <span key={u.id} className="cckey-mail">
                  <MailDesk />
                  <button className={"cckey ccfallback" + (dock.sheet && dock.sheet.id === "messages" ? " cur" : "")} onClick={() => utility("messages")} aria-label="messages">
                    <Icon name="messages" size={20} /><span>{u.label}</span>
                  </button>
                </span>
              ) : (
                <button key={u.id} className={"cckey" + ((u.id === "search" && inSearch && !dock.sheet) || (dock.sheet && dock.sheet.id === u.id) ? " cur" : "")} onClick={() => utility(u.id)} aria-label={u.label.toLowerCase()}>
                  <Icon name={u.icon} size={20} /><span>{u.label}</span>
                </button>
              )
            ))}
          </div>
        </div>
        {inSearch && scope.id === "global" && (
          <div className="cctoggles" role="group" aria-label="search controls">
            {SEARCH_TOGGLES.map((t) => (
              <button key={t.id} className={"cctog" + (dock.toggles[t.id] ? " on" : "")} aria-pressed={!!dock.toggles[t.id]} onClick={() => flipToggle(t.id)}>
                {t.id === "asterisk" ? <i className="red">*</i> : null}{t.label}
              </button>
            ))}
          </div>
        )}
        {inSearch && scope.wide && (
          <div className="cctoggles" role="group" aria-label="search scope">
            <span className="ccscopenote">searching {scope.placeholder.replace(/^Search /, "")}</span>
            <a className="cctog link" href={"/discover?q=" + encodeURIComponent(dock.q || "")}>SEARCH ALL ASILUM →</a>
          </div>
        )}
      </nav>
      <AdStrip typing={dock.typing} />
    </div>
  );
}
