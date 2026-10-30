"use client";

// app/components/PostCards.jsx — THE POST CARDS (owner, 26 Oct 2026, the
// sketch IMG_1166: "if the upload button is pressed then small cards of the
// upload options should appear. if the subtabs wanted to be selected the
// cards should [get] bigger because they'd be pop ups. it shouldn't bring
// anyone to another confusing tab"). The six publishing types of Post
// Selection (PostSelection.jsx POST_TYPES — nothing invented) as small
// portrait cards of the fixtures' glass on a ring above the plus, seen from
// the front: the card at the front tall and forward, its neighbours smaller
// and set back, the rest behind. The wheel turns the ring (ControlCenter.jsx);
// a tap on a side card brings it to the front. A tap on the front card
// grows it into its popup — the composer, over the root, in the one popup
// (SheetHost.jsx "post"); nothing navigates. LISTING waits for the native
// storefront and says so (POST_SOON), as Post Selection does.

import { useEffect, useRef, useState } from "react";
import { POST_TYPES, POST_SOON } from "./PostSelection.jsx";
import { ringItem, ringSpin } from "../../lib/scrollwheel.js";
import { haptic } from "../../lib/haptics.js";
import Icon from "./Icons.jsx";

// the card's grow is the ladder's --dur-3 (app/globals.css .pccard: transform var(--dur-3)); the popup waits for it to
// end (29 Oct 2026, "checking … timing": it waited 260 and cut a 320ms grow short, the popup over a card still growing)
export const GROW_MS = 320;

export default function PostCards({ open, index, onIndex, onChoose }) {
  const n = POST_TYPES.length;
  const front = ringItem(index, n);
  const [grow, setGrow] = useState(null);
  const [soon, setSoon] = useState(null);
  const frontRef = useRef(null);
  useEffect(() => { setSoon(null); }, [front]);
  useEffect(() => { if (!open) { setGrow(null); setSoon(null); } }, [open]);

  function pick(i) {
    if (!open || grow !== null) return;
    if (i !== front) {
      // the short way round to the card tapped
      const d = ((i - front + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
      haptic("tick");
      onIndex(index + d);
      return;
    }
    const t = POST_TYPES[i];
    if (POST_SOON[t.id]) { setSoon(t.id); haptic("error"); return; }
    haptic("confirm");
    setGrow(i);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { setGrow(null); onChoose(t); }, still ? 0 : GROW_MS);
  }

  return (
    <div className={"pcring" + (grow !== null ? " growing" : "")} role="group" aria-label="what to post" aria-hidden={open ? undefined : true}>
      <div className="pcring3d" style={{ "--spin": `${ringSpin(index, n)}deg` }}>
        {POST_TYPES.map((t, i) => (
          <button
            key={t.id}
            ref={i === front ? frontRef : undefined}
            type="button"
            className={"pccard" + (i === front ? " front" : "") + (grow === i ? " grow" : "") + (POST_SOON[t.id] ? " soon" : "")}
            style={{ "--a": `${(i * 360) / n}deg` }}
            tabIndex={open && i === front ? 0 : -1}
            aria-label={`${t.label}: ${t.means}${POST_SOON[t.id] ? " (not yet)" : ""}`}
            onClick={() => pick(i)}
          >
            <Icon name={t.icon} size={22} />
            <b>{t.label}</b>
            <small>{t.means}</small>
          </button>
        ))}
      </div>
      {soon ? <p className="fine soon postsoon pcsoon" role="status">{POST_SOON[soon]}</p> : null}
    </div>
  );
}
