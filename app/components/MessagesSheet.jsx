"use client";

// app/components/MessagesSheet.jsx — MESSAGES as a utility (V.2 brief,
// owner, 1 Oct 2026, §1 + §3). The live mail desk (MailDesk.jsx — inbox,
// requests, threads, block, mute, receipts) is unchanged and keeps its own
// panel; the control center's MESSAGES key opens it directly whenever it
// is available. This sheet is what the key opens when it is NOT: a signed
// out reader, or a deployment with MESSAGING_ENABLED off. It says which,
// and offers the one action that changes it. The dock's search in this
// scope ("Search your messages") reaches only the mail desk's own find —
// never the whole app (the brief: a private-message search can never
// widen on its own).

import { useEffect, useState } from "react";
import { getUid, authorizedFetch } from "../../lib/client.js";
import ModelTag from "./ModelTag.jsx";

export default function MessagesSheet() {
  const [why, setWhy] = useState(null); // "signed-out" | "off" | null (checking)
  useEffect(() => {
    const uid = getUid();
    if (!uid || !uid.startsWith("sb-")) { setWhy("signed-out"); return; }
    authorizedFetch("/api/dm?op=counts&user=" + encodeURIComponent(uid), { cache: "no-store" })
      .then((r) => setWhy(r.status === 404 ? "off" : null))
      .catch(() => setWhy("off"));
  }, []);
  return (
    <div className="msgsheet">
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
      {why === null && <p className="pempty" role="status">opening the mail desk…</p>}
    </div>
  );
}
