"use client";
// Profile rooms (Feature E). Two faces of the same surface:
//   <RoomEditor />  — the owner's editor on /profile. Accounts only (ADR-002);
//                     device identities get the honest sign-in gate.
//   <PublicRoom />  — the published room on /u/[handle], themed by the
//                     registry tokens SCOPED to the room wrapper. The
//                     magazine shell never re-themes.
// Non-optimistic throughout: every write returns the server's stored room
// and that response replaces local state; failures surface as notices.

import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch, postJSON, getUid, thumbFor } from "../../lib/client.js";

function roomStyle(theme) {
  const tokens = theme?.tokens || {};
  return {
    "--room-accent": tokens.accent || "#e5342b",
    "--room-ink": tokens.ink || "#000",
    "--room-paper": tokens.paper || "#fff",
    borderStyle: tokens.rule === "double" ? "double" : "solid",
  };
}

async function roomPost(payload) {
  const res = await postJSON("/api/profile/room", { user: getUid(), ...payload });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "the room did not save");
  return body;
}

// ── Owner editor (mounted on /profile) ─────────────────────────────────────

export function RoomEditor() {
  const [view, setView] = useState(null); // full GET/POST response
  const [err, setErr] = useState("");
  const [statement, setStatement] = useState("");
  const [handleDraft, setHandleDraft] = useState("");
  const [anthemDraft, setAnthemDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);

  const adopt = useCallback((data) => {
    setView(data);
    const mod = (id) => data?.room?.modules?.find((m) => m.module === id);
    setStatement(mod("statement")?.content?.text || "");
    setHandleDraft(data?.room?.handle || "");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authorizedFetch("/api/profile/room?user=" + encodeURIComponent(getUid() || ""));
      if (res.status === 503) { if (alive.current) setView(null); return; }
      const body = await res.json();
      if (alive.current) adopt(body);
    } catch {}
  }, [adopt]);

  useEffect(() => {
    alive.current = true;
    load();
    window.addEventListener("asilum:identity", load);
    return () => { alive.current = false; window.removeEventListener("asilum:identity", load); };
  }, [load]);

  async function apply(payload) {
    if (busy) return;
    setBusy(true);
    try {
      const body = await roomPost(payload);
      if (alive.current) { adopt(body); setErr(body.note || ""); }
    } catch (error) {
      if (alive.current) setErr(error.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!view) return null; // feature off — the default profile skin, honestly

  if (view.available === false) {
    return (
      <section className="roomcard">
        <div className="psub">YOUR ROOM</div>
        <p className="deck">{view.reason}</p>
      </section>
    );
  }

  const room = view.room;
  const anthem = room?.modules?.find((m) => m.module === "soundtrack")?.content?.entities || [];
  const themes = view.themes || [];

  return (
    <section className="roomcard">
      <div className="measurehead">
        <div>
          <div className="psub">YOUR ROOM</div>
          <h2>A page of your own<span className="red">.</span></h2>
          <p className="deck">
            Claim a handle, pick a skin, say your piece. Published rooms live at /u/your-handle
            after a deterministic content screen — flagged rooms wait for a human.
          </p>
        </div>
        {room?.handle && room?.published && room?.moderationStatus === "visible" ? (
          <a className="btn ghost" href={"/u/" + encodeURIComponent(room.handle)}>VIEW LIVE →</a>
        ) : null}
      </div>

      {err ? <div className="roomerr"><b className="red">*</b> {err}</div> : null}
      {room?.moderationStatus === "under_review" ? (
        <div className="roomerr">room paused for human review — your draft is intact</div>
      ) : null}

      <div className="roomgrid">
        <div>
          <div className="psub">HANDLE</div>
          <div className="roomrow">
            <input aria-label="your handle" className="pedit small" value={handleDraft} placeholder="your-handle"
              onChange={(e) => setHandleDraft(e.target.value)} />
            <button className="fitbtn" disabled={busy || !handleDraft || handleDraft === room?.handle}
              onClick={() => apply({ op: "room.set", handle: handleDraft })}>CLAIM</button>
          </div>
          <div className="psub" style={{ marginTop: 12 }}>SKIN</div>
          <div className="roomrow roomthemes">
            {themes.map((theme) => (
              <button key={theme.id} disabled={busy}
                className={"roomswatch" + (room?.theme?.id === theme.id ? " cur" : "")}
                style={roomStyle(theme)}
                onClick={() => apply({ op: "room.set", themeId: theme.id })}>
                <b>*</b> {theme.name}
              </button>
            ))}
          </div>
          <div className="psub" style={{ marginTop: 12 }}>DOOR</div>
          <button className="fitbtn" disabled={busy || !room?.handle}
            onClick={() => apply({ op: "room.set", published: !room?.published })}>
            {room?.published ? "UNPUBLISH" : room?.handle ? "PUBLISH ROOM" : "CLAIM A HANDLE FIRST"}
          </button>
        </div>

        <div>
          <div className="psub">STATEMENT — {statement.length}/{view.statementMax}</div>
          <textarea aria-label="room bio" className="pedit small roomstatement" rows={5} value={statement}
            placeholder="plain words only — links and contact details send the room to review"
            onChange={(e) => setStatement(e.target.value)} />
          <button className="fitbtn" disabled={busy}
            onClick={() => apply({ op: "module.set", module: "statement", content: { text: statement } })}>
            SAVE STATEMENT
          </button>

          <div className="psub" style={{ marginTop: 12 }}>ROOM ANTHEM — {anthem.length}/3</div>
          <div className="roomrow">
            {anthem.map((a) => (
              <button key={a.name} className="chip clickable cur" disabled={busy}
                onClick={() => apply({ op: "module.set", module: "soundtrack",
                  content: { entities: anthem.map((x) => x.name).filter((n) => n !== a.name) } })}>
                {a.name} ×
              </button>
            ))}
          </div>
          <div className="roomrow">
            <input aria-label="add an anthem from the culture catalog" className="pedit small" list="room-anthem-choices" value={anthemDraft}
              placeholder="add from the culture catalog…"
              onChange={(e) => setAnthemDraft(e.target.value)} />
            <datalist id="room-anthem-choices">
              {(view.anthemChoices || []).map((name) => <option key={name} value={name} />)}
            </datalist>
            <button className="fitbtn" disabled={busy || !anthemDraft || anthem.length >= 3}
              onClick={() => { apply({ op: "module.set", module: "soundtrack",
                content: { entities: [...anthem.map((x) => x.name), anthemDraft] } }); setAnthemDraft(""); }}>
              ADD
            </button>
          </div>

          <div className="psub" style={{ marginTop: 12 }}>MODULES</div>
          <div className="roomhint">TOP PIECES and BRANDS stay private until you explicitly turn them on.</div>
          <div className="roomrow roommods">
            {(room?.modules || []).map((m) => (
              <button key={m.module} className={"chip clickable" + (m.visible ? " cur" : "")} disabled={busy}
                onClick={() => apply({ op: "module.set", module: m.module, visible: !m.visible })}>
                {m.title} {m.visible ? "◼" : "◻"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Public room (mounted on /u/[handle]) ───────────────────────────────────

export function PublicRoom({ room, handle }) {
  const [reported, setReported] = useState(false);
  const [note, setNote] = useState("");

  async function report() {
    try {
      await roomPost({ op: "report", handle });
      setReported(true);
      setNote("reported — a human will look");
    } catch (error) {
      setNote(error.message);
    }
  }

  const mod = (id) => room.modules.find((m) => m.module === id);
  const statement = mod("statement")?.content?.text;
  const anthem = mod("soundtrack")?.content?.entities || [];
  const pieces = mod("top-pieces")?.content?.items || [];
  const brands = mod("brands")?.content?.brands || [];

  return (
    <div className="room" style={roomStyle(room.theme)}>
      <div className="roombanner">{"* ".repeat(24)}</div>
      <div className="roomhead">
        <h1 className="roomtitle"><span className="roomstar">*</span>{room.handle.toUpperCase()}</h1>
        <span className="roomskin">{room.theme?.name || "HOUSE"} SKIN</span>
      </div>

      {statement ? (
        <>
          <div className="roomsub">STATEMENT</div>
          <p className="roomtext">{statement}</p>
        </>
      ) : null}

      {anthem.length > 0 && (
        <>
          <div className="roomsub">ROOM ANTHEM</div>
          <div className="roomrow">
            {anthem.map((a) => (
              <a key={a.name} className="roomanthem" href={"/discover?q=" + encodeURIComponent(a.name)}>
                <b>{a.name.toUpperCase()}</b>
                {a.label ? <span> — {a.label}</span> : null}
              </a>
            ))}
          </div>
        </>
      )}

      {pieces.length > 0 && (
        <>
          <div className="roomsub">TOP PIECES</div>
          <div className="roomrow roompieces">
            {pieces.map((item) => (
              <a className="roompiece" key={item.id} href={"/?item=" + encodeURIComponent(item.id)}>
                <img src={item.img || thumbFor(item)} alt={item.title} />
                <span>{item.title}</span>
              </a>
            ))}
          </div>
        </>
      )}

      {brands.length > 0 && (
        <>
          <div className="roomsub">BRANDS ON RECORD</div>
          <div className="roomrow">
            {brands.map((brand) => (
              <a key={brand} className="chip clickable" href={"/discover?q=" + encodeURIComponent(brand)}>{brand}</a>
            ))}
          </div>
        </>
      )}

      <div className="roomfoot">
        <span>rendered live from real signals — nothing here is simulated</span>
        {reported ? <em>{note}</em> : (
          <button className="roomreport" onClick={report}>REPORT ROOM</button>
        )}
        {!reported && note ? <em>{note}</em> : null}
      </div>
    </div>
  );
}
