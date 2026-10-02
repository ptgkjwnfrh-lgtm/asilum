"use client";

// app/components/SheetHost.jsx — THE ONE SHEET (V.2 brief, owner, 1 Oct
// 2026, decision 2): secondary surfaces open at about 60% of the available
// height over the root, which stays visible behind a muted teal backdrop
// (the primary reference's modal atmosphere, used ONLY here). One sheet
// exists at a time; details navigate inside it with Back; opening another
// replaces it. It grows to the full height for the keyboard, large text
// and long editing (the EXPAND control, and automatically when a field
// inside it takes focus). Escape, the scrim and Close all close it
// (components/dismiss.js); focus is trapped while it is open.
//
// The host knows nothing about what a sheet shows: it renders the view the
// dock state names (lib/dockstate.js) from the table below.

import { useEffect, useRef, useState } from "react";
import { useDock, closeSheet, backSheet } from "../../lib/dockstate.js";
import { useEscape, useFocusTrap } from "./dismiss.js";
import Icon from "./Icons.jsx";
import LikesSheet from "./LikesSheet.jsx";
import SearchSheet from "./SearchSheet.jsx";
import MessagesSheet from "./MessagesSheet.jsx";
import OverviewSheet from "./OverviewSheet.jsx";

const VIEWS = {
  likes: { title: "LIKES", render: (p) => <LikesSheet {...p} /> },
  search: { title: "SEARCH", render: (p) => <SearchSheet {...p} /> },
  messages: { title: "MESSAGES", render: (p) => <MessagesSheet {...p} /> },
  overview: { title: "OVERVIEW", render: (p) => <OverviewSheet {...p} /> },
};

export default function SheetHost() {
  const dock = useDock();
  const ref = useRef(null);
  const [tall, setTall] = useState(false);
  const open = !!dock.sheet;
  const top = open ? dock.sheet.stack[dock.sheet.stack.length - 1] : null;
  const view = top ? VIEWS[top.view] : null;
  const hasBack = open && dock.sheet.stack.length > 1;

  useEscape(() => (hasBack ? backSheet() : closeSheet()), open);
  useFocusTrap(ref, open);

  // a new sheet opens at its initial height; a field taking focus inside it
  // lifts it to the full height so the keyboard never covers the input
  useEffect(() => { setTall(false); }, [dock.sheet && dock.sheet.id]);
  useEffect(() => {
    if (!open || !ref.current) return undefined;
    const node = ref.current;
    const onFocus = (e) => { if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) setTall(true); };
    node.addEventListener("focusin", onFocus);
    return () => node.removeEventListener("focusin", onFocus);
  }, [open]);

  // the page behind is inert while a sheet is up: no scroll-through
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !view) return null;
  const title = top.props && top.props.title ? top.props.title : view.title;
  return (
    <div className="sheetscrim" onMouseDown={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
      <section ref={ref} className={"sheet" + (tall ? " tall" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheethead">
          {hasBack ? (
            <button className="sheetbtn" onClick={backSheet} aria-label="back"><Icon name="back" size={20} /><span>BACK</span></button>
          ) : <span className="sheetgrip" aria-hidden="true" />}
          <h2 className="sheettitle">{title}</h2>
          <div className="sheetacts">
            <button className="sheetbtn" onClick={() => setTall((t) => !t)} aria-label={tall ? "shrink the sheet" : "expand the sheet"} aria-pressed={tall}>
              <Icon name={tall ? "minus" : "plus"} size={20} /><span>{tall ? "SHRINK" : "EXPAND"}</span>
            </button>
            <button className="sheetbtn" onClick={closeSheet} aria-label="close"><Icon name="close" size={20} /><span>CLOSE</span></button>
          </div>
        </header>
        <div className="sheetbody">{view.render(top.props || {})}</div>
      </section>
    </div>
  );
}
