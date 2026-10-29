"use client";

// app/components/SheetHost.jsx — THE POPUP (V.2 Blueprint, owner, 17 Oct
// 2026, chapter 1; the 1 Oct brief decision 2 where the blueprint is
// silent). Secondary surfaces open at about 60% of the available height
// over the root, which stays visible behind the scrim. One popup is on
// screen at a time; a new one opens over it and the previous waits under it
// for Back (1.1). The gesture grammar (1.2): Back and a swipe
// right restore the previous popup; a swipe down from the header dismisses;
// tapping outside dismisses lightweight popups and never a checkout or an
// edit in progress. Dismissing keeps the tab exactly as it was (1.3): the
// ten-session hub's face is gone (owner, 27 Oct 2026), its laws are kept —
// each tab's views stay alive here, out of sight, while the page lives, so
// reopening a tab gives back what was typed, chosen and scrolled; after a
// reload the tab's views and scroll come back from lib/dockstate.js. It grows to the
// full height for the keyboard, large text and long editing (EXPAND, and
// automatically when a field inside it takes focus). Escape closes it
// (components/dismiss.js); focus is trapped while it is open. While a popup
// is up the fixtures shrink and go translucent (1.12) — `data-popup` on the
// root does that in CSS.
//
// The host knows nothing about what a popup shows: it renders the views of
// the dock's tabs (lib/dockstate.js) from the table below.

import { useEffect, useRef, useState } from "react";
import { useDock, closeSheet, backSheet, hydrateTabs, rememberScroll } from "../../lib/dockstate.js";
import { useEscape, useFocusTrap } from "./dismiss.js";
import { watchOfflineQueue } from "../../lib/client.js";
import { useLiquidGlass } from "./LiquidGlass.jsx";
import Icon from "./Icons.jsx";
import LikesSheet from "./LikesSheet.jsx";
import SearchSheet from "./SearchSheet.jsx";
import DiscoverSheet from "./DiscoverSheet.jsx";
import OverviewSheet from "./OverviewSheet.jsx";
import BagSheet from "./BagSheet.jsx";
import NoticesSheet from "./NoticesSheet.jsx";
import PostComposer from "./PostComposer.jsx";
import PostSelection from "./PostSelection.jsx";
import ListingSheet from "./ListingSheet.jsx";
import MediaFloat from "./MediaFloat.jsx";
import EchoViewer from "./EchoRail.jsx";
import ScoreSheet from "./ScoreSheet.jsx";
import Onboarding from "./Onboarding.jsx";
import MapSheet from "./MapSheet.jsx";
import BrdcstSheet from "./BrdcstSheet.jsx";

const VIEWS = {
  likes: { title: "LIKES", render: (p) => <LikesSheet {...p} /> },
  search: { title: "SEARCH", render: (p) => <SearchSheet {...p} /> },
  // the search tab's browse-without-typing face: the current craving, the rails, the whole inventory (29 Oct 2026)
  discover: { title: "DISCOVER", render: (p) => <DiscoverSheet {...p} /> },
  overview: { title: "OVERVIEW", render: (p) => <OverviewSheet {...p} /> },
  bag: { title: "BAG", render: (p) => <BagSheet {...p} /> },
  notices: { title: "NOTICES", render: (p) => <NoticesSheet {...p} /> },
  post: { title: "POST", render: (p) => <PostComposer compact {...p} />, heavy: true },
  postselect: { title: "POST", render: (p) => <PostSelection {...p} /> },
  // THE ONE FEED (slice 3): the LISTING popup over the softened Feed; STILL
  // and MOTION enlarged with the caption on the media; the ECHO viewer
  listing: { title: "LISTING", render: (p) => <ListingSheet {...p} /> },
  media: { title: "STILL", render: (p) => <MediaFloat {...p} /> },
  echo: { title: "ECHO", render: (p) => <EchoViewer {...p} /> },
  // a payment page is never dismissed by a tap outside (1.2); the route
  // itself arrives with native commerce
  checkout: { title: "CHECKOUT", render: () => null, heavy: true },
  // the Passenger Score popup (slice 7, 6.18), from Account and Passport only
  score: { title: "PASSENGER SCORE", render: (p) => <ScoreSheet {...p} /> },
  // the Passport's onboarding (14.11, slice 10c): five to seven questions on first opening; an edit in progress is heavy
  onboarding: { title: "PASSPORT", render: (p) => <Onboarding {...p} />, heavy: true },
  // the map above a post (5.5, slice 12): a BRDCST's event pinned, the ring around it
  map: { title: "MAP", render: (p) => <MapSheet {...p} /> },
  // the BRDCST popup (owner's drawing, 25 Oct 2026): the strip's photograph clear, the event's record
  brdcst: { title: "BRDCST", render: (p) => <BrdcstSheet {...p} /> },
};

