"use client";

// app/admin/page.js — THE DESK (owner directive, HANDOVER-2026-08-14
// backlog 4). The operator surface for /api/admin, which has been
// complete for weeks with no way to reach it: business applications
// waited on a human decision that could only be made with curl.
//
// GATE: the operator pastes ADMIN_TOKEN here and it is held in
// sessionStorage — never localStorage, never a cookie, never the URL.
// It dies with the tab, and LOCK DESK clears it now. Every request
// sends it as "Authorization: Bearer <token>"; the server decides,
// exactly as it did before this page existed. Nothing about the
// permission model changes — this is a client for it.
//
// The rack aesthetic (settings, owner order Aug 12) carries here: the
// desk is instrument panels, numbered, with engraved labels and real
// LEDs. Every value printed is server truth; nothing is stubbed.

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "asilum-admin-token";

// The desk's panels. `load` describes how each reads itself — the admin
// API splits reads between GET ?area= and POST { action } (history, not
// design), so the panel says which it uses and the fetchers below stay
// dumb.
const PANELS = [
  { id: "business", n: "01", title: "BOOTH APPLICATIONS", read: { area: "business" },
    note: "a passport asking to become a business. approve raises it and opens a booth; a rejection carries a note the applicant reads." },
  { id: "moderation", n: "02", title: "MODERATION QUEUE", read: { action: "moderation.list", status: "open" },
    note: "flagged transmissions and rooms, filed by the deterministic screen. resolving one is a human decision, recorded with your operator name." },
  { id: "cases", n: "03", title: "BRAND CASES", read: { action: "brand.cases.list" },
    note: "the append-only verification ledger behind every business decision. read-only here — cases move through their own enforced transitions." },
  { id: "overview", n: "04", title: "SUBSTRATE", read: { area: "overview" },
    note: "row counts straight from the database. persistent:false means this deploy is running on memory, not Postgres." },
];

