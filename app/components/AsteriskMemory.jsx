"use client";
// Asterisk memory surface (contract ADR-001 v2).
// AsteriskDrawer = the guide button + slide-down panel used by the
// shell on every page; MemorySections = the shared section renderer the
// drawer and /asterisk both use, so both surfaces show the SAME contract.
// All data comes from GET /api/asterisk/memory — a read facade over the
// existing stores; writes are display visibility and Asterisk guidance.

import { useCallback, useEffect, useRef, useState } from "react";
import { useClickAway, useEscape } from "./dismiss.js";
import {
  authorizedFetch, postJSON, getUid, brainEnabled, setBrainEnabled,
} from "../../lib/client.js";

export function useAsteriskMemory(open) {
  const [memory, setMemory] = useState(null);
  const [err, setErr] = useState("");
  const [revision, setRevision] = useState(0);
  const saving = useRef(false);

  const reload = useCallback(() => {
    setMemory(null);
    setErr("");
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const identityChanged = () => {
      reload();
    };
    window.addEventListener("asilum:identity", identityChanged);
    return () => window.removeEventListener("asilum:identity", identityChanged);
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    (async () => {
      try {
        setErr("");
        const res = await authorizedFetch(`/api/asterisk/memory?user=${encodeURIComponent(getUid() || "")}`);
        const data = await res.json();
        if (dead) return;
        if (!res.ok) { setErr(data.error || "memory unavailable"); return; }
        setMemory(data.memory);
        const serverGuidance = data.memory?.preferences?.guidanceEnabled !== false;
        if (brainEnabled() !== serverGuidance) setBrainEnabled(serverGuidance);
      } catch {
        if (!dead) setErr("memory unavailable");
      }
    })();
    return () => { dead = true; };
  }, [open, revision]);

  async function setHidden(hiddenSections) {
    if (saving.current) return;
    saving.current = true;
    try {
      const res = await postJSON("/api/asterisk/memory", { user: getUid(), hiddenSections });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "could not save memory display settings");
      setMemory((current) => current
        ? { ...current, preferences: data.preferences }
        : current);
      setErr("");
    } catch (error) {
      setErr(error.message || "could not save memory display settings");
    } finally {
      saving.current = false;
    }
  }

  async function setGuidanceEnabled(guidanceEnabled) {
    if (saving.current || typeof guidanceEnabled !== "boolean") return false;
    saving.current = true;
    try {
      const res = await postJSON("/api/asterisk/memory", {
        user: getUid(), guidanceEnabled,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "could not update Asterisk guidance");
      setMemory((current) => current
        ? { ...current, preferences: data.preferences }
        : current);
      setBrainEnabled(data.preferences.guidanceEnabled !== false);
      setErr("");
      return true;
    } catch (error) {
      setErr(error.message || "could not update Asterisk guidance");
      return false;
    } finally {
      saving.current = false;
    }
  }
  return { memory, err, setHidden, setGuidanceEnabled, reload };
}