const SWIPE_DOWN = 70;
const SWIPE_BACK = 80;

/** Tabs whose views stay mounted out of sight (the most recent). */
export const ALIVE = 6;

// One view of a tab: its own scroller. Out of sight it is hidden and inert
// but stays laid out, so its scroll and its state are kept; its scroll is
// also remembered on the device, and given back when it was not alive (a
// reload), once its content is tall enough to hold it.
function SheetPane({ tabKey, index, scroll, live, children }) {
  const ref = useRef(null);
  const raf = useRef(0);
  const restored = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!live || !el || restored.current || !scroll) { restored.current = true; return undefined; }
    let tries = 0, t = 0;
    const put = () => {
      el.scrollTop = scroll;
      if (Math.abs(el.scrollTop - scroll) <= 2 || ++tries > 20) { restored.current = true; return; }
      t = setTimeout(put, 100); // the content may still be arriving
    };
    put();
    return () => clearTimeout(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = 0; if (ref.current) rememberScroll(tabKey, index, ref.current.scrollTop); });
  };
  return (
    <div ref={ref} className="sheetpane" data-live={live ? "1" : undefined} aria-hidden={live ? undefined : true} inert={live ? undefined : true} onScroll={onScroll}>
      {children}
    </div>
  );
}

export default function SheetHost() {
  const dock = useDock();
  useEffect(() => { watchOfflineQueue(); }, []);
  const ref = useRef(null);
  // EVERY POPUP IS A LARGE CARD (owner, 29 Oct 2026: "all the pop up tabs have to look like cards four rounded corners
  // and it being centered in the screen, lowkey every pop up tab should be the size of a large card"): one size, in
  // the middle of the screen, so the EXPAND / SHRINK key and the views' own heights are gone. A field taking focus
  // lifts the card to just under the Masthead, the same size, so a phone's keyboard does not cover it.
  const [typing, setTyping] = useState(false);
  const popup = dock.sheet;
  const open = !!popup;
  const top = popup ? popup.top : null;
  const view = top ? VIEWS[top.view] : null;
  const hasBack = !!popup && popup.stack.length > 1;
  const headSwipe = useRef(null);
  const bodySwipe = useRef(null);

  // where each tab was, on this device (and what the retired hub saved, cleared)
  useEffect(() => { hydrateTabs(); }, []);
  // THE TABS KEPT ALIVE: every tab opened while the page lives keeps its views
  // mounted, out of sight and inert, so its state and scroll are as they were
  // left; the most recent ALIVE tabs, to bound the work of the hidden ones
  const [seen, setSeen] = useState([]);
  useEffect(() => {
    if (popup && !seen.includes(popup.key)) setSeen((list) => [popup.key, ...list.filter((k) => k !== popup.key)]);
  }, [popup && popup.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const alive = dock.tabs.filter((t) => t.key === (popup && popup.key) || seen.includes(t.key)).slice(0, ALIVE);
  if (popup && !alive.some((t) => t.key === popup.key)) alive.unshift(dock.tabs.find((t) => t.key === popup.key));

  const dismiss = () => closeSheet();
  useEscape(() => (hasBack ? backSheet() : dismiss()), open);
  useFocusTrap(ref, open, { companion: ".ccsearch" }); // the deck's search bar keeps its caret
  // THE OG LIQUID GLASS (8 Sep: the item detail in the same glass, the page
  // bending under it — 8073a74, 7a6abe5, 19a7bd6; slice 14 restores it on
  // every popup): all four edges lens what lies beneath at half the deck's
  // pull; where the engine cannot bend a backdrop (WebKit) the cards under
  // the edges bend instead. The page is lowered and softened by its own
  // filter while a popup is up ([data-popup] .main), never by a backdrop
  // blur on the scrim — that would make the scrim a backdrop root and leave
  // the popup only a flat colour to bend.
  const glass = useLiquidGlass(ref, { id: "lg-popup", strength: 0.8, active: open, bend: ".card" });

  // a new popup opens in the middle; a field taking focus inside it lifts the card under the Masthead
  useEffect(() => { setTyping(false); }, [open, top && top.view]);
  useEffect(() => {
    if (!open || !ref.current) return undefined;
    const node = ref.current;
    const onFocus = (e) => { if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) setTyping(true); };
    node.addEventListener("focusin", onFocus);
    return () => node.removeEventListener("focusin", onFocus);
  }, [open]);

  // the page behind is inert while a popup is up: no scroll-through; the
  // fixtures shrink and go translucent (1.12)
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!open) { delete document.documentElement.dataset.popup; return undefined; }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.popup = "1";
    return () => { document.body.style.overflow = prev; delete document.documentElement.dataset.popup; };
  }, [open]);

  if (!alive.length) return null;
  const title = top && view ? (top.props && top.props.title ? top.props.title : view.title) : "";
  const lightweight = !view || !view.heavy;

  // swipe down from the header dismisses; swipe right on the body goes back
  function headDown(e) { headSwipe.current = { y: e.clientY }; }
  function headUp(e) {
    const s = headSwipe.current; headSwipe.current = null;
    if (s && e.clientY - s.y > SWIPE_DOWN) dismiss();
  }
  function bodyDown(e) { bodySwipe.current = { x: e.clientX, y: e.clientY }; }
  function bodyUp(e) {
    const s = bodySwipe.current; bodySwipe.current = null;
    if (!s || !hasBack) return;
    if (e.clientX - s.x > SWIPE_BACK && Math.abs(e.clientY - s.y) < 40) backSheet();
  }

  return (
    <div className="sheetscrim" data-kept={open ? undefined : "1"} onMouseDown={(e) => { if (open && e.target === e.currentTarget && lightweight) dismiss(); }}>
      <section ref={ref} className={"sheet lgrx" + (typing ? " typing" : "")} role="dialog" aria-modal={open ? "true" : undefined} aria-label={title || undefined} aria-hidden={open ? undefined : true} inert={open ? undefined : true}>
        {glass}
        <header className={"sheethead" + (hasBack ? " hasback" : "")} onPointerDown={headDown} onPointerUp={headUp}>
          {hasBack ? (
            <button className="sheetbtn" onClick={backSheet} aria-label="back"><Icon name="back" size={20} /><span>BACK</span></button>
          ) : <span className="sheetgrip" aria-hidden="true" />}
          <h2 className="sheettitle">{title}</h2>
          <div className="sheetacts">
            <button className="sheetbtn" onClick={dismiss} aria-label="close"><Icon name="close" size={20} /><span>CLOSE</span></button>
          </div>
        </header>
        <div className="sheetbody" onPointerDown={bodyDown} onPointerUp={bodyUp}>
          {/* one flat list, each view keyed by its tab and place: nested lists
              are keyed by their position, and a tab moving to the front would
              remount every view behind it (and lose its state and scroll) */}
          {alive.flatMap((tab) => tab.stack.map((entry, i) => {
            const v = VIEWS[entry.view];
            if (!v) return null;
            const live = open && tab.key === popup.key && i === tab.stack.length - 1;
            return (
              <SheetPane key={tab.key + "#" + i + ":" + entry.view} tabKey={tab.key} index={i} scroll={entry.scroll} live={live}>
                {v.render(entry.props || {})}
              </SheetPane>
            );
          }))}
        </div>
      </section>
    </div>
  );
}
