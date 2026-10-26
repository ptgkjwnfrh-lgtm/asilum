"use client";

// app/components/PassportButton.jsx — THE PASSPORT BUTTON (V.2 Blueprint,
// owner, 17 Oct 2026, Foundations "Screen map"; the owner's fixture sketch
// of 19 Oct 2026, Figure 5: the meridian globe at the far top right, its
// right edge in line with the deck's). Since 26 Oct 2026 a bare key on the
// Masthead's glass, beside the Info Dock's keys — no pane of its own. It
// opens the Passport: STAMPS, the map, the taste record.
// In this slice it is a link to the Passport's route; slice 2 makes the
// Passport a popup in the session hub and this button its opener.
//
// A business has no passport (lib/accounts.js), so it has no globe: the
// destination comes from lib/nav.js fixtureFor, which answers null for a
// kind the route guard would turn away.

import { useRef } from "react";
import Icon from "./Icons.jsx";
import { useHingedKeys } from "./hinge.js";
import { fixtureFor } from "../../lib/nav.js";
import { leaveSearch } from "../../lib/dockstate.js";

export default function PassportButton({ kind, pathname }) {
  const p = fixtureFor(kind, "passport");
  // the globe is a hinged key: it tips when pressed (the hook runs before the business's early return)
  const keyRef = useRef(null);
  useHingedKeys(keyRef, ".hkey", !!p);
  if (!p) return null;
  const cur = p.match(pathname || "/");
  return (
    <a
      ref={keyRef}
      className={"passportbtn" + (cur ? " cur" : "")}
      href={p.href}
      aria-label="passport"
      aria-current={cur ? "page" : undefined}
      onClick={leaveSearch /* the globe pressed while searching leaves search (owner, 19 Oct 2026) */}
      title={p.label}
    >
      <span className="pbkey hkey"><Icon name="globe" size={22} /></span>
      <span className="idlabel">{p.label}</span>
    </a>
  );
}
