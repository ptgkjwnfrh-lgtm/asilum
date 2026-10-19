"use client";

// app/components/SavePrompt.jsx — the account moment (V.2).
// The brief: "Let visitors browse. Prompt account creation after a meaningful
// action such as the first save." This is that prompt and nothing else: it
// appears once, after the FIRST save on a device that is not signed in, and
// offers the sign-in sheet the shell already owns. It never gates anything —
// the save has already happened.

import { useEffect, useState } from "react";
import { getUid } from "../../lib/client.js";

export default function SavePrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onFirst = () => {
      const uid = getUid();
      if (uid && uid.startsWith("sb-")) return; // an account already keeps it
      setShow(true);
    };
    window.addEventListener("asilum:first-save", onFirst);
    return () => window.removeEventListener("asilum:first-save", onFirst);
  }, []);
  if (!show) return null;
  return (
    <div className="saveprompt" role="status" aria-live="polite">
      <b className="red">*</b> saved to your Passport on this device.
      <span className="savepromptacts">
        <button className="txtbtn" onClick={() => { setShow(false); window.dispatchEvent(new CustomEvent("asilum:signup-open", { detail: { mode: "create" } })); }}>
          KEEP IT EVERYWHERE — SIGN IN
        </button>
        <button className="txtbtn" onClick={() => setShow(false)}>LATER</button>
      </span>
    </div>
  );
}
