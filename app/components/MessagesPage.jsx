"use client";

// app/components/MessagesPage.jsx — THE MESSAGES PAGE (owner, 28 Oct 2026, the messages sketch: "we have to
// build a direct message page that the user will be brought to upon clicking the direct message button").
// /messages (lib/nav.js MESSAGES_HREF), reached by the deck's MESSAGES key, the message banner, a listing's
// OFFER and a storefront's MESSAGE key (DmLive.jsx openDesk). As drawn:
//   :ECHOS            the echo rail (EchoRail.jsx) — the live echoes of the people you follow, the Feed's own
//   [search] ○ [A]    the desk's message search, the NEW MESSAGE circle, the ASTERISK square
//   ○ *handle_   11 DAYS AGO >>
//     :last message sent
//   ───────────────  a row per conversation (MailDesk.jsx, page)
// It replaced the "messages" popup tab. When the desk cannot be here it says why, honestly — the same three
// answers the tab gave: a signed-out reader (the one action that changes it is offered), a deployment with
// MESSAGING_ENABLED off (absent, never simulated), or a store that is not answering.

import { useEffect, useState } from "react";
import { getUid, authorizedFetch } from "../../lib/client.js";
import { fetchPosts } from "../../lib/social.js";
import { echoRail } from "../../lib/feed/types.js";
import { EchoRail } from "./EchoRail.jsx";
import ModelTag from "./ModelTag.jsx";
import MailDesk from "./MailDesk.jsx";

/** Whether the desk can be here: null while checking; "desk" | "signed-out" | "off" | "away". */
export function useMailGate() {
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
  return why;
}

export default function MessagesPage() {
  const why = useMailGate();
  // the echoes: the same live echoes the Feed's rail shows (lib/feed/types.js echoRail)
  const [posts, setPosts] = useState(null);
  useEffect(() => { fetchPosts("user").then((w) => setPosts(w.posts || [])).catch(() => setPosts([])); }, []);
  const rail = echoRail(posts || []);
  return (
    <div className="wrap dmpage">
      <h1 className="idlabel">Messages</h1>
      <section className="dmechos" aria-label="echoes">
        <h2 className="dmlabel"><i aria-hidden="true">:</i>ECHOS</h2>
        {rail.length ? <EchoRail groups={rail} /> : <p className="dmnone">{posts === null ? "…" : "no live echoes from the people you follow right now."}</p>}
      </section>
      {why === "desk" && <MailDesk embedded page />}
      {why === "signed-out" && (
        <div className="dmgate">
          <p className="deck">Messages need an account.</p>
          <p className="fine">Sign in and the mail desk opens here — inbox, requests, and threads with the passengers you follow.</p>
          <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("asilum:signup-open", { detail: { mode: "signin" } }))}>SIGN IN</button>
        </div>
      )}
      {why === "off" && (
        <div className="dmgate">
          <p className="deck">Messaging is not enabled on this deployment.</p>
          <p className="fine">The mail desk exists and is off by configuration (MESSAGING_ENABLED). Nothing here is simulated. <ModelTag kind="device">CONNECTION REQUIRED</ModelTag></p>
        </div>
      )}
      {why === "away" && <p className="fine dmgate" role="status">The mail desk is not answering right now — your messages are safe; try again in a moment.</p>}
      {why === null && <p className="pempty dmgate" role="status">opening the mail desk…</p>}
    </div>
  );
}
