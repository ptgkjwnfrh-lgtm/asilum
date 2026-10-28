"use client";

// app/components/DmLive.jsx — THE MESSAGE BANNER (owner, 27 Oct 2026: "the
// direct message button should up the direct message tab, if a user gets a
// direct message while on the app they will get a pop up message at the top
// like a regualr ios message and if clicked the keyboard will spawn and they
// can quickly reply. however if double clicked it will take users to the
// direct message tab").
//
// While the app is on screen it reads page one of the inbox and of requests
// every LIVE_POLL_MS (lib/dm-desk.js — the same visible-only cadence as the
// desk's own badge). A conversation that moved, is unread and is not muted
// is news (incomingSince): a glass banner drops from the top with who and
// the start of what they wrote, and slides away after BANNER_MS unless it
// is touched. Swipe it up, or ×, to send it away.
//   ONE TAP: the reply field opens and takes the focus IN THAT SAME TAP —
//   a phone raises its keyboard only for a focus inside the gesture, so the
//   field is always there (folded), never mounted after. Enter sends through
//   the DM API's own send (its rules, its refusals, an idempotent operation
//   id), then the conversation is marked read up to the reply.
//   A DOUBLE TAP: the DM tab, on that conversation (lib/dm-desk.js askDesk;
//   the desk takes it — MailDesk.jsx).
// A message REQUEST shows no words (the store hides a stranger's words until
// they are accepted) and no reply: any tap opens the DM tab on REQUESTS.
//
// Nothing here is simulated. With MESSAGING_ENABLED off, signed out, or no
// store, the reads answer 404 / 401 / 503 and there is no banner, ever; the
// MESSAGES key still opens the DM tab, which says which. No banner while the
// DM tab itself is on screen (the desk shows the message there).
//
// It also holds what the MESSAGES key wears — how many conversations wait —
// and answers a storefront's asilum:dm-open by opening the DM tab on that
// person.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getUid, authorizedFetch } from "../../lib/client.js";
import { startSummaryPolling, incomingSince, tapIntent, askDesk, LIVE_POLL_MS, BANNER_MS } from "../../lib/dm-desk.js";
import { bodyRefusal } from "../../lib/dm.js";
import { getDock, openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";
import Icon from "./Icons.jsx";

// what the deck's MESSAGES key reads: is messaging here, how many wait
let live = Object.freeze({ available: null, waiting: 0 });
const subs = new Set();
function setLive(patch) {
  const next = { ...live, ...patch };
  if (next.available === live.available && next.waiting === live.waiting) return;
  live = Object.freeze(next);
  for (const fn of subs) fn();
}
export function useDmLive() {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => live, () => live);
}

/** Open the DM tab, on a conversation, a person or a folder when asked. */
export function openDesk(what = null) {
  if (what) askDesk(what);
  openSheet("messages");
}

const deskOnScreen = () => { const d = getDock(); return !!(d.sheet && d.sheet.id === "messages"); };

