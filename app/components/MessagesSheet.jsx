"use client";

// app/components/MessagesSheet.jsx — THE DM TAB (owner, 27 Oct 2026: "the
// direct message button should up the direct message tab"). The deck's
// MESSAGES key opens this popup tab, and it is the live mail desk itself
// (MailDesk.jsx, embedded: inbox, requests, threads, block, mute, receipts),
// kept alive with the tab so a conversation left half-read resumes where it
// was. When the desk cannot be here it says why, honestly: a signed-out
// reader (the one action that changes it is offered), a deployment with
// MESSAGING_ENABLED off (absent, never simulated), or a store that is not
// answering. The message banner (DmLive.jsx) opens this tab on a
// conversation with a double tap. The dock's search in this scope ("Search
// your messages") reaches only the desk's own find — never the whole app.

import { useEffect, useState } from "react";
import { getUid, authorizedFetch } from "../../lib/client.js";
import ModelTag from "./ModelTag.jsx";
import MailDesk from "./MailDesk.jsx";

export default function MessagesSheet() {
  // null = checking; "desk" | "signed-out" | "off" | "away"
  const [why, setWhy] = useState(null);
  useEffect(() => {
    let gone = false;
    const check = () => {
      const uid = getUid();
      if (!uid || !uid.startsWith("sb-")) { setWhy("signed-out"); return; }
      authorizedFetch("/api/dm?op=summary&user=" + encodeURIComponent(uid), { cache: "no-store" })
        .then((r) => { if (!gone) setWhy(r.ok ? "desk" : r.status === 404 ? "off" : r.status === 401 ? "signed-out" : "away"); })
        .catch(() => { if (!gone) setWhy("away"); });
    };
    check();
    window.addEventListener("asilum:identity", check);
    return () => { gone = true; window.removeEventListener("asilum:identity", check); };
  }, []);
  return (
    <div className="msgsheet">
      {why === "desk" && <MailDesk embedded />}
      {why === "signed-out" && (
        <>
          <p className="deck">Messages need an account.</p>
          <p className="fine">Sign in and the mail desk opens here — inbox, requests, and threads with the passengers you follow.</p>
          <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("asilum:signup-open", { detail: { mode: "signin" } }))}>SIGN IN</button>
        </>
      )}
      {why === "off" && (
        <>
          <p className="deck">Messaging is not enabled on this deployment.</p>
          <p className="fine">The mail desk exists and is off by configuration (MESSAGING_ENABLED). Nothing here is simulated. <ModelTag kind="device">CONNECTION REQUIRED</ModelTag></p>
        </>
      )}
      {why === "away" && <p className="fine" role="status">The mail desk is not answering right now — your messages are safe; try again in a moment.</p>}
      {why === null && <p className="pempty" role="status">opening the mail desk…</p>}
    </div>
  );
}