// Small, reusable version of the same durable guidance control. Search uses
// this directly so changing routes never requires a trip to the control room.
export function AsteriskGuidanceToggle({ compact = false, className = "" }) {
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => setOn(brainEnabled());
    sync();
    window.addEventListener("asilum:brain", sync);
    return () => window.removeEventListener("asilum:brain", sync);
  }, []);

  async function toggle() {
    if (saving) return;
    const next = !on;
    setSaving(true);
    setError("");
    try {
      const res = await postJSON("/api/asterisk/memory", {
        user: getUid(), guidanceEnabled: next,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "could not update Asterisk guidance");
      setBrainEnabled(data.preferences?.guidanceEnabled !== false);
    } catch (cause) {
      setError(cause.message || "could not update Asterisk guidance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className={`${className}${on ? " active" : ""}`.trim()}
      aria-label={`Turn Asterisk guidance ${on ? "off" : "on"}`}
      aria-pressed={on}
      disabled={saving}
      title={error || (on
        ? "Pause Passport-aware ranking"
        : "Turn on Passport-aware ranking")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={toggle}
    >
      {compact ? "" : "ASTERISK — "}{saving ? "…" : on ? "PAUSE" : "TURN ON"}
    </button>
  );
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
      <Section id="explicit" title="PASSPORT STAMPS">
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
        <Row label="FIT PROFILE">{ex.measurements.set ? "set — values stay in profile" : "not set"}</Row>
        <Row label="CRAVING">per-request dial — never stored</Row>
      </Section>
      <Section id="inferred" title="YOUR STYLE ROUTE">
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
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);
  // One dismissal contract (synergy phase 1): Escape + click-away close.
  useEscape(() => setOpen(false), open);
  useClickAway(drawerRef, () => setOpen(false), { active: open, excludeRef: triggerRef });
  const [guideMirror, setGuideMirror] = useState(true);
  const { memory, err, setHidden, setGuidanceEnabled } = useAsteriskMemory(open);

  // The shell needs only one boolean until the drawer opens. Keep ordinary
  // page loads cheap; the full multi-store Passport read is lazy.
  useEffect(() => {
    let dead = false;
    const syncLocal = () => setGuideMirror(brainEnabled());
    const syncServer = async () => {
      try {
        const res = await authorizedFetch(
          `/api/asterisk/memory?view=preferences&user=${encodeURIComponent(getUid() || "")}`
        );
        const data = await res.json();
        if (dead || !res.ok) return;
        setBrainEnabled(data.preferences?.guidanceEnabled !== false);
      } catch {}
    };
    syncLocal();
    syncServer();
    window.addEventListener("asilum:brain", syncLocal);
    window.addEventListener("asilum:identity", syncServer);
    return () => {
      dead = true;
      window.removeEventListener("asilum:brain", syncLocal);
      window.removeEventListener("asilum:identity", syncServer);
    };
  }, []);

  const guidanceOn = memory
    ? memory.preferences?.guidanceEnabled !== false
    : guideMirror;
  const leans = memory?.inferred?.dominantAesthetics?.slice(0, 3) || [];
  return (
    <>
      <button
        ref={triggerRef}
        className="asterisk-trigger"
        aria-label="Asterisk guide"
        aria-expanded={open}
        aria-controls="asterisk-memory-drawer"
        onClick={() => setOpen((o) => !o)}
      >
        <b className="asterisk-glyph" aria-hidden="true">*</b>
        <span>ASTERISK GUIDE</span>
        <em className={"asterisk-state " + (guidanceOn ? "on" : "off")}>
          {guidanceOn ? "GUIDING" : "PAUSED"}
        </em>
      </button>
      {open && (
        <div ref={drawerRef} className="panel adrawer" id="asterisk-memory-drawer" role="dialog" aria-label="Asterisk guide">
          <div className="phead">ASTERISK — YOUR TRAVEL AGENT</div>
          <div className="aguideintro">
            Your Passport teaches Asterisk the route. Search sets the destination;
            Asterisk orders the racks so the trip still feels like you.
          </div>
          <div className={"aguideswitch " + (guidanceOn ? "on" : "off")}>
            <div>
              <b>{guidanceOn ? "GUIDANCE ON" : "GUIDANCE PAUSED"}</b>
              <span>
                {guidanceOn
                  ? "Passport taste is shaping Home, Search, Discover, and Stylist."
                  : "Those surfaces are general. Your Passport stays saved."}
              </span>
            </div>
            <button
              className="fitbtn"
              aria-pressed={guidanceOn}
              onClick={() => setGuidanceEnabled(!guidanceOn)}
            >
              {guidanceOn ? "PAUSE" : "TURN ON"}
            </button>
          </div>
          <div className="aroute">
            <a href="/board"><b>1</b><span>PASSPORT<em>show your taste</em></span></a>
            <a href="/discover"><b>2</b><span>EXPLORE<em>name any destination</em></span></a>
            <a href="/stylist"><b>3</b><span>STYLE<em>build the whole look</em></span></a>
          </div>
          {leans.length > 0 && (
            <div className="aguidelean">
              CURRENT ROUTE · {leans.map((lean) => lean.tag).join(" / ")}
            </div>
          )}
          {err && <div className="pempty">{err}</div>}
          {!err && !memory && <div className="pempty">reading…</div>}
          {memory && <MemorySections memory={memory} setHidden={setHidden} />}
          <a className="btn ghost wide" href="/asterisk" style={{ display: "block", textAlign: "center" }}>
            OPEN PASSPORT READ & CONTROLS →
          </a>
          <div className="adisclose">
            ✳ Asterisk is an automated recommendation &amp; interpretation system.
            Readings are human-curated and cited; no generative AI is active.
            <a href="/asterisk"> WHAT ASTERISK IS</a>
          </div>
        </div>
      )}
    </>
  );
}
