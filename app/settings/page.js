"use client";

// app/settings/page.js — SETTINGS.
// Source connections, on-device taste observation, the usual
// account settings, and the legal position (legitimate sources only).

import { useEffect, useState } from "react";
import { getUid, postJSON, sendJSON, clearLocalPersonalizationData } from "../../lib/client.js";
import {
  getProfileInfo, saveProfileInfo, observationOn, setObservation,
} from "../../lib/social.js";

const MARKETPLACES = ["eBay", "Pinterest", "Shopify"];
const CONNECTABLE = new Set(["ebay", "pinterest", "shopify"]);

export default function SettingsPage() {
  const [uid, setUid] = useState("");
  const [observe, setObserve] = useState(true);
  const [info, setInfo] = useState(null);
  const [notice, setNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);

  useEffect(() => {
    setUid(getUid() || "");
    setInfo(getProfileInfo());
    setObserve(observationOn());
    // Clear any stale "connected" flag from the old simulated import — no
    // real connection exists until a real OAuth adapter ships.
    try { window.localStorage.removeItem("asilum-connected"); } catch {}
  }, []);

  function statusFor(name) {
    const key = name.toLowerCase();
    return CONNECTABLE.has(key) ? "REQUIRES SETUP" : "COMING SOON";
  }

  async function link(name) {
    const key = name.toLowerCase();
    if (!CONNECTABLE.has(key)) { setNotice(name + " connection is not available yet"); return; }
    const res = await postJSON("/api/connect", { user: uid, platform: key }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setNotice((d && d.message) || name + " linking is coming soon — real account setup required");
  }

  function saveInfo(k, v) {
    setInfo((prev) => { const n = { ...prev, [k]: v }; saveProfileInfo(n); return n; });
  }

  async function resetTaste() {
    const response = await postJSON("/api/reset", { user: uid }).catch(() => null);
    setNotice(response?.ok
      ? "recommendation model reset; boards, history, tickets, and aggregate signals remain"
      : "recommendation model could not be reset");
  }

  async function deletePersonalization() {
    if (!deleteChecked) return;
    const response = await sendJSON("DELETE", "/api/privacy", {
      user: uid, confirm: "DELETE PERSONALIZATION",
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setNotice(data.error || "personalization data could not be deleted"); return; }
    clearLocalPersonalizationData();
    setDeleteOpen(false);
    setDeleteChecked(false);
    setNotice(`personalization deleted; retained: ${(data.retained || []).join(", ")}`);
  }

  if (!info) return <div className="wrap"><div className="empty">…</div></div>;

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>SETTINGS</h1>
      <p className="deck">accounts, observation, and the fine print.</p>
      {notice && <div className="autonote" onClick={() => setNotice("")}>{notice}</div>}

      <h3 className="statshead">SOURCE CONNECTIONS</h3>
      {MARKETPLACES.map((m) => {
        const st = statusFor(m);
        return (
          <div className="setrow" key={m}>
            <span className="seticon">{m[0]}</span>
            <div className="setinfo">
              <div className="setname">{m}</div>
              <div className="uhandle">{uid ? "device " + uid.slice(0, 10) + "…" : ""}</div>
            </div>
            <span className={"setstatus" + (st === "ACTIVE" ? " on" : "")}>{st}</span>
            <button className="fitbtn soon" onClick={() => link(m)}>LINK</button>
          </div>
        );
      })}

      <h3 className="statshead">ON-DEVICE TASTE OBSERVATION</h3>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Observation</div>
          <div className="uhandle" style={{ maxWidth: 520, whiteSpace: "normal" }}>
            ASILUM notes aesthetics you linger on in-app to sharpen the brain.
            browser or partner activity is not observed unless a real
            connection exists and you explicitly permit it.
          </div>
        </div>
        <button
          className={"fitbtn" + (observe ? " active" : "")}
          onClick={() => { setObservation(!observe); setObserve(!observe); setNotice(!observe ? "observation on — the brain is watching what you linger on" : "observation off — the brain only learns from explicit actions"); }}
        >
          {observe ? "ON" : "OFF"}
        </button>
      </div>

      <h3 className="statshead">ACCOUNT</h3>
      <div className="fitform" style={{ maxWidth: 560 }}>
        <label>
          display name
          <input type="text" value={info.name} onChange={(e) => saveInfo("name", e.target.value)} />
        </label>
        <label>
          handle
          <input type="text" value={info.handle} onChange={(e) => saveInfo("handle", e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 240 }}>
          bio
          <input type="text" value={info.bio} onChange={(e) => saveInfo("bio", e.target.value)} />
        </label>
      </div>
      <div className="controls">
        <span className="uhandle">device id: {uid}</span>
        <a className="fitbtn" href="/stats">brain health dashboard →</a>
      </div>

      <h3 className="statshead">DATA CONTROLS</h3>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Reset recommendation model</div>
          <div className="uhandle">clears learned taste weights only; boards, events, tickets, and anonymous aggregate signals remain.</div>
        </div>
        <button className="fitbtn" onClick={resetTaste}>RESET MODEL</button>
      </div>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Delete personalization data</div>
          <div className="uhandle" style={{ maxWidth: 620, whiteSpace: "normal" }}>
            deletes profile vectors, interactions, searches, boards, uploads, corrections, stylist history, and posts.
            purchase tickets, consent records, the auth account, and deidentified aggregate item statistics remain.
          </div>
        </div>
        <button className="fitbtn" onClick={() => setDeleteOpen(true)}>DELETE DATA</button>
      </div>
      {deleteOpen && (
        <div className="autonote" style={{ cursor: "default" }}>
          <label className="toggle">
            <input type="checkbox" checked={deleteChecked} onChange={(e) => setDeleteChecked(e.target.checked)} />
            I understand what is deleted and what is retained
          </label>
          <div className="controls">
            <button className="btn" disabled={!deleteChecked} onClick={deletePersonalization}>CONFIRM DELETE</button>
            <button className="btn ghost" onClick={() => { setDeleteOpen(false); setDeleteChecked(false); }}>CANCEL</button>
          </div>
        </div>
      )}

      <h3 className="statshead">LEGAL</h3>
      <p className="legal">
        ASILUM sources listings exclusively through legitimate channels:
        official product APIs, partner commerce APIs, affiliate feeds, and
        authorized marketplace access. ASILUM does not scrape retailers and
        does not reproduce publication articles or imagery — editorial
        summaries are original and link to the publications. your measurements
        are stored only on this device and are sent transiently to ASILUM for
        first-party fit scoring, never persisted server-side or sent to an
        external model; taste vectors use a pseudonymous device or authenticated
        account identifier. resetting the recommendation model does not delete history;
        the data controls above state exactly what a broader deletion retains.
      </p>
    </div>
  );
}
