"use client";

// app/components/ConsentMoment.jsx — D4's first-visit consent moment
// (ruled 20 Aug 2026; spec docs/d4-consent-spec-2026-08-20.md). Shell-
// mounted so it covers both landing laws and every deep link; renders only
// while the device is UNANSWERED, and unanswered = unobserved is enforced
// server-side, so ignoring it is safe by construction. A consent moment is
// ANSWERED, never dismissed — no click-away, no Escape, deliberately not
// one of useOverlayDismiss's overlays. Copy is the spec's draft; the
// owner's voice pass stands open.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getUid, postJSON } from "../../lib/client.js";
import { setObservation } from "../../lib/social.js";
import { useFocusTrap } from "./dismiss.js";

export default function ConsentMoment() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef(null);
  const boxRef = useRef(null);
  const settledRef = useRef(false); // answered (any session) — stop re-asking the server
  const pathname = usePathname();
  // The magazine's face stays clean (owner order, 20 Aug): the moment never
  // covers the FRONT COVER. Desktop entry lands on /cover untouched; the
  // first click into the CATALOG (or any other page) raises the question.
  // Mobile lands on the catalog directly and sees it on open. Unanswered
  // stays unobserved throughout — the cover writes nothing either way.
  const onCover = (pathname || "").startsWith("/cover");

  useEffect(() => {
    if (onCover || settledRef.current) return undefined;
    let dead = false;
    // A beat after arrival: the boot sweep lands first, then the question.
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/consent", { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (dead || !res.ok) return;
        if (d.state === null) setShow(true);
        else settledRef.current = true; // answered — never ask again this visit
      } catch { /* unanswered stays unobserved — nothing to force */ }
    }, 700);
    return () => { dead = true; clearTimeout(t); };
  }, [onCover]);

  // The house trap (components/dismiss.js): keeps Tab inside the dialog and
  // gives focus back on unmount — aria-modal's promise, made true.
  useFocusTrap(boxRef, show);

  useEffect(() => {
    if (show && firstRef.current) firstRef.current.focus();
  }, [show]);

  async function answer(choice) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await postJSON("/api/consent", { user: getUid(), choice });
      if (!res.ok) throw new Error("refused");
      try { window.localStorage.setItem("asilum-consent", choice); } catch {}
      setObservation(choice === "observe");
      settledRef.current = true;
      setShow(false);
    } catch {
      setBusy(false); // still unanswered, still unobserved; the moment stays
    }
  }

  if (!show || onCover) return null;
  return (
    <div className="consent-veil" role="presentation">
      <div
        className="consent-moment"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-body"
        ref={boxRef}
      >
        <div className="consent-title" id="consent-title">
          <span className="red">*</span>THE ASTERISK SYSTEM
        </div>
        <div className="consent-body" id="consent-body">
          {/* The owner's voice pass, 20 Aug 2026 — their words, the house's
              lowercase prose, their emphasis kept exactly. */}
          <p>
            this terminal learns quietly in the background. what you linger
            on. what you save. what you skip. what you buy. along with the{" "}
            <b><span className="red">*</span>STAMPS</b> you choose to upload
            to your <b><span className="red">*</span>PASSPORT</b>. it
            observes for one reason: to make your shopping &amp; discovery
            experience feel more like yours every time you return.
          </p>
          <p>
            <span className="red">*</span>ASILUM magazine <b>WILL NEVER</b>{" "}
            sell your information. once you have a{" "}
            <b><span className="red">*</span>PASSPORT</b>, your style, taste
            and content stay protected.
          </p>
          <p className="consent-seek">
            seek <b><span className="red">*</span>ASILUM</b> or disappear into the catalog.
          </p>
          <p className="consent-close">
            Your <span className="red">*</span>PASSPORT. Your taste. Your
            choice. ;)
          </p>
        </div>
        <div className="consent-actions">
          <button ref={firstRef} className="btn" disabled={busy} onClick={() => answer("observe")}>
            OBSERVE ME ✓
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => answer("general")}>
            GENERAL ONLY ✓
          </button>
        </div>
        <p className="consent-fine">
          change anytime in <a href="/settings">SETTINGS</a> · the fine print
          → <a href="/terms">TERMS</a>. until you answer, the Asterisk system
          does not watch.
        </p>
      </div>
    </div>
  );
}
