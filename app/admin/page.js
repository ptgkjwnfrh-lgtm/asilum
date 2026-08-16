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
// A panel may carry a `filter`: one server-side argument the operator can
// change. The value is merged into the read body, so the FILTER IS APPLIED BY
// THE SERVER, never by hiding rows the desk already fetched. A desk that
// filters client-side would lie about how much is in the queue.
const PANELS = [
  { id: "business", n: "01", title: "BOOTH APPLICATIONS", read: { area: "business" },
    note: "a passport asking to become a business. approve raises it and opens a booth; a rejection carries a note the applicant reads." },
  { id: "moderation", n: "02", title: "MODERATION QUEUE", read: { action: "moderation.list", status: "open" },
    note: "flagged transmissions and rooms, filed by the deterministic screen. resolving one is a human decision, recorded with your operator name." },
  { id: "cases", n: "03", title: "BRAND CASES", read: { action: "brand.cases.list" },
    note: "the append-only verification ledger behind every business decision. read-only here — cases move through their own enforced transitions." },
  { id: "overview", n: "04", title: "SUBSTRATE", read: { area: "overview" },
    note: "row counts straight from the database. persistent:false means this deploy is running on memory, not Postgres." },

  // ---- ASTERISK OPERATIONS -------------------------------------------------
  // The backend for all four has been complete since Day 10-15 with no way to
  // reach it — the same gap THE DESK was built to close for /api/admin, one
  // layer in. Nothing new is added to the API here; this is a client for it.
  { id: "facts", n: "05", title: "LEARNED FACTS", read: { action: "asterisk.facts", limit: 100 },
    filter: { key: "status", label: "STATUS",
      options: ["", "discovered", "pending_verification", "machine_reviewed", "human_reviewed", "approved", "rejected", "superseded", "archived"] },
    note: "the staged research ledger (ASTERISK-AI §9). a fact climbs discovered → pending → machine → human → approved, and the SERVER enforces the ladder — the desk offers every rung and reports refusals in the server's own words. approval needs at least one source and names you." },
  { id: "reconciliations", n: "06", title: "TAG RECONCILIATIONS", read: { action: "asterisk.reconciliations", limit: 50 },
    filter: { key: "reviewRequired", label: "REVIEW", options: ["", "true", "false"] },
    note: "one row per audit pass: agreement score, and every conflict with BOTH values kept. a conflict never overwrites a base tag (§7) — high-impact ones open a moderation task instead, which is panel 02." },
  { id: "unknown", n: "07", title: "UNKNOWN QUERIES", read: { action: "asterisk.unknown.list", limit: 50 },
    // These are the statuses updateUnknownQueryStatus actually writes —
    // "promoted" is NOT one of them; promotion writes `research_created`.
    filter: { key: "status", label: "STATUS", options: ["observed", "research_created", "resolved", "dismissed", "all"] },
    note: "what people asked that asterisk could not answer. this is the demand signal for research — promoting one says it is worth investigating, not that an answer exists." },
  { id: "ontology", n: "08", title: "ONTOLOGY", read: { action: "asterisk.ontology", limit: 500 },
    filter: { key: "tagType", label: "TYPE", options: ["", "aesthetic", "category", "material", "silhouette", "color", "era", "mood"] },
    note: "the canonical tag space, seeded from the LIVE vocabularies so it extends rather than forks (§6). SYNC is idempotent and additive — merges and deprecations are versioned rows, never silent renames." },
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
  // One filter value per panel, and one pending fact-transition target per
  // fact row. Both are operator intent, never server state.
  const [filters, setFilters] = useState({});
  const [factMove, setFactMove] = useState({});

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
    const current = PANELS.find((p) => p.id === panel);
    let spec = current.read;
    // The filter travels to the server as part of the read. An empty string
    // means "no constraint" and is omitted rather than sent as "", because ""
    // and absent are different arguments to the API.
    if (current.filter) {
      const raw = filters[panel] ?? current.filter.options[0];
      if (raw !== "") {
        const value = raw === "true" ? true : raw === "false" ? false : raw;
        spec = { ...spec, [current.filter.key]: value };
      }
    }
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
  }, [token, panel, call, filters]);

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

        {current.filter && (
          <div className="rkrow">
            <div className="rkname">{current.filter.label}</div>
            <div className="rkctl">
              <select
                className="wcap"
                aria-label={current.filter.label.toLowerCase() + " filter"}
                value={filters[panel] ?? current.filter.options[0]}
                onChange={(e) => setFilters({ ...filters, [panel]: e.target.value })}
              >
                {current.filter.options.map((o) => (
                  <option key={o || "any"} value={o}>{o === "" ? "ANY" : o}</option>
                ))}
              </select>
              {panel === "ontology" && (
                <button className="fitbtn" disabled={busy !== ""}
                  onClick={() => act({ action: "asterisk.ontology.sync" }, "sync")}>
                  SYNC
                </button>
              )}
            </div>
            <div className="rkdesc">the server applies this — the desk never hides rows it already fetched.</div>
          </div>
        )}

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

        {/* ---- 05 LEARNED FACTS ---- */}
        {panel === "facts" && data && (
          <>
            {(data.facts || []).length === 0 && (
              <div className="empty">no facts at that stage — the ledger is honestly empty here.</div>
            )}
            {(data.facts || []).map((f) => {
              const sources = f.sourceUrls || [];
              // Approval is refused server-side without a source. Saying so on
              // the row is kinder than letting the operator find out by
              // clicking, and it is the SAME rule, not a second one.
              const sourceless = sources.length === 0;
              return (
                <div className="rkrow deskrow" key={f.id}>
                  <div className="rkname">
                    <span className={"rkled" + (f.verificationStatus === "approved" ? " on" : "")} aria-hidden="true" />
                    {f.entityType}:{f.entityId} <em className="deskdim">#{f.id}</em>
                  </div>
                  <div className="rkctl">
                    <span className="rkmono">{f.verificationStatus}</span>
                    <select
                      className="wcap"
                      aria-label={"next status for fact " + f.id}
                      value={factMove[f.id] || ""}
                      onChange={(e) => setFactMove({ ...factMove, [f.id]: e.target.value })}
                    >
                      <option value="">move to…</option>
                      {["pending_verification", "machine_reviewed", "human_reviewed", "approved", "rejected", "superseded", "archived"]
                        .map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      className="fitbtn"
                      disabled={busy !== "" || !factMove[f.id]}
                      onClick={() => act({ action: "asterisk.fact.review", id: f.id, status: factMove[f.id] }, String(f.id))}
                    >
                      REVIEW
                    </button>
                  </div>
                  <div className="rkdesc">
                    {f.claim ? <>“{String(f.claim).slice(0, 140)}” · </> : null}
                    {f.claimType ? <>{f.claimType} · </> : null}
                    reliability {typeof f.reliabilityScore === "number" ? f.reliabilityScore.toFixed(2) : "—"}
                    {f.reviewedBy ? <> · reviewed by {f.reviewedBy}</> : null}
                    {sourceless
                      ? <> · <b>no source — approval will be refused, and reliability stays 0</b></>
                      : <> · {sources.slice(0, 3).map((u, i) => (
                          <span key={u}>
                            {i > 0 ? " · " : " "}
                            <a className="wperma" href={u} target="_blank" rel="noopener noreferrer">source {i + 1} ↗</a>
                          </span>
                        ))}{sources.length > 3 ? ` +${sources.length - 3}` : ""}</>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ---- 06 TAG RECONCILIATIONS ---- */}
        {panel === "reconciliations" && data && (
          <>
            {(data.reconciliations || []).length === 0 && (
              <div className="empty">no audit passes recorded — run one from asterisk.audit against a product id.</div>
            )}
            {(data.reconciliations || []).map((r) => {
              const conflicts = r.conflicts || [];
              return (
                <div className="rkrow deskrow" key={r.id}>
                  <div className="rkname">
                    <span className={"rkled" + (conflicts.length ? " on" : "")} aria-hidden="true" />
                    {r.productId} <em className="deskdim">#{r.id}</em>
                  </div>
                  <div className="rkctl rkmono">
                    {typeof r.agreementScore === "number" ? Math.round(r.agreementScore * 100) + "% AGREE" : "—"}
                    {r.reviewRequired ? " · REVIEW" : ""}
                  </div>
                  <div className="rkdesc">
                    {conflicts.length === 0
                      ? "no conflicts — the AI pass agreed with the base tags."
                      : conflicts.map((c, i) => (
                          <span key={c.field + i}>
                            {i > 0 ? " · " : ""}
                            {/* `base` is an ARRAY (a product can carry several
                                values for one field); `ai` is a single value.
                                Both are printed — §7 keeps both, and the desk
                                must not collapse them into one answer. */}
                            <b>{c.field}</b>: base “{(Array.isArray(c.base) ? c.base : [c.base]).join(", ") || "—"}”
                            {" vs ai “"}{String(c.ai ?? "—")}”
                            {c.aiStatus ? ` (${c.aiStatus}` : ""}
                            {typeof c.aiConfidence === "number" ? `${c.aiStatus ? " " : " ("}${c.aiConfidence.toFixed(2)}` : ""}
                            {c.aiStatus || typeof c.aiConfidence === "number" ? ")" : ""}
                          </span>
                        ))}
                    {(r.missingBaseFields || []).length ? <> · missing base: {r.missingBaseFields.join(", ")}</> : null}
                    {r.resolution ? <> · resolved “{r.resolution}”{r.resolvedBy ? ` by ${r.resolvedBy}` : ""}</> : null}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ---- 07 UNKNOWN QUERIES ---- */}
        {panel === "unknown" && data && (
          <>
            {(data.unknownQueries || []).length === 0 && (
              <div className="empty">nothing unanswered at that stage.</div>
            )}
            {(data.unknownQueries || []).map((q) => (
              <div className="rkrow deskrow" key={q.id}>
                <div className="rkname">
                  <span className={"rkled" + (q.status === "observed" ? " on" : "")} aria-hidden="true" />
                  “{q.normalizedQuery}” <em className="deskdim">#{q.id}</em>
                </div>
                <div className="rkctl">
                  <span className="rkmono">
                    {q.status}
                    {typeof q.distinctIdentities === "number" ? ` ·${q.distinctIdentities} people` : ""}
                  </span>
                  {/* PROMOTE is only legal from `observed` and only above the
                      distinct-identity threshold; the server enforces both and
                      says so. Offered unconditionally so a refusal is visible
                      rather than a button that silently is not there. */}
                  <button className="fitbtn" disabled={busy !== ""}
                    onClick={() => act({ action: "asterisk.unknown.promote", id: q.id }, String(q.id))}>
                    PROMOTE
                  </button>
                  <button className="fitbtn" disabled={busy !== ""}
                    onClick={() => act({ action: "asterisk.unknown.resolve", id: q.id }, String(q.id))}>
                    RESOLVE
                  </button>
                  <button className="fitbtn" disabled={busy !== ""}
                    onClick={() => act({ action: "asterisk.unknown.dismiss", id: q.id }, String(q.id))}>
                    DISMISS
                  </button>
                </div>
                <div className="rkdesc">
                  asked {q.demandCount ?? "—"}× by {q.distinctIdentities ?? "—"} identities
                  {q.lastMethod ? <> · last method {q.lastMethod}</> : null}
                  {q.researchEligible === false ? <> · below the research threshold</> : null}
                  {q.reviewedBy ? <> · reviewed by {q.reviewedBy}</> : null}
                  {q.researchFactId ? <> · fact {q.researchFactId}</> : null}
                  {" · "}promoting only marks it worth researching — it grants no trust and writes no knowledge.
                </div>
              </div>
            ))}
          </>
        )}

        {/* ---- 08 ONTOLOGY ---- */}
        {panel === "ontology" && data && (
          <>
            {(data.tags || []).length === 0 && (
              <div className="empty">the ontology is empty — SYNC seeds it from the live vocabularies.</div>
            )}
            {(data.tags || []).length > 0 && (
              <div className="rkrow">
                <div className="rkname">CANONICAL TAGS</div>
                <div className="rkctl rkmono">{(data.tags || []).length}</div>
                <div className="rkdesc">
                  {(data.tags || []).filter((t) => (t.aliases || []).length).length} carry aliases ·
                  {" "}{(data.tags || []).filter((t) => t.parentId).length} have a parent
                </div>
              </div>
            )}
            {(data.tags || []).slice(0, 200).map((t) => (
              <div className="rkrow" key={t.id}>
                <div className="rkname">{t.id}</div>
                <div className="rkctl rkmono">{t.tagType || "—"}{typeof t.version === "number" ? ` · v${t.version}` : ""}</div>
                <div className="rkdesc">
                  {t.label}
                  {t.parentId ? <> · parent {t.parentId}</> : null}
                  {(t.aliases || []).length ? <> · aliases: {(t.aliases || []).slice(0, 6).join(", ")}{(t.aliases || []).length > 6 ? " …" : ""}</> : null}
                  {t.description ? <> · {t.description}</> : null}
                </div>
              </div>
            ))}
            {(data.tags || []).length > 200 && (
              <div className="rkdesc">showing the first 200 of {(data.tags || []).length} — narrow with TYPE.</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