export default function AdminDeskPage() {
  const [token, setToken] = useState("");
  const [entry, setEntry] = useState("");
  const [panel, setPanel] = useState("business");
  const [data, setData] = useState(null);      // null = loading, false = failed
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  // Rejections require a note (the API enforces it — the applicant reads
  // it), so the desk keeps one draft per application.
  const [notes, setNotes] = useState({});

  useEffect(() => {
    try { setToken(window.sessionStorage.getItem(TOKEN_KEY) || ""); } catch {}
  }, []);

  const call = useCallback(async (body) => {
    const init = body
      ? { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) }
      : { headers: { Authorization: "Bearer " + token } };
    return init;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    const spec = PANELS.find((p) => p.id === panel).read;
    setData(null);
    try {
      const res = spec.area
        ? await fetch("/api/admin?area=" + encodeURIComponent(spec.area), await call(null))
        : await fetch("/api/admin", await call(spec));
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // The server's own words. 503 means ADMIN_TOKEN is unset on this
        // deploy; 401 means the pasted token is wrong. Both are the
        // operator's problem to fix, so both are said plainly.
        setNote((body && body.error) || "the desk could not read that panel");
        setData(false);
        if (res.status === 401) lock();
        return;
      }
      setNote("");
      setData(body);
    } catch {
      setNote("the desk could not reach the server");
      setData(false);
    }
  }, [token, panel, call]);

  useEffect(() => { load(); }, [load]);

  function unlock() {
    const value = entry.trim();
    if (!value) return;
    try { window.sessionStorage.setItem(TOKEN_KEY, value); } catch {}
    setToken(value);
    setEntry("");
  }

  function lock() {
    try { window.sessionStorage.removeItem(TOKEN_KEY); } catch {}
    setToken("");
    setData(null);
  }

  async function act(body, label) {
    setBusy(label);
    try {
      const res = await fetch("/api/admin", await call(body));
      const out = await res.json().catch(() => null);
      setNote(res.ok ? "" : ((out && out.error) || "that action failed"));
      if (res.ok) await load();
    } catch {
      setNote("the desk could not reach the server");
    } finally {
      setBusy("");
    }
  }

  if (!token) {
    return (
      <div className="wrap rkr">
        <h1 className="headline"><span className="red">*</span>THE DESK</h1>
        <p className="deck">operator surface. the token is held for this tab only — it is never saved to this device.</p>
        <section className="rkmod" aria-label="unlock">
          <div className="rkhead"><b>00</b> LOCKED <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
          <div className="rkrow">
            <div className="rkname">ADMIN TOKEN</div>
            <div className="rkctl">
              <input
                className="wcap adminkey"
                type="password"
                autoComplete="off"
                placeholder="paste ADMIN_TOKEN"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
              />
              <button className="fitbtn" onClick={unlock} disabled={!entry.trim()}>UNLOCK</button>
            </div>
            <div className="rkdesc">
              set on the server as ADMIN_TOKEN (16+ characters). if it is unset
              there, the desk stays dark and every panel says so — nothing here
              works without the server agreeing.
            </div>
          </div>
        </section>
        {note && <div className="pempty">{note}</div>}
      </div>
    );
  }

  const current = PANELS.find((p) => p.id === panel);

  return (
    <div className="wrap rkr">
      <h1 className="headline"><span className="red">*</span>THE DESK</h1>
      <p className="deck">{current.note}</p>

      <div className="desknav">
        {PANELS.map((p) => (
          <button
            key={p.id}
            className={"fmode" + (panel === p.id ? " cur" : "")}
            onClick={() => setPanel(p.id)}
          >
            {p.title}
          </button>
        ))}
        <button className="wctl warn deskout" onClick={lock}>LOCK DESK</button>
      </div>

      {note && <div className="pempty">{note}</div>}

      <section className="rkmod" aria-label={current.title}>
        <div className="rkhead"><b>{current.n}</b> {current.title} <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>

        {data === null && <div className="empty">reading…</div>}
        {data === false && <div className="empty">this panel could not be read.</div>}

        {/* ---- 01 BOOTH APPLICATIONS ---- */}
        {panel === "business" && data && (
          <>
            {(data.applications || []).length === 0 && (
              <div className="empty">no applications waiting — the queue is honestly empty.</div>
            )}
            {(data.applications || []).map((a) => (
              <div className="rkrow deskrow" key={a.accountId}>
                <div className="rkname">{a.brandName}</div>
                <div className="rkctl">
                  <input
                    className="wcap decknote"
                    type="text"
                    maxLength={500}
                    placeholder="note (required to reject)"
                    value={notes[a.accountId] || ""}
                    onChange={(e) => setNotes({ ...notes, [a.accountId]: e.target.value })}
                  />
                  <button
                    className="fitbtn"
                    disabled={busy !== ""}
                    onClick={() => act({ action: "business.approve", accountId: a.accountId, note: notes[a.accountId] || undefined }, a.accountId)}
                  >
                    APPROVE
                  </button>
                  <button
                    className="fitbtn"
                    disabled={busy !== "" || !(notes[a.accountId] || "").trim()}
                    onClick={() => act({ action: "business.reject", accountId: a.accountId, note: notes[a.accountId] }, a.accountId)}
                  >
                    REJECT
                  </button>
                </div>
                <div className="rkdesc">
                  <a className="wperma" href={a.websiteUrl} target="_blank" rel="noopener noreferrer">{a.websiteUrl} ↗</a>
                  {" · "}
                  <a className="wperma" href={"https://" + a.shopifyDomain} target="_blank" rel="noopener noreferrer">{a.shopifyDomain} ↗</a>
                  {a.statement ? <> · “{a.statement}”</> : null}
                  {a.caseId ? <> · case {a.caseId}</> : null}
                </div>
              </div>
            ))}
            <div className="rkrow">
              <div className="rkname">VERIFIED ROSTER</div>
              <div className="rkctl rkmono">{(data.verified || []).length} / 10 BOOTHS HELD</div>
              <div className="rkdesc">
                {(data.verified || []).length === 0
                  ? "every booth is open — no brand has been verified yet."
                  : (data.verified || []).map((v) => v.brandName).join(" · ")}
              </div>
            </div>
          </>
        )}

        {/* ---- 02 MODERATION QUEUE ---- */}
        {panel === "moderation" && data && (
          <>
            {(data.tasks || []).length === 0 && (
              <div className="empty">nothing flagged is waiting.</div>
            )}
            {(data.tasks || []).map((t) => (
              <div className="rkrow deskrow" key={t.id}>
                <div className="rkname">
                  <span className={"rkled" + (t.priority === "high" ? " on" : "")} aria-hidden="true" />
                  {t.kind} <em className="deskdim">#{t.id}</em>
                </div>
                <div className="rkctl">
                  <button className="fitbtn" disabled={busy !== ""}
                    onClick={() => act({ action: "moderation.resolve", id: t.id, status: "resolved", resolution: "reviewed at the desk" }, String(t.id))}>
                    RESOLVE
                  </button>
                  <button className="fitbtn" disabled={busy !== ""}
                    onClick={() => act({ action: "moderation.resolve", id: t.id, status: "dismissed", resolution: "dismissed at the desk" }, String(t.id))}>
                    DISMISS
                  </button>
                </div>
                <div className="rkdesc">
                  {t.subjectType} {t.subjectId}
                  {t.payload?.excerpt ? <> · “{t.payload.excerpt}”</> : null}
                  {Array.isArray(t.payload?.flags) && t.payload.flags.length
                    ? <> · flags: {t.payload.flags.join(", ")}</> : null}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ---- 03 BRAND CASES ---- */}
        {panel === "cases" && data && (
          <>
            {(data.cases || []).length === 0 && <div className="empty">no cases on the ledger yet.</div>}
            {(data.cases || []).map((c) => (
              <div className="rkrow deskrow" key={c.id}>
                <div className="rkname">{c.brandName || c.subjectId}</div>
                <div className="rkctl rkmono">{c.status}</div>
                <div className="rkdesc">{c.kind} · {c.id}{c.decidedBy ? <> · decided by {c.decidedBy}</> : null}</div>
              </div>
            ))}
          </>
        )}

        {/* ---- 04 SUBSTRATE ---- */}
        {panel === "overview" && data && (
          <>
            <div className="rkrow">
              <div className="rkname">
                <span className={"rkled" + (data.counts?.persistent ? " on" : "")} aria-hidden="true" />
                STORAGE
              </div>
              <div className="rkctl rkmono">{data.counts?.persistent ? "POSTGRES" : "MEMORY"}</div>
              <div className="rkdesc">
                {data.counts?.persistent
                  ? "reads and writes are landing in the database."
                  : "this deploy is running on memory — every row here dies with the process, and the table counts below stay empty."}
              </div>
            </div>
            {Object.entries(data.counts || {})
              .filter(([key, value]) => key !== "persistent" && typeof value === "number")
              .map(([table, n]) => (
                <div className="rkrow" key={table}>
                  <div className="rkname">{table}</div>
                  <div className="rkctl rkmono">{n.toLocaleString()}</div>
                </div>
              ))}
            {/* The gated sources, in their own words. This is the honest
                answer to "are we live yet?" — each row names the exact
                environment it is waiting on, and nothing here pretends. */}
            {(data.adapters || []).map((a) => (
              <div className="rkrow" key={a.source}>
                <div className="rkname">
                  <span className={"rkled" + (a.enabled ? " on" : "")} aria-hidden="true" />
                  {a.source}
                </div>
                <div className="rkctl rkmono">{a.status}</div>
                <div className="rkdesc">{a.enabled ? "live" : "needs: " + a.needs}</div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