export default function DmLive() {
  const [banner, setBanner] = useState(null);   // { id, handle, preview, request }
  const [mode, setMode] = useState("peek");     // peek | reply | sent
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const seen = useRef({ inbox: null, requests: null });
  const modeRef = useRef("peek");
  const lastTap = useRef(-Infinity);
  const hideTimer = useRef(0);
  const swipe = useRef(null);
  const fieldRef = useRef(null);
  modeRef.current = mode;

  function hide() {
    clearTimeout(hideTimer.current);
    setBanner(null); setMode("peek"); setDraft(""); setNote(""); setSending(false);
    lastTap.current = -Infinity;
    if (fieldRef.current && document.activeElement === fieldRef.current) fieldRef.current.blur();
  }
  function hideLater(ms = BANNER_MS) {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, ms);
  }

  // the reads: page one of the inbox and of requests, while on screen
  useEffect(() => {
    const read = (uid, folder) => authorizedFetch(`/api/dm?op=inbox&folder=${folder}&user=${encodeURIComponent(uid)}`, { cache: "no-store" });
    async function poll() {
      const uid = getUid();
      if (!uid || !uid.startsWith("sb-")) { setLive({ available: false, waiting: 0 }); return; }
      try {
        const [ri, rr] = await Promise.all([read(uid, "inbox"), read(uid, "requests")]);
        if (ri.status === 404 || ri.status === 401) { setLive({ available: false, waiting: 0 }); return; }
        if (!ri.ok) { setLive({ available: true }); return; } // the store is away: no news, no fiction
        const inbox = (await ri.json()).items || [];
        const requests = rr.ok ? ((await rr.json()).items || []) : [];
        const a = incomingSince(seen.current.inbox, inbox, "inbox");
        const b = rr.ok ? incomingSince(seen.current.requests, requests, "requests") : { seen: seen.current.requests, incoming: [] };
        seen.current = { inbox: a.seen, requests: b.seen };
        setLive({ available: true, waiting: [...inbox, ...requests].filter((r) => r.unread > 0 && !r.muted).length });
        const news = [...a.incoming, ...b.incoming].sort((x, y) => y.at - x.at)[0];
        // never over the desk itself, never over a reply being written
        if (news && !deskOnScreen() && modeRef.current === "peek") {
          setBanner(news); setMode("peek"); setDraft(""); setNote("");
          haptic("tick");
          hideLater();
        }
      } catch { /* the network: the next look will tell */ }
    }
    return startSummaryPolling(poll, { intervalMs: LIVE_POLL_MS });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // a storefront's MESSAGE key: the DM tab, on that person
  useEffect(() => {
    function onOpen(event) { openDesk({ handle: event?.detail?.handle || "" }); }
    window.addEventListener("asilum:dm-open", onOpen);
    return () => window.removeEventListener("asilum:dm-open", onOpen);
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!banner) return null;
  const who = banner.handle || "a passenger";

  function tap() {
    const now = performance.now();
    const intent = tapIntent(lastTap.current, now);
    lastTap.current = now;
    if (intent === "double" || banner.request) {
      const what = banner.request ? { folder: "requests" } : { thread: banner.id };
      haptic("press");
      hide();
      openDesk(what);
      return;
    }
    // one tap: the field takes the focus now, inside the tap, so the keyboard rises
    if (fieldRef.current) fieldRef.current.focus({ preventScroll: true });
    clearTimeout(hideTimer.current);
    setMode("reply");
  }

  async function reply(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    const tooLong = bodyRefusal(text);
    if (tooLong) { setNote(tooLong.message); return; }
    setSending(true); setNote("");
    // an operation id makes a retry idempotent (the store resolves it before inserting)
    const opId = "q" + Math.abs(Date.now() ^ (text.length * 2654435761)).toString(36) + String(banner.id).slice(0, 8);
    try {
      const r = await authorizedFetch("/api/dm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "send", user: getUid(), conversationId: banner.id, body: text, clientOperationId: opId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.delivered) { setNote(data.message || data.error || "that did not send."); setSending(false); return; }
      if (data.id) {
        authorizedFetch("/api/dm", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "read", user: getUid(), conversationId: banner.id, upTo: data.id }),
        }).catch(() => {});
      }
      setSending(false); setMode("sent"); haptic("confirm");
      if (fieldRef.current) fieldRef.current.blur();
      hideLater(1400);
    } catch {
      setNote("that did not send."); setSending(false);
    }
  }

  return (
    <div
      className="dmbanner"
      data-mode={mode}
      role="region"
      aria-label={"message from " + who}
      onPointerDown={(e) => { swipe.current = { y: e.clientY }; }}
      onPointerUp={(e) => { const s = swipe.current; swipe.current = null; if (s && e.clientY - s.y < -28) hide(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); hide(); } }}
    >
      <button
        type="button"
        className="dmbtap"
        onClick={tap}
        aria-label={banner.request ? `message request from ${who} — open the requests` : `message from ${who}: ${banner.preview || ""} — tap to reply, double tap to open the conversation`}
      >
        <span className="dmbface" aria-hidden="true">{(banner.handle || "?").slice(0, 1).toUpperCase()}</span>
        <span className="dmbtext">
          <span className="dmbwho"><b>{who}</b><small>{banner.request ? "MESSAGE REQUEST" : "now"}</small></span>
          <span className="dmbwords" aria-live="polite">{banner.request ? "wants to message you — tap to see the request" : mode === "sent" ? "sent ✓" : (banner.preview || "a new message")}</span>
        </span>
      </button>
      <button type="button" className="dmbx" onClick={hide} aria-label="dismiss the message"><Icon name="close" size={16} /></button>
      {banner.request ? null : (
        <form className="dmbreply" onSubmit={reply} data-open={mode === "reply" ? "1" : undefined}>
          <input
            ref={fieldRef}
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            placeholder={"reply to " + who}
            aria-label={"reply to " + who}
            value={draft}
            tabIndex={mode === "reply" ? 0 : -1}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => { clearTimeout(hideTimer.current); if (modeRef.current === "peek") setMode("reply"); }}
          />
          <button type="submit" className="dmbsend" disabled={!draft.trim() || sending} tabIndex={mode === "reply" ? 0 : -1}>{sending ? "…" : "SEND ↗"}</button>
        </form>
      )}
      {note ? <p className="dmbnote" role="alert">{note}</p> : null}
    </div>
  );
}
