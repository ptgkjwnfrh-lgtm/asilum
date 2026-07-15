"use client";
// Asterisk memory surface (handoff Feature B, Phase 2; contract ADR-001 v1).
// AsteriskDrawer = the ✳ MEMORY topbar button + slide-down panel used by the
// shell on every page; MemorySections = the shared section renderer the
// drawer and /asterisk both use, so both surfaces show the SAME contract.
// All data comes from GET /api/asterisk/memory — a read facade over the
// existing stores; the only write here is section visibility (POST).

import { useEffect, useState } from "react";
import { authorizedFetch, postJSON, getUid } from "../../lib/client.js";

export function useAsteriskMemory(open) {
  const [memory, setMemory] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    let dead = false;
    (async () => {
      try {
        const res = await authorizedFetch(`/api/asterisk/memory?user=${encodeURIComponent(getUid() || "")}`);
        const data = await res.json();
        if (dead) return;
        if (!res.ok) { setErr(data.error || "memory unavailable"); return; }
        setMemory(data.memory);
      } catch {
        if (!dead) setErr("memory unavailable");
      }
    })();
    return () => { dead = true; };
  }, [open]);

  async function setHidden(hiddenSections) {
    setMemory((m) => (m ? { ...m, preferences: { hiddenSections } } : m));
    try { await postJSON("/api/asterisk/memory", { user: getUid(), hiddenSections }); } catch {}
  }
  return { memory, err, setHidden };
}

function Row({ label, children }) {
  return (
    <div className="amemrow">
      <span className="amemlbl">{label}</span>
      <span className="amemval">{children}</span>
    </div>
  );
}

export function MemorySections({ memory, setHidden, full = false }) {
  if (!memory) return null;
  const hidden = new Set(memory.preferences?.hiddenSections || []);
  const toggle = (id) => {
    const next = new Set(hidden);
    next.has(id) ? next.delete(id) : next.add(id);
    setHidden([...next]);
  };
  const Section = ({ id, title, children }) => (
    <div className="amemsec">
      <div className="amemhead">
        <b className="red">*</b> {title}
        <button className="amemhide" onClick={() => toggle(id)}>
          {hidden.has(id) ? "SHOW" : "HIDE"}
        </button>
      </div>
      {!hidden.has(id) && <div className="amembody">{children}</div>}
    </div>
  );
  const ex = memory.explicit, inf = memory.inferred, gl = memory.global, un = memory.uncertainty;
  return (
    <>
      <Section id="explicit" title="WHAT YOU TOLD US">
        <Row label="CORRECTIONS">
          {ex.corrections.length
            ? ex.corrections.slice(0, full ? 20 : 5).map((c) => (
                <em key={c.id}>{c.code}{c.brand ? ` · ${c.brand}` : ""}</em>
              ))
            : "none yet — every ✳ WHY THIS panel takes them"}
        </Row>
        <Row label="FOLLOWING">
          {ex.follows.length
            ? ex.follows.slice(0, full ? 50 : 6).map((f) => <em key={f.kind + f.target}>{f.target}</em>)
            : "no brands or people yet"}
        </Row>
        <Row label="FIT PROFILE">{ex.measurements.set ? "set — values stay in settings" : "not set"}</Row>
        <Row label="CRAVING">per-request dial — never stored</Row>
      </Section>
      <Section id="inferred" title="WHAT WE INFERRED">
        <Row label="LEANS">
          {inf.dominantAesthetics.length
            ? inf.dominantAesthetics.map((t) => <em key={t.tag}>{t.tag}</em>)
            : "no read yet"}
        </Row>
        <Row label="AVOIDS">
          {inf.avoidedTags.length ? inf.avoidedTags.map((t) => <em key={t.tag}>{t.tag}</em>) : "nothing"}
        </Row>
        {full && inf.recentlyForgotten.length > 0 && (
          <Row label="FADING">{inf.recentlyForgotten.map((t, i) => <em key={i}>{String(t.tag ?? t)}</em>)}</Row>
        )}
        <Row label="SIGNALS">{inf.signalCount} on record</Row>
        {full && inf.tasteSummary && <div className="amemnote">{inf.tasteSummary}</div>}
      </Section>
      <Section id="global" title="WHAT ASTERISK LEARNED">
        <Row label="NEW KNOWLEDGE">
          {gl.recentlyLearned.length
            ? gl.recentlyLearned.map((f, i) => (
                <em key={i}>{f.entityId} · {f.sourceCount} source{f.sourceCount === 1 ? "" : "s"}</em>
              ))
            : "nothing new since the last research batch"}
        </Row>
        <Row label="TREND REVIEW DUE">{gl.trendReviewDue}</Row>
      </Section>
      <Section id="uncertainty" title="WHERE WE'RE UNSURE">
        {un.lowSignal && <div className="amemnote">Low signal — readings stay tentative until you train more.</div>}
        {un.openQuestions.length
          ? un.openQuestions.map((q) => (
              <div className="amemrow" key={q.id}>
                <span className="amemval">{q.question}</span>
                <a className="amemgo" href={q.action}>GO</a>
              </div>
            ))
          : <div className="amemnote">No open questions.</div>}
      </Section>
    </>
  );
}

export function AsteriskDrawer() {
  const [open, setOpen] = useState(false);
  const { memory, err, setHidden } = useAsteriskMemory(open);
  return (
    <>
      <button className="tbtn" onClick={() => setOpen((o) => !o)}>
        <b className="red">*</b> MEMORY
      </button>
      {open && (
        <div className="panel adrawer">
          <div className="phead">ASTERISK MEMORY</div>
          {err && <div className="pempty">{err}</div>}
          {!err && !memory && <div className="pempty">reading…</div>}
          {memory && <MemorySections memory={memory} setHidden={setHidden} />}
          <a className="btn ghost wide" href="/asterisk" style={{ display: "block", textAlign: "center" }}>
            FULL MEMORY & CONTROLS
          </a>
        </div>
      )}
    </>
  );
}
