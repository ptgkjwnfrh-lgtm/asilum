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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

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

  const loadFolder = useCallback(async (which) => {
    setItems(null); setNote("");
    try {
      const r = await fetch(
        `/api/dm?op=inbox&folder=${which}&user=` + encodeURIComponent(getUid() || ""),
        { cache: "no-store" });
      if (!r.ok) { setNote("the mail desk is unavailable right now."); setItems([]); return; }
      const data = await r.json();
      setItems(data.items || []);
    } catch {
      setNote("the mail desk is unavailable right now."); setItems([]);
    }
  }, []);

  useEffect(() => { if (open) loadFolder(folder); }, [open, folder, loadFolder]);

  const loadThread = useCallback(async (id) => {
    setThread(null); setNote("");
    try {
      const r = await fetch(`/api/dm?op=thread&c=${encodeURIComponent(id)}&user=`
        + encodeURIComponent(getUid() || ""), { cache: "no-store" });
      if (!r.ok) { setNote("that conversation could not be opened."); return; }
      const data = await r.json();
      setThread(data);
      // Mark read at the newest message we actually rendered. Monotonic on the
      // server, so a slow response cannot un-read something newer.
      const newest = data.messages?.[0]?.id;
      if (newest) {
        fetch("/api/dm", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "read", conversationId: id, upTo: newest, user: getUid() }) })
          .then(() => poll()).catch(() => {});
      }
    } catch { setNote("that conversation could not be opened."); }
  }, [poll]);

  useEffect(() => { if (threadId) loadThread(threadId); }, [threadId, loadThread]);

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
            <button className="mailback" onClick={() => { setThreadId(null); setThread(null); }}>
              ← THE MAIL DESK
            </button>
          </div>

          {note ? <p className="mailnote">{note}</p> : null}
          {thread === null ? <p className="mailnote">opening…</p> : (
            <>
              {thread.folder === "requests" ? (
                <div className="mailreq">
                  <p className="mailhint">
                    a request. accepting lets them write again; declining also
                    blocks them — you can undo that in settings.
                  </p>
                  <div className="mailacts">
                    <button className="btn" onClick={async () => {
                      if (await act("accept", { conversationId: threadId })) { await loadThread(threadId); await loadFolder("requests"); await poll(); }
                    }}>ACCEPT ✓</button>
                    <button className="btn ghost" onClick={async () => {
                      const r = await act("decline", { conversationId: threadId });
                      if (r?.ok) { setThreadId(null); await loadFolder("requests"); await poll(); }
                    }}>DECLINE + BLOCK</button>
                  </div>
                </div>
              ) : null}

              {/* Newest-first from the API; reversed here so a thread reads
                  downward the way a conversation does. */}
              <ul className="mailthread">
                {[...thread.messages].reverse().map((m) => (
                  <li key={m.id} className={m.mine ? "mine" : "theirs"}>
                    <span className="mailbody">
                      {m.redacted ? <em>this message was removed</em>
                        : m.body === null ? <em>hidden</em> : m.body}
                    </span>
                  </li>
                ))}
                {thread.messages.length === 0 ? <li className="mailnote">no messages yet.</li> : null}
              </ul>

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
                  onChange={(e) => setDraft(e.target.value)}
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

          {folder === "requests" ? (
            <p className="mailhint">
              first messages from people you have not spoken to. no preview until
              you accept — a request should not put a stranger&apos;s words in your
              list before you agreed to hear them.
            </p>
          ) : null}

          {note ? <p className="mailnote">{note}</p> : null}

          {items === null ? (
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
                  <button type="button" onClick={() => setThreadId(c.id)}>
                    <span className="mailwho">{c.otherId.slice(0, 8)}</span>
                    {c.unread ? <span className="mailcount">{c.unread}</span> : <span />}
                    <span className="mailprev">
                      {c.preview ? c.preview.slice(0, 90) : <em>no preview</em>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </>
        )}
        </div>
      ) : null}
    </div>
  );
}
