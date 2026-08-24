"use client";

// app/components/MailDesk.jsx — the mail icon in the header, on every tab,
// and the panel behind it.
//
// The owner asked for a retro "you got mail" icon. It is an envelope that
// OPENS when something is waiting, with the house asterisk as the seal — the
// 1990s mail metaphor rendered in this magazine's language rather than a
// borrowed skeuomorph.
//
// ABSENT, NOT DISABLED. When MESSAGING_ENABLED is off the API 404s and this
// renders nothing at all — no greyed icon, no "coming soon". FEATURE-FLAGS.md
// requires that, and a disabled control still advertises a feature.
//
// A read that FAILS shows a fault marker, never "0". Rendering an empty inbox
// when the desk is unreachable is a false statement to the reader's face, and
// it is the same rule the account-kind read follows.

import { useCallback, useEffect, useRef, useState } from "react";
import { useEscape, useClickAway } from "./dismiss.js";
import { getUid } from "../../lib/client.js";
// The desk's decisions live in a module because there is no DOM harness in
// this repo: a rule inside this file is a rule no test can reach. See
// lib/dm-desk.js — all three answer the same complaint from the 23 Aug
// register, STATE THAT OUTLIVES ITS CONTEXT.
import {
  composerKey, mergeFolderItems, NO_SIGNAL, pageIsCurrent, reactionsAcross,
  shouldPollActivity,
} from "../../lib/dm-desk.js";

const POLL_MS = 45000;

function Envelope({ waiting, fault }) {
  // One glyph, three states. The flap lifts when mail is waiting.
  return (
    <span className={"mailglyph" + (waiting ? " open" : "") + (fault ? " fault" : "")} aria-hidden="true">
      <svg viewBox="0 0 24 18" width="20" height="15">
        <rect x="0.75" y="0.75" width="22.5" height="16.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {waiting ? (
          <>
            <path d="M0.75 1 L12 8 L23.25 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 17 L12 11 L18 17" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </>
        ) : (
          <path d="M0.75 1 L12 10 L23.25 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        )}
      </svg>
      {waiting ? <span className="mailseal">*</span> : null}
    </span>
  );
}

