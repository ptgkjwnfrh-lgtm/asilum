"use client";

// app/components/ControlCenter.jsx — THE CENTRAL CONTROL DECK (V.2
// Blueprint, owner, 17 Oct 2026, Foundations "Screen map"; the 1 Oct brief
// §1 where the blueprint is silent). Centred at the bottom above the safe
// area, on every size, drawn to the owner's fixture sketch of 19 Oct 2026
// (Figures 1–3, 5): ONE pane of translucent rainbow liquid glass, its five
// keys — FEED · SEARCH · POST · MESSAGES · ACCOUNT — parted by CUTS in the
// glass, two narrow end caps, and the FOOT GRILL under the post disc like a
// phone's ventilation port. (The tab indicator light is gone: owner, 26 Oct
// 2026, "for the central control let's take away the indicator light".) The
// cuts, the disc's ring and the grill are carved shapes (data-lens-shape):
// the backdrop bends
// around each of them (LiquidGlass.jsx lensFeatures). Every size is a
// multiple of --u, the sketch's own unit, so the proportions are the
// drawing's at every width.
//
// SEARCH (Figure 1): the key morphs the deck — it extends UPWARD to make
// room for the search bar; the search popup (the sub tab) does not appear
// until something is typed, and the deck's bar stays the one field while it
// is up. CLOSE (or Escape) returns to Base. The scope is the placeholder
// (lib/dock.js SEARCH_SCOPES); a scoped search offers "Search all ASILUM"
// as its explicit way out and never widens on its own.
//
// Search mode opens on the Search key, and on entering Map, Likes or
// Messages — and never opens the keyboard by itself (no autoFocus on
// entry; focus only when the reader taps the field). The first character of
// a global search opens the results popup over the root; a scoped search
// filters the surface it belongs to live.
//
// The MESSAGES key opens the DM TAB (owner, 27 Oct 2026): the "messages"
// popup tab, the live mail desk inside it (MessagesSheet.jsx), or the honest
// reason it cannot be there. It wears how many conversations wait
// (DmLive.jsx, which also draws the incoming-message banner).
//
// THE POST DISC: it brings up Post Selection's types as the POST cards; over
// a popup it closes the popup first (posting is unavailable inside one). It
// was also the session indicator — the `01/10` counter, the hub on a tap,
// New Session on a long hold — until the ten-session hub was taken away
// (owner, 27 Oct 2026: "lets get rid of the ten tabs that are hidden").
//
// THE WHEEL (owner, 26 Oct 2026, the sketches 6.jpg and IMG_1166): the disc
// ejects like a CD tray — the plus rides up out of the deck on a pill, a
// dark disc shows in its slot — and a wheel of the fixtures' glass grows
// round the tray (ScrollWheel.jsx). It SPAWNS when a Feed carousel (Figure
// 20) is centred on the screen, and turning it turns that carousel; it goes
// when none is ("the disc scroll wheel should spawn when a carousel is on
// center of the feed"). A tap on the plus — out on its tray or at home —
// brings up the POST CARDS (PostCards.jsx): Post Selection's six types on a
// ring above it, which the wheel turns; the front card, tapped, grows into
// its popup; nothing navigates. Escape, the dark disc or a click away put
// the cards away (Escape alone puts the wheel away from a carousel, until
// another is centred); a popup, search or another page put all of it away.
// One CSS transformation keyed on the deck's data-wheel and data-cards,
// reversed on close. The swipe up that ejected the tray (350f206) is gone:
// the owner's rule is the centred carousel and the plus.
//
// THE FEED KEY, TWICE (1.13): the first tap on the active tab dismisses the
// popup and reveals the tab where it was; the second refreshes the tab,
// which starts at the top (1.14).

import { useEffect, useRef, useState } from "react";
import { deckFor } from "../../lib/nav.js";
import { DECK, scopeFor } from "../../lib/dock.js";
import { useDock, setMode, setQuery, setTyping, flipToggle, openSheet, closeSearch, leaveSearch, closeSheet, setScope } from "../../lib/dockstate.js";
import { centredIndex, ringItem } from "../../lib/scrollwheel.js";
import { POST_TYPES } from "./PostSelection.jsx";
import { useEscape, useClickAway } from "./dismiss.js";
import ScrollWheel from "./ScrollWheel.jsx";
import PostCards from "./PostCards.jsx";
import { haptic } from "../../lib/haptics.js";
import AdStrip from "./AdStrip.jsx";
import Icon from "./Icons.jsx";
import { useDmLive } from "./DmLive.jsx";
import AMark from "./AMark.jsx";
import { useLiquidGlass, useGlassLamps, FIXTURE_BEND } from "./LiquidGlass.jsx";
import { useHingedKeys } from "./hinge.js";

