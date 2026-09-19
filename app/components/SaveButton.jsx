"use client";

// app/components/SaveButton.jsx — the one SAVE word (V.2).
// A word, per the button law: SAVE in the signal colour, SAVED in red once it
// is kept. Works for every kind lib/save.js knows. Optimistic: the word flips
// at once and flips back if the record refuses.

import { useEffect, useState } from "react";
import { isSaved, toggleSave } from "../../lib/save.js";

export default function SaveButton({ kind, id, title, image, href, meta, tags, item, className = "", labels = ["SAVE", "SAVED"] }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sync = () => setOn(isSaved(kind, id));
    sync();
    window.addEventListener("asilum:save", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("asilum:save", sync); window.removeEventListener("storage", sync); };
  }, [kind, id]);
  async function click(e) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const was = on;
    setOn(!was);
    try { const r = await toggleSave({ kind, id, title, image, href, meta, tags, item }); setOn(!!r.on); }
    catch { setOn(was); }
    finally { setBusy(false); }
  }
  return (
    <button
      type="button"
      className={"savew" + (on ? " on" : "") + (className ? " " + className : "")}
      aria-pressed={on}
      aria-label={(on ? "saved — remove from passport: " : "save to passport: ") + title}
      onClick={click}
      disabled={busy}
    >
      {on ? labels[1] : labels[0]}
    </button>
  );
}
