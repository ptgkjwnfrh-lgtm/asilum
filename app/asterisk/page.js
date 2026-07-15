"use client";
// /asterisk — the full Asterisk memory page (handoff Feature B, Phase 2).
// Everything the drawer shows, plus the control room: export your memory as
// JSON, correct the record, and the honest big red switches (reset brain,
// delete personalization) — all routed to the EXISTING endpoints per ADR-001;
// this page owns no writes beyond section visibility.

import { useEffect, useRef, useState } from "react";
import { MemorySections, useAsteriskMemory } from "../components/AsteriskMemory.jsx";
import { clearLocalPersonalizationData, postJSON, sendJSON, getUid } from "../../lib/client.js";
import { followedBrands, followedUsers } from "../../lib/social.js";

const SYNC_KEY = "asilum-follows-synced";

export default function AsteriskPage() {
  const { memory, err, setHidden, reload } = useAsteriskMemory(true);
  const [confirmText, setConfirmText] = useState("");
  const [status, setStatus] = useState("");
  const syncAttempts = useRef(new Set());

  // One-time graduation of localStorage follows into user_follows (ADR-001):
  // Reconcile only missing local follows; never remove or clobber follows
  // learned on another device. Failed writes remain eligible on the next visit.
  useEffect(() => {
    if (!memory || typeof window === "undefined") return;
    const user = getUid() || "anonymous";
    const syncKey = `${SYNC_KEY}:${user}`;
    if (window.localStorage.getItem(syncKey) || syncAttempts.current.has(user)) return;
    const server = new Set(memory.explicit.follows.map((f) => `${f.kind}\0${f.target}`));
    const local = [
      ...followedBrands().map((b) => ({ kind: "brand", target: b })),
      ...followedUsers().map((u) => ({ kind: "user", target: u })),
    ].filter((f) => !server.has(`${f.kind}\0${f.target}`));
    if (!local.length) {
      window.localStorage.setItem(syncKey, "1");
      return;
    }
    syncAttempts.current.add(user);
    Promise.allSettled(local.map((f) => postJSON("/api/follow", { user: getUid(), ...f, follow: true })))
      .then((results) => {
        const synced = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;
        if (synced === local.length) window.localStorage.setItem(syncKey, "1");
        setStatus(synced === local.length
          ? `synced ${synced} local follow${synced === 1 ? "" : "s"} to your memory`
          : `synced ${synced} of ${local.length} local follows — the rest will retry next visit`);
        if (synced) reload();
      });
  }, [memory, reload]);

  function exportMemory() {
    if (!memory) return;
    const blob = new Blob([JSON.stringify(memory, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `asterisk-memory-${getUid() || "anon"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function deletePersonalization() {
    setStatus("");
    const res = await sendJSON("DELETE", "/api/privacy", { user: getUid(), confirm: confirmText });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(data.error || "delete failed"); return; }
    const user = getUid() || "anonymous";
    try {
      window.localStorage.removeItem(SYNC_KEY);
      window.localStorage.removeItem(`${SYNC_KEY}:${user}`);
    } catch {}
    clearLocalPersonalizationData();
    setConfirmText("");
    setStatus("personalization erased — " + (data.retained || []).join(", ") + " retained");
    reload();
  }

  return (
    <div className="amempage">
      <h1 className="headline"><span className="red">*</span>ASTERISK MEMORY</h1>
      <div className="amemsub">
        Everything Asterisk holds about you, from the stores it already keeps — nothing invented,
        nothing duplicated. Corrections retrain it; the switches below are real.
      </div>
      {err && <div className="pempty">{err}</div>}
      {!err && !memory && <div className="pempty">reading…</div>}
      {memory && <MemorySections memory={memory} setHidden={setHidden} full />}

      {memory && (
        <div className="amemsec">
          <div className="amemhead"><b className="red">*</b> CONTROLS</div>
          <div className="amembody">
            <div className="amemrow">
              <span className="amemlbl">EXPORT</span>
              <span className="amemval"><button className="btn ghost" onClick={exportMemory}>DOWNLOAD JSON</button></span>
            </div>
            <div className="amemrow">
              <span className="amemlbl">RETRAIN</span>
              <span className="amemval">
                open any piece → <em>✳ WHY THIS</em> to correct a read · <a className="amemgo" href="/board">TRAIN THE MOODBOARD</a>
              </span>
            </div>
            <div className="amemrow">
              <span className="amemlbl">RESET BRAIN</span>
              <span className="amemval">taste vector back to zero — <a className="amemgo" href="/board">2-STEP ON MOODBOARD</a></span>
            </div>
            <div className="amemrow">
              <span className="amemlbl">ERASE</span>
              <span className="amemval">
                type <em>DELETE PERSONALIZATION</em> to erase everything above (purchase tickets and
                de-identified statistics remain)
                <span className="amemerase">
                  <input
                    className="amemconfirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE PERSONALIZATION"
                  />
                  <button
                    className="btn ghost"
                    disabled={confirmText !== "DELETE PERSONALIZATION"}
                    onClick={deletePersonalization}
                  >
                    ERASE
                  </button>
                </span>
              </span>
            </div>
            {status && <div className="amemnote">{status}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