/** Where the glass is cut, in the sketch's units from the deck's left edge
 *  (the deck is 745 wide): the two end caps and the four seams between keys. */
const CUTS = [40, 163, 290, 452, 578, 705];

export default function ControlCenter({ kind, pathname }) {
  const dock = useDock();
  const routes = deckFor(kind);
  const feed = routes[0];
  const account = routes[routes.length - 1];
  const inSearch = dock.mode === "search";
  // the deck's bar is the one search field: the popup that the first
  // character opens reads the same query and shows no field of its own
  const searchPopupUp = !!(dock.sheet && dock.sheet.id === "search");
  const scope = scopeFor({ pathname, sheet: dock.sheet && dock.sheet.id, likesTab: dock.likesTab });
  // each search keeps its own words (lib/dockstate.js setScope)
  useEffect(() => { setScope(scope.id); }, [scope.id]);
  const fieldRef = useRef(null);
  // the OG liquid glass: the bezel, the cuts, the disc, the grill and the indicator bend what passes beneath
  const glassRef = useRef(null);
  const glass = useLiquidGlass(glassRef, { id: "lg-deck", strength: 1, bend: FIXTURE_BEND, bezel: "fixture", shine: false });
  // every key but POST is hinged along its top (the upload disc presses straight in)
  useHingedKeys(glassRef);
  useGlassLamps(glassRef);

  // entering Map puts the dock in search mode — no keyboard
  useEffect(() => {
    if (String(pathname || "").startsWith("/map")) setMode("search");
    else if (!dock.sheet) setMode("base");
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e) {
    e.preventDefault();
    const q = String(dock.q || "").trim();
    if (scope.id === "global") { if (q && !searchPopupUp) openSheet("search"); return; }
    if (scope.id === "messages") {
      // the mail desk's own find, never the whole app
      window.dispatchEvent(new CustomEvent("asilum:dm-find", { detail: { q } }));
    }
    // map and likes scopes filter live through the dock state
  }

  function type(v) {
    setQuery(v);
    setTyping(true);
    // the sub tab appears only once something is typed (Figure 1)
    if (scope.id === "global" && v.trim() && !searchPopupUp) openSheet("search");
  }

  function press(id) {
    if (id === "search") {
      if (inSearch) { closeSearch(); return; }
      setMode("search");
      return;
    }
    if (id === "post") {
      // the plus brings up the POST cards (and takes them down again); over a
      // popup it closes the popup and brings them up — it was the ten-session
      // hub's indicator until the hub went (owner, 27 Oct 2026)
      haptic("press");
      if (popupUp) { closeSheet(); setCards(true); return; }
      setCards((c) => !c);
      return;
    }
    if (id === "messages") { openSheet("messages"); return; }
  }

  const popupUp = !!dock.sheet;
  const dm = useDmLive();
  // THE WHEEL: out while a Feed carousel is centred, or while the POST cards are up
  const [cards, setCards] = useState(false);
  const [ring, setRing] = useState(0);
  const [centred, setCentred] = useState(null); // the centred carousel's stage
  const [snoozed, setSnoozed] = useState(null); // the carousel the wheel was put away from
  const postRef = useRef(null);
  const wrapRef = useRef(null);
  const canWheel = !popupUp && !inSearch;
  const wheel = canWheel && (cards || (!!centred && centred !== snoozed));
  // which carousel is centred: on scroll, resize, a refreshed feed
  useEffect(() => {
    let timer = 0;
    const look = () => {
      timer = 0;
      const stages = Array.from(document.querySelectorAll(".main .f20stage"));
      const i = centredIndex(stages.map((el) => el.getBoundingClientRect()), window.innerHeight);
      setCentred(i < 0 ? null : stages[i]);
    };
    // a short throttle, not a frame: a page in the background still knows
    const wake = () => { if (!timer) timer = setTimeout(look, 60); };
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    window.addEventListener("asilum:feed-refresh", wake);
    const settle = setTimeout(wake, 800); // the feed arrives after the deck
    wake();
    return () => {
      clearTimeout(timer);
      clearTimeout(settle);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      window.removeEventListener("asilum:feed-refresh", wake);
    };
  }, [pathname]);
  // another carousel centred: the snooze is over
  useEffect(() => { if (centred !== snoozed) setSnoozed(null); }, [centred]); // eslint-disable-line react-hooks/exhaustive-deps
  // the wheel turns the POST cards while they are up, else the centred carousel
  function wheelStep(by) {
    if (cards) { setRing((r) => r + by); return; }
    if (centred) centred.dispatchEvent(new CustomEvent("f20step", { detail: { by } }));
  }
  function wheelEnd(which) {
    if (cards) { setRing((r) => r - ringItem(r, POST_TYPES.length) + (which === "first" ? 0 : POST_TYPES.length - 1)); return; }
    if (centred) centred.dispatchEvent(new CustomEvent("f20step", { detail: { to: which } }));
  }
  function putAway(refocus) {
    if (cards) setCards(false);
    else if (centred) setSnoozed(centred);
    if (refocus === true && postRef.current) postRef.current.focus();
  }
  function chooseCard(t) {
    setCards(false);
    openSheet("post", { kind: t.id, title: t.label });
  }
  useEscape(() => putAway(true), wheel);
  useClickAway(wrapRef, () => setCards(false), { active: cards });
  // a popup, search or another page puts the cards away
  useEffect(() => { if (!canWheel) setCards(false); }, [canWheel]);
  useEffect(() => { setCards(false); setSnoozed(null); }, [pathname]);
  // the cards up: the front card takes the focus
  useEffect(() => {
    if (!cards) return;
    const t = requestAnimationFrame(() => { const f = wrapRef.current && wrapRef.current.querySelector(".pccard.front"); if (f) f.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(t);
  }, [cards]);
  function feedTap(e, dest) {
    // the press that left search does only that: no refresh on the way out
    if (leftSearch.current) { leftSearch.current = false; if ((pathname || "/") === dest.href) e.preventDefault(); return; }
    if (dock.sheet) { e.preventDefault(); closeSheet(); return; }
    if ((pathname || "/") === dest.href && dest.href === "/") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("asilum:feed-refresh"));
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
    }
  }

  // ANOTHER KEY LEAVES SEARCH (owner, 19 Oct 2026): on the press itself, before
  // the key acts, so POST brings up its cards over a closed search, and
  // MESSAGES opens over a closed search
  const leftSearch = useRef(false);
  function keyDown(e) {
    if (!inSearch) return;
    const t = e.target && e.target.closest ? e.target.closest("a, button") : null;
    if (!t || t.closest(".ccsearch") || t.closest(".mailpanel") || t.getAttribute("aria-label") === "search") return;
    leftSearch.current = !!t.closest('a[href="/"]');
    leaveSearch();
  }

  // every key but POST answers with one subtle tick (the tab indicator's blink
  // carried this vibration until the light was taken away, 26 Oct 2026)
  function keyTap(e) {
    if (e.detail === 0) keyDown(e); // a key pressed from the keyboard has no pointer down
    const t = e.target && e.target.closest ? e.target.closest("a, button") : null;
    if (!t || t.closest(".ccpostwrap") || t.closest(".ccsearch") || t.closest(".mailpanel")) return;
    haptic("tick");
  }

  const sheetIs = (id) => !!(dock.sheet && dock.sheet.id === id);

  function key(k) {
    if (k.kind === "route") {
      const dest = k.id === "feed" ? feed : account;
      const cur = dest.match(pathname || "/") && !dock.sheet;
      return (
        <a key={k.id} className={"tabl hkey" + (cur ? " cur" : "")} href={dest.href} aria-label={dest.label.toLowerCase()} aria-current={cur ? "page" : undefined} onClick={k.id === "feed" ? (e) => feedTap(e, dest) : undefined}>
          <Icon name={dest.icon} size={22} />
          <span className="tbl">{dest.label}</span>
        </a>
      );
    }
    if (k.kind === "disc") {
      const cur = sheetIs("post") || sheetIs("postselect");
      return (
        <span key={k.id} className="ccpostwrap" ref={wrapRef}>
          <PostCards open={cards && canWheel} index={ring} onIndex={setRing} onChoose={chooseCard} />
          <ScrollWheel open={wheel} label={cards ? "wheel: turn to choose what to post" : "wheel: turn to move the carousel"} onStep={wheelStep} onEnd={wheelEnd} />
          <span className="cctray" aria-hidden="true" />
          <button type="button" className="ccspindle" aria-label={cards ? "put the cards away" : "put the wheel away"} tabIndex={wheel ? 0 : -1} aria-hidden={wheel ? undefined : true} onClick={() => putAway(true)} />
          <button
            ref={postRef}
            type="button"
            className={"tabl ccpost" + (cur ? " cur" : "")}
            aria-label="post"
            aria-pressed={cur}
            aria-expanded={canWheel ? cards : undefined}
            onClick={() => press("post")}
          >
            <span className="ccdisc" data-lens-shape="ring" data-lens-band="11">
              <Icon name="plus" size={24} />
            </span>
            <span className="tbl">{k.label}</span>
          </button>
        </span>
      );
    }
    if (k.id === "messages") {
      // THE DM TAB (owner, 27 Oct 2026: "the direct message button should up
      // the direct message tab"): one key, the "messages" popup tab, wearing
      // how many conversations wait (DmLive.jsx reads them)
      const cur = sheetIs("messages");
      return (
        <button key={k.id} type="button" className={"tabl hkey ccdm" + (cur ? " cur" : "")} onClick={() => press("messages")} aria-label={dm.waiting ? `messages — ${dm.waiting} waiting` : "messages"}>
          <Icon name="messages" size={22} /><span className="tbl">{k.label}</span>
          {dm.waiting ? <b className="dmcount" aria-hidden="true">{dm.waiting > 9 ? "9+" : dm.waiting}</b> : null}
        </button>
      );
    }
    // search: a mode
    const cur = inSearch;
    return (
      <button key={k.id} type="button" className={"tabl hkey" + (cur ? " cur" : "")} onClick={() => press("search")} aria-label="search" aria-pressed={cur}>
        <Icon name="search" size={22} /><span className="tbl">{k.label}</span>
      </button>
    );
  }

  return (
    <div ref={glassRef} className={"ccenter" + (inSearch ? " ccsearching" : "")} data-scope={scope.id} data-mode={inSearch ? "search" : "base"} data-wheel={wheel ? "open" : undefined} data-cards={cards && canWheel ? "open" : undefined}>
      {glass}
      <nav className="tabbar" aria-label="control deck" onPointerDownCapture={keyDown} onClickCapture={keyTap}>
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
                onChange={(e) => type(e.target.value)}
                onBlur={() => setTyping(false)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(e); if (e.key === "Escape") closeSearch(); }}
                enterKeyHint="search"
              />
              {scope.id === "global" ? (
                <button type="button" className={"ccamark" + (dock.toggles.asterisk ? " on" : "")} aria-pressed={!!dock.toggles.asterisk} onClick={() => { haptic("toggle"); flipToggle("asterisk"); }} title={dock.toggles.asterisk ? "ASTERISK reads your Passport — tap to search without it" : "tap to let ASTERISK read your Passport"}>
                  <AMark className={dock.toggles.asterisk ? "on" : ""} label={dock.toggles.asterisk ? "ASTERISK on" : "ASTERISK off"} />
                </button>
              ) : scope.wide ? (
                <a className="ccwide" href={"/discover?q=" + encodeURIComponent(dock.q || "")} title={"searching " + scope.placeholder.replace(/^Search /, "")}>ALL →</a>
              ) : null}
            </label>
            <button type="button" className="ccclose" onClick={closeSearch} aria-label="close search"><Icon name="close" size={18} /></button>
          </form>
        )}
        <div className="ccrow">
          {CUTS.map((x) => <i key={x} className="cccut" style={{ "--cut-x": x }} data-lens-shape="cut" data-lens-band="6" data-lens-gain="0.08" aria-hidden="true" />)}
          <span className="cccap" aria-hidden="true" />
          <div className="cctabs">
            {DECK.map((k) => key(k))}
          </div>
          <span className="cccap" aria-hidden="true" />
        </div>
        {/* THE AD BUBBLE (owner, 25 Oct 2026, last: "the ad ticker is added to the
            central control fixture as a bubble … inside the bubble will be the ad
            scroll wheel"; moved the same night: "beneath the buttons and above the
            vent"): the ticker (AdStrip.jsx) in a long pill under the row, over the
            foot grill; the deck is taller by --ad-h to hold it */}
        <div className="ccad"><AdStrip typing={inSearch} /></div>
      </nav>
      <i className="ccgrill" data-lens-shape="slot" data-lens-band="9" aria-hidden="true" />
      <i className="fxrim" aria-hidden="true" />
    </div>
  );
}