export default function MailDesk() {
  const [available, setAvailable] = useState(null); // null = unknown, false = feature absent
  const [counts, setCounts] = useState({ inbox: 0, requests: 0 });
  const [fault, setFault] = useState(false);
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("inbox");
  const [items, setItems] = useState(null);
  const [note, setNote] = useState("");
  const [threadId, setThreadId] = useState(null);
  const [thread, setThread] = useState(null);
  // KEYED BY COMPOSER, not one shared string. A thread and the search box are
  // different composers, and so are two threads, so there is no ordering of
  // events that can hand one composer another's words — see lib/dm-desk.js.
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState(null);   // null = not searching
  const [peer, setPeer] = useState(NO_SIGNAL);
  const [signalsOn, setSignalsOn] = useState(true);
  const [doorOpen, setDoorOpen] = useState(true);
  // Everyone I have blocked — mostly people I DECLINED, which is a block the
  // banner has always promised was undoable. Until now there was nowhere to
  // undo it.
  const [blocks, setBlocks] = useState([]);
  const typingSentAt = useRef(0);
  const [cursor, setCursor] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [older, setOlder] = useState([]);   // pages loaded above the newest
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  // Which folder request the panel is currently willing to hear an answer to.
  const requestToken = useRef(0);
  const current = useRef({ folder: "inbox", token: 0 });
  // WHICH THREAD IS ON SCREEN, readable by a response that has been in flight
  // across a switch. `threadId` state is not enough: a fetch started before the
  // switch closes over the old value, and the merge it performs happens against
  // whatever is current when it lands.
  const openThreadRef = useRef(null);
  // The pages already scrolled into view, and the anchor each was fetched with,
  // so a refresh can rebuild them instead of throwing them away.
  const olderRef = useRef([]);

  const showThread = useCallback((id) => {
    openThreadRef.current = id;
    olderRef.current = [];
    setThreadId(id);
    setThread(null);
    setOlder([]);
    // A new thread knows nothing about the other person yet. Carrying the last
    // thread's signal here is how a quiet conversation printed "read" under a
    // message nobody had read — dm_messages.id is a GLOBAL bigserial, so a
    // readUpTo from a busy thread routinely exceeds a quiet one's newest id.
    setPeer(NO_SIGNAL);
  }, []);

  useEscape(() => setOpen(false), open);
  useClickAway(panelRef, () => setOpen(false), { active: open, excludeRef: buttonRef });

  const poll = useCallback(async () => {
    const uid = getUid();
    // Signed-out: the feature is not for this reader (ADR-002). Not a fault.
    if (!uid || !uid.startsWith("sb-")) { setAvailable(false); return; }
    try {
      const r = await fetch("/api/dm?op=summary&user=" + encodeURIComponent(uid), { cache: "no-store" });
      if (r.status === 404) { setAvailable(false); return; }   // flag off — absent
      if (r.status === 401) { setAvailable(false); return; }
      if (!r.ok) { setAvailable(true); setFault(true); return; }
      const data = await r.json();
      setAvailable(true); setFault(false);
      setCounts({ inbox: data.inbox || 0, requests: data.requests || 0 });
      if (typeof data.activitySignals === "boolean") setSignalsOn(data.activitySignals);
      if (typeof data.dmsOpen === "boolean") setDoorOpen(data.dmsOpen);
    } catch {
      setAvailable(true); setFault(true);
    }
  }, []);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_MS);
    const onIdentity = () => poll();
    window.addEventListener("asilum:identity", onIdentity);
    return () => { clearInterval(timer); window.removeEventListener("asilum:identity", onIdentity); };
  }, [poll]);

  const loadFolder = useCallback(async (which, more = "") => {
    // Every request carries a token, and only the CURRENT one may be applied.
    // Without it, a MORE ↓ page for the inbox could land after a switch to
    // REQUESTS and be appended there — accepted threads under "first messages
    // from people you have not spoken to", with the preview the store nulls
    // for requests, and the inbox cursor installed underneath them.
    const token = ++requestToken.current;
    const asked = { folder: which, token };
    current.current = asked;
    if (!more) { setItems(null); setCursor(""); }
    setNote("");
    try {
      const r = await fetch(
        `/api/dm?op=inbox&folder=${which}&cursor=${encodeURIComponent(more)}&user=`
          + encodeURIComponent(getUid() || ""), { cache: "no-store" });
      if (!pageIsCurrent(asked, current.current)) return;
      if (!r.ok) { setNote("the mail desk is unavailable right now."); setItems([]); return; }
      const data = await r.json();
      if (!pageIsCurrent(asked, current.current)) return;
      setItems((prev) => mergeFolderItems(prev, data.items, { append: Boolean(more) }));
      setCursor(data.cursor || "");
    } catch {
      if (!pageIsCurrent(asked, current.current)) return;
      setNote("the mail desk is unavailable right now."); setItems([]);
    }
  }, []);

  useEffect(() => { if (open) loadFolder(folder); }, [open, folder, loadFolder]);

  const loadBlocks = useCallback(async () => {
    try {
      const r = await fetch("/api/dm?op=blocks&user=" + encodeURIComponent(getUid() || ""),
        { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      setBlocks(data.blocks || []);
    } catch { /* the list is an undo, not a status; silence beats a false empty */ }
  }, []);

  useEffect(() => { if (open) loadBlocks(); }, [open, loadBlocks]);

  const fetchPage = useCallback(async (id, before) => {
    const r = await fetch(`/api/dm?op=thread&c=${encodeURIComponent(id)}`
      + (before ? `&before=${encodeURIComponent(before)}` : "")
      + `&user=${encodeURIComponent(getUid() || "")}`, { cache: "no-store" });
    if (!r.ok) throw new Error("thread unavailable");
    return r.json();
  }, []);

  /**
   * OPENING a thread and REFRESHING one are different acts, and conflating
   * them is what threw away paged history. This is the refresh every in-thread
   * mutation runs — send, mute, accept, react, unsend, consent — and it used to
   * null the thread (so the whole panel flashed "opening…" and the composer
   * vanished mid-typing) and empty `older` (so four pages of scrollback the
   * reader had clicked in, to re-read the thing they were replying to, were
   * gone the moment they replied).
   *
   * A refresh now re-fetches the newest page AND every page already scrolled
   * in, in parallel, and swaps them together. Keeping the old pages without
   * refetching would be worse than losing them: a mark added to a message four
   * pages up would never appear, which is the same complaint one PR over.
   */
  const loadThread = useCallback(async (id, { opening = false } = {}) => {
    if (opening) { setThread(null); setOlder([]); olderRef.current = []; }
    setNote("");
    const anchors = opening ? [] : olderRef.current.map((page) => page.before);
    try {
      const [head, ...pages] = await Promise.all([
        fetchPage(id, null),
        ...anchors.map((before) => fetchPage(id, before)),
      ]);
      // A response for a thread nobody is looking at any more is not an answer
      // to anything.
      if (openThreadRef.current !== id) return;
      setThread(head);
      if (!opening) {
        const rebuilt = pages.map((page, i) => ({
          before: anchors[i],
          messages: page.messages || [],
          reactions: page.reactions || {},
          olderBefore: page.olderBefore,
        }));
        olderRef.current = rebuilt;
        setOlder(rebuilt);
      }
      // Mark read at the newest message we actually rendered. Monotonic on the
      // server, so a slow response cannot un-read something newer.
      const newest = head.messages?.[0]?.id;
      if (newest) {
        fetch("/api/dm", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "read", conversationId: id, upTo: newest, user: getUid() }) })
          .then(() => poll()).catch(() => {});
      }
    } catch {
      if (openThreadRef.current !== id) return;
      setNote("that conversation could not be opened.");
    }
  }, [poll, fetchPage]);

  useEffect(() => { if (threadId) loadThread(threadId, { opening: true }); }, [threadId, loadThread]);

  async function act(op, extra = {}) {
    try {
      const r = await fetch("/api/dm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, user: getUid(), ...extra }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(data.message || data.error || "that did not work."); return null; }
      return data;
    } catch { setNote("that did not work."); return null; }
  }

  // Debounced so a typist does not spend the search budget one keystroke at a
  // time. Two characters minimum, matching the server — a one-character query
  // walks the alphabet in twenty-six requests.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setFound(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/dm?op=find&q=${encodeURIComponent(q)}&user=`
          + encodeURIComponent(getUid() || ""), { cache: "no-store" });
        if (!r.ok) { if (!cancelled) setFound([]); return; }
        const data = await r.json();
        if (!cancelled) setFound(data.people || []);
      } catch { if (!cancelled) setFound([]); }
    }, 260);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // Activity polling is the expensive part of this whole feature: a few
  // seconds is the only cadence at which a typing indicator means anything.
  // So it runs ONLY while a thread is open, ONLY while the tab is visible, and
  // stops the moment either stops being true. A hidden tab polling every three
  // seconds is a bill with no reader.
  useEffect(() => {
    // A REQUEST IS NOT A CONVERSATION YET. v46 made presence need an accepted
    // conversation in the trigger and in the query, so polling a knock returns
    // nulls forever — 1200 guaranteed-empty reads an hour, which is exactly
    // this caller's own activity budget. Spend it on a knock and the
    // indicators in the reader's REAL threads go quiet for the rest of the
    // hour, because a 429 is silently ignored by the tick below.
    if (!shouldPollActivity({ open, threadId, folder: thread?.folder })) return undefined;
    let cancelled = false;
    let timer = null;

    async function tick() {
      if (document.visibilityState !== "visible") return;
      const forThread = threadId;
      try {
        const r = await fetch(`/api/dm?op=activity&c=${encodeURIComponent(forThread)}&user=`
          + encodeURIComponent(getUid() || ""), { cache: "no-store" });
        // A FAILED POLL GOES QUIET RATHER THAN KEEPING THE LAST ANSWER. It used
        // to `return`, leaving whatever the previous tick — or the previous
        // THREAD — had put there, which is how a 429 or a hidden tab froze a
        // stale "read" under a message nobody had read.
        if (!r.ok) { if (!cancelled && openThreadRef.current === forThread) setPeer(NO_SIGNAL); return; }
        const data = await r.json();
        if (!cancelled && openThreadRef.current === forThread) {
          setPeer({ typing: Boolean(data.typing), readYours: Boolean(data.readYours) });
        }
      } catch {
        // A missed tick is a quiet indicator, not an error — but quiet means
        // NOTHING KNOWN, not "whatever we last knew about another thread".
        if (!cancelled && openThreadRef.current === forThread) setPeer(NO_SIGNAL);
      }
    }
    tick();
    timer = setInterval(tick, 3000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      // Leaving the thread stops the broadcast immediately rather than waiting
      // out the expiry.
      fetch("/api/dm", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "typing", on: false, conversationId: threadId, user: getUid() }) })
        .catch(() => {});
    };
  }, [open, threadId, thread?.folder]);

  /** Throttled to one ping per 2.5s: the row lives 6s, so this is enough. */
  function noteTyping() {
    if (!signalsOn || !threadId) return;
    const now = Date.now();
    if (now - typingSentAt.current < 2500) return;
    typingSentAt.current = now;
    fetch("/api/dm", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "typing", conversationId: threadId, user: getUid() }) })
      .catch(() => {});
  }

  /** Page UP through a thread. Older messages prepend; the newest page stays. */
  async function loadOlder() {
    const anchor = older.length
      ? older[0].olderBefore
      : thread?.olderBefore;
    if (!anchor || loadingMore) return;
    // The thread this page BELONGS to. Without it, a page fetched for
    // conversation A could be unshifted into `older` after the reader switched
    // to B — A's messages interleaved by id inside B's thread, A's anchor
    // driving "OLDER MESSAGES ↑", and everything typed going to B.
    const forThread = threadId;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/dm?op=thread&c=${encodeURIComponent(forThread)}`
        + `&before=${anchor}&user=` + encodeURIComponent(getUid() || ""), { cache: "no-store" });
      if (r.ok && openThreadRef.current === forThread) {
        const page = await r.json();
        if (openThreadRef.current !== forThread) return;
        // The page's REACTIONS travel with its messages. The route computes
        // them over the ids of the page it is answering, so dropping them here
        // left every message paged in from above rendering bare no matter what
        // the database held. `before` travels with them so a refresh can
        // rebuild this page instead of discarding it.
        setOlder((prev) => {
          const next = [{
            before: anchor,
            messages: page.messages || [],
            reactions: page.reactions || {},
            olderBefore: page.olderBefore,
          }, ...prev];
          olderRef.current = next;
          return next;
        });
      }
    } catch { /* leave the button; a retry is cheap */ }
    setLoadingMore(false);
  }

  async function startWith(handle) {
    const text = draft.trim();
    if (!text) { setNote("write the first message before you send it."); return; }
    setSending(true);
    const opId = "s" + Math.abs(Date.now() ^ (text.length * 2654435761)).toString(36) + handle.slice(0, 8);
    const result = await act("send", { toHandle: handle, body: text, clientOperationId: opId });
    setSending(false);
    if (result?.delivered) {
      setDraft(""); setQuery(""); setFound(null);
      showThread(result.conversationId);
      await poll();
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !threadId) return;
    setSending(true);
    // A client operation id makes a retry idempotent: the store resolves it by
    // SELECT before inserting, so a lost response cannot double-send.
    const opId = "c" + Math.abs(Date.now() ^ (text.length * 2654435761)).toString(36) + threadId.slice(0, 8);
    const result = await act("send", { conversationId: threadId, body: text, clientOperationId: opId });
    setSending(false);
    if (result?.delivered) { setDraft(""); await loadThread(threadId); await poll(); }
  }

  // The newest message I sent — a receipt is only meaningful against that.
  const myLastId = thread?.messages?.find((m) => m.mine)?.id || 0;

  // WHICH COMPOSER IS ON SCREEN. The drafts are keyed by it, so the words you
  // wrote for one addressee cannot appear in front of another. `draft` and
  // `setDraft` read and write that one key.
  const composer = composerKey({ threadId, searching: found !== null });
  const draft = drafts[composer] || "";
  const setDraft = (value) => setDrafts((prev) => ({ ...prev, [composer]: value }));

  // Every page in the thread, newest first — what a reaction lookup must span.
  const pages = thread ? [thread, ...older] : older;

  if (available !== true) return null;

  const waiting = counts.inbox + counts.requests > 0;
  const label = fault ? "messages — unavailable"
    : waiting ? `messages — ${counts.inbox + counts.requests} waiting` : "messages";

  return (
    <div className="maildesk">
      <button
        ref={buttonRef}
        className={"mailbtn" + (open ? " cur" : "")}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Envelope waiting={waiting && !fault} fault={fault} />
        <span className="mailword">MAIL</span>
        {fault ? <span className="mailfault" title="unavailable">!</span>
          : waiting ? <span className="mailcount">{counts.inbox + counts.requests}</span> : null}
      </button>

      {/* ONE panel element. Two sibling <div className="mailpanel"> branches
          made React tear down and rebuild the surface when a thread opened,
          and useClickAway then measured a detached node and closed the whole
          desk on the very click that opened the thread. The contents switch;
          the surface does not. */}
      {open ? (
        <div className="mailpanel" ref={panelRef}>
        {threadId ? (
          <>
          <div className="mailhead">
            <button className="mailback" onClick={() => showThread(null)}>
              ← THE MAIL DESK
            </button>
            {thread ? (
              <button
                className={"mailmute" + (thread.muted ? " cur" : "")}
                aria-pressed={Boolean(thread.muted)}
                title={thread.muted
                  ? "muted — messages still arrive, they just stop reaching the corner"
                  : "mute — keep receiving, stop being told"}
                onClick={async () => {
                  await act("mute", { conversationId: threadId, muted: !thread.muted });
                  await loadThread(threadId); await poll();
                }}
              >{thread.muted ? "MUTED" : "MUTE"}</button>
            ) : null}
            {/* LAW 1 NEEDS A CONTROL. The only path that ever made a block was
                DECLINE + BLOCK on a pending request, and that branch never
                renders again once a request is accepted — so harassment that
                began AFTER acceptance had no remedy but MUTE, which by design
                silences your own badge and does not stop delivery. Addressed
                by conversation: the client has never held an account uuid. */}
            {thread && thread.folder !== "requests" ? (
              <button
                className="mailblock"
                title="block — they stop reaching you, in both directions. undo it under BLOCKED."
                onClick={async () => {
                  if (await act("block", { conversationId: threadId })) {
                    showThread(null);
                    await loadBlocks(); await loadFolder(folder); await poll();
                  }
                }}
              >BLOCK</button>
            ) : null}
          </div>

          {note ? <p className="mailnote">{note}</p> : null}
          {thread === null ? <p className="mailnote">opening…</p> : (
            <>
              {thread.folder === "requests" ? (
                <div className="mailreq">
                  <p className="mailhint">
                    a request. accepting lets them write again; declining also
                    blocks them — undo that under BLOCKED, back on the desk.
                  </p>
                  <div className="mailacts">
                    <button className="btn" onClick={async () => {
                      if (await act("accept", { conversationId: threadId })) { await loadThread(threadId); await loadFolder("requests"); await poll(); }
                    }}>ACCEPT ✓</button>
                    <button className="btn ghost" onClick={async () => {
                      const r = await act("decline", { conversationId: threadId });
                      if (r?.ok) { showThread(null); await loadFolder("requests"); await poll(); }
                    }}>DECLINE + BLOCK</button>
                  </div>
                </div>
              ) : null}

              {/* Newest-first from the API; reversed here so a thread reads
                  downward the way a conversation does. */}
              {(older.length ? older[0].olderBefore : thread.olderBefore) ? (
                <button className="mailmore" onClick={loadOlder} disabled={loadingMore}>
                  {loadingMore ? "…" : "OLDER MESSAGES ↑"}
                </button>
              ) : null}

              <ul className="mailthread">
                {[...older.flatMap((page) => page.messages), ...thread.messages]
                  .slice()
                  .sort((x, y) => x.id - y.id)
                  .map((m) => (
                  <li key={m.id} className={m.mine ? "mine" : "theirs"}>
                    <div className="mailmsg">
                      <span className={"mailbody" + (m.unsent || m.redacted ? " gone" : "")}>
                        {/* Three different absences, three different words.
                            Collapsing them would tell a reader that a person
                            who withdrew their own words and a moderator who
                            removed them are the same event. */}
                        {m.unsent ? <em>unsent</em>
                          : m.redacted ? <em>removed</em>
                          : m.body === null ? <em>hidden</em> : m.body}
                      </span>

                      {reactionsAcross(pages, m.id).length ? (
                        <span className="mailreacts">
                          {reactionsAcross(pages, m.id).map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              className={"mailreact" + (r.mine ? " mine" : "")}
                              aria-label={`${r.emoji} — ${r.count}${r.mine ? ", yours" : ""}`}
                              onClick={async () => {
                                await act("react", { messageId: m.id, emoji: r.mine ? null : r.emoji });
                                await loadThread(threadId);
                              }}
                            >
                              {r.emoji}{r.count > 1 ? <span className="mailreactn">{r.count}</span> : null}
                            </button>
                          ))}
                        </span>
                      ) : null}

                      {!m.unsent && !m.redacted ? (
                        <span className="mailmsgacts">
                          {(thread.palette || []).map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              aria-label={`react ${emoji}`}
                              onClick={async () => {
                                await act("react", { messageId: m.id, emoji });
                                await loadThread(threadId);
                              }}
                            >{emoji}</button>
                          ))}
                          {m.mine ? (
                            <button
                              type="button"
                              className="mailunsend"
                              aria-label="unsend this message"
                              onClick={async () => {
                                await act("unsend", { messageId: m.id });
                                await loadThread(threadId);
                                await poll();
                              }}
                            >UNSEND</button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
                {thread.messages.length === 0 && older.length === 0 ? <li className="mailnote">no messages yet.</li> : null}
              </ul>

              {/* The receipt sits under the thread rather than on a bubble:
                  it is one fact about the conversation ("they have read what I
                  last sent"), not a property of each message.

                  The wire now answers exactly that, as a boolean. It used to
                  send a read POSITION, and the position was an oracle: signals
                  on with nothing read serialised as 0, signals off as null, so
                  one request classified the other person's global setting. The
                  false case now covers every reason at once — including the
                  ordinary one, that they simply have not read it yet. */}
              {peer.typing ? (
                <p className="mailactivity typing">typing…</p>
              ) : peer.readYours && myLastId ? (
                <p className="mailactivity">read</p>
              ) : null}

              <label className="mailconsent">
                <input
                  type="checkbox"
                  checked={thread.mediaConsent.given}
                  onChange={async (e) => {
                    if (await act("consent", { conversationId: threadId, allow: e.target.checked })) {
                      await loadThread(threadId);
                    }
                  }}
                />
                receive images and videos in this conversation
                <span className="agenote">
                  both people must tick this. attachments are not switched on yet,
                  so nothing can be sent either way — this records your answer for
                  when they are.
                </span>
              </label>

              <div className="mailcompose">
                {/* aria-label, not just a placeholder: a placeholder vanishes
                    the moment you type and is not an accessible name. The
                    a11y ratchet caught this one. */}
                <textarea
                  aria-label="write a message"
                  value={draft}
                  maxLength={2000}
                  placeholder="write…"
                  onChange={(e) => { setDraft(e.target.value); noteTyping(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                />
                <button className="btn" disabled={sending || !draft.trim()} onClick={send}>
                  {sending ? "…" : "SEND →"}
                </button>
              </div>
            </>
          )}
          </>
        ) : (
          <>
          <div className="mailhead">
            <span className="psub">THE MAIL DESK</span>
            {/* aria-label only — this codebase has no visually-hidden utility,
                so a "screen-reader" span would simply render. */}
            <label className="mailfind">
              <input
                type="search"
                aria-label="find someone by handle"
                value={query}
                placeholder="find a handle…"
                onChange={(e) => { setQuery(e.target.value); setNote(""); }}
              />
            </label>
            <div className="mailtabs" role="tablist">
              {["inbox", "requests"].map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={folder === f}
                  className={folder === f ? "cur" : ""}
                  onClick={() => setFolder(f)}
                >
                  {f.toUpperCase()}
                  {counts[f] ? <span className="mailtabn">{counts[f]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          {/* THE OTHER HALF OF LAW 2. `dms_open` was readable and writable
              through the API and had no control on any surface, so a passport
              could not shut its door. A BUSINESS may not shut its own — the
              v40 trigger refuses it — and the refusal now arrives with the
              state, so the box reverts and says why rather than drifting out
              of step with the database until the next poll. */}
          <label className="mailsignals">
            <input
              type="checkbox"
              checked={doorOpen}
              onChange={async (e) => {
                const open2 = e.target.checked;
                setDoorOpen(open2);
                const result = await act("settings", { dmsOpen: open2 });
                if (typeof result?.dmsOpen === "boolean") setDoorOpen(result.dmsOpen);
                else if (!result) setDoorOpen(!open2);
              }}
            />
            let people write to me
            <span className="agenote">
              with this off, a stranger cannot start a conversation. threads you
              already accepted keep working.
            </span>
          </label>

          <label className="mailsignals">
            <input
              type="checkbox"
              checked={signalsOn}
              onChange={async (e) => {
                const on = e.target.checked;
                setSignalsOn(on);
                if (!await act("settings", { activitySignals: on })) setSignalsOn(!on);
              }}
            />
            show when I have read a message, and when I am typing
            <span className="agenote">
              reciprocal: with this off you will not see anyone else&apos;s either.
              it stops you sending those signals — it cannot hide from someone
              you are already talking to that you stopped.
            </span>
          </label>

          {blocks.length ? (
            <div className="mailblocks">
              <div className="psub">BLOCKED · {blocks.length}</div>
              <p className="mailhint">
                declining a request blocks whoever sent it. this is that list, and
                this is the undo — unblocking lets them knock once again.
              </p>
              <ul className="maillist">
                {blocks.map((b) => (
                  <li key={b.conversationId || b.handle}>
                    <button
                      type="button"
                      onClick={async () => {
                        // By conversation where there is one, by handle
                        // otherwise. Never by account id: the client has never
                        // held one, and that is the point.
                        const naming = b.conversationId
                          ? { conversationId: b.conversationId }
                          : { handle: b.handle };
                        if (await act("unblock", naming)) {
                          await loadBlocks(); await loadFolder(folder); await poll();
                        }
                      }}
                    >
                      <span className="mailwho">
                        {/* Someone can knock without ever publishing a room, so
                            a handle is not guaranteed — and a blank line would
                            read as a bug rather than as a person. */}
                        {b.handle || "an account with no public room"}
                      </span>
                      <span className="mailkind">
                        {b.source === "decline" ? "DECLINED" : "BLOCKED"}
                      </span>
                      <span className="mailprev">unblock →</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {folder === "requests" ? (
            <p className="mailhint">
              first messages from people you have not spoken to. no preview until
              you accept — a request should not put a stranger&apos;s words in your
              list before you agreed to hear them.
            </p>
          ) : null}

          {note ? <p className="mailnote">{note}</p> : null}

          {found !== null ? (
            <div className="mailfound">
              {found.length === 0 ? (
                <p className="mailnote">
                  nobody by that handle. only people who have published a
                  profile room can be found here.
                </p>
              ) : (
                <>
                  <ul className="maillist">
                    {found.map((person) => (
                      <li key={person.handle}>
                        <button type="button" onClick={() => startWith(person.handle)} disabled={sending}>
                          <span className="mailwho">{person.handle}</span>
                          {person.kind === "business" ? <span className="mailkind">STOREFRONT</span> : <span />}
                          <span className="mailprev">
                            write the first message below, then choose them.
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mailcompose">
                    <textarea
                      aria-label="your first message"
                      value={draft}
                      maxLength={2000}
                      placeholder="your first message…"
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  </div>
                  <p className="mailnote">
                    one message until they reply — that is the whole of a first
                    contact here.
                  </p>
                </>
              )}
            </div>
          ) : items === null ? (
            <p className="mailnote">reading…</p>
          ) : items.length === 0 ? (
            <p className="mailnote">
              {folder === "requests" ? "no requests." : "no messages yet."}
            </p>
          ) : (
            <ul className="maillist">
              {items.map((c) => (
                <li key={c.id} className={c.unread ? "unread" : ""}>
                  {/* A BUTTON, not a link to /messages/<id>. Two reasons: that
                      route does not exist, and asilum-ui rule 1 allows exactly
                      seven destinations — a mail thread is not one of them.
                      The thread opens inside this panel instead, which is also
                      where a reader expects it.

                      Order matters: the count is the SECOND child so it lands
                      in row 1's `auto` column beside the name. Placed after
                      the preview it wrapped to its own row and stretched full
                      width, reading as a bar rather than a badge. */}
                  <button type="button" onClick={() => showThread(c.id)}>
                    <span className="mailwho">
                      {c.handle || "someone"}
                      {c.muted ? <span className="mailmutedot" title="muted">·MUTED</span> : null}
                    </span>
                    {c.unread ? <span className="mailcount">{c.unread}</span> : <span />}
                    <span className="mailprev">
                      {c.preview ? c.preview.slice(0, 90) : <em>no preview</em>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {cursor && found === null ? (
            <button className="mailmore" disabled={loadingMore}
              onClick={async () => { setLoadingMore(true); await loadFolder(folder, cursor); setLoadingMore(false); }}>
              {loadingMore ? "…" : "MORE ↓"}
            </button>
          ) : null}
          </>
        )}
        </div>
      ) : null}
    </div>
  );
}
