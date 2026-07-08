"use client";

// app/settings/page.js — SETTINGS.
// Partnered marketplace accounts, on-device taste observation, the usual
// account settings, and the legal position (legitimate sources only).

import { useEffect, useState } from "react";
import { getUid, postJSON } from "../../lib/client.js";
import {
  getProfileInfo, saveProfileInfo, observationOn, setObservation,
} from "../../lib/social.js";

const MARKETPLACES = ["Grailed", "TheRealReal", "Farfetch", "SSENSE", "Depop", "Lowheads", "eBay"];
const CONNECTABLE = new Set(["grailed", "depop", "ssense", "ebay"]);

export default function SettingsPage() {
  const [uid, setUid] = useState("");
  const [connected, setConnected] = useState("");
  const [observe, setObserve] = useState(true);
  const [info, setInfo] = useState(null);
  const [notice, setNotice] = useState("");

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
    if (connected === key) return "ACTIVE";
    return CONNECTABLE.has(key) ? "COMING SOON" : "PENDING PARTNERSHIP";
  }

  async function link(name) {
    const key = name.toLowerCase();
    if (!CONNECTABLE.has(key)) { setNotice(name + " partnership is pending — we'll flip it on the day it signs"); return; }
    const res = await postJSON("/api/connect", { user: uid, platform: key }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    if (d && d.imported) {
      try { window.localStorage.setItem("asilum-connected", key); } catch {}
      setConnected(key);
      setNotice(name + " linked — " + d.imported + " purchases imported into the brain");
    } else {
      setNotice((d && d.message) || name + " linking is coming soon — real account setup required");
    }
  }

  function unlink(name) {
    if (connected === name.toLowerCase()) {
      try { window.localStorage.removeItem("asilum-connected"); } catch {}
      setConnected("");
      setNotice(name + " unlinked — imported taste stays unless you run Full Amnesia on the moodboard");
    }
  }

  function saveInfo(k, v) {
    setInfo((prev) => { const n = { ...prev, [k]: v }; saveProfileInfo(n); return n; });
  }

  if (!info) return <div className="wrap"><div className="empty">…</div></div>;

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>SETTINGS</h1>
      <p className="deck">accounts, observation, and the fine print.</p>
      {notice && <div className="autonote" onClick={() => setNotice("")}>{notice}</div>}

      <h3 className="statshead">PARTNERED ACCOUNTS</h3>
      {MARKETPLACES.map((m) => {
        const st = statusFor(m);
        return (
          <div className="setrow" key={m}>
            <span className="seticon">{m[0]}</span>
            <div className="setinfo">
              <div className="setname">{m}</div>
              <div className="uhandle">{uid ? uid.slice(0, 10) + "…@asilum.link" : ""}</div>
            </div>
            <span className={"setstatus" + (st === "ACTIVE" ? " on" : "")}>{st}</span>
            {st === "ACTIVE" ? (
              <button className="fitbtn" onClick={() => unlink(m)}>UNLINK</button>
            ) : (
              <button className="fitbtn" onClick={() => link(m)}>LINK</button>
            )}
          </div>
        );
      })}

      <h3 className="statshead">ON-DEVICE TASTE OBSERVATION</h3>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Observation</div>
          <div className="uhandle" style={{ maxWidth: 520, whiteSpace: "normal" }}>
            with permission, ASILUM notes aesthetics you linger on in-app and
            through allowed browser/partner activity to sharpen the brain.
            signals stay on this device where possible.
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

      <h3 className="statshead">LEGAL</h3>
      <p className="legal">
        ASILUM sources listings exclusively through legitimate channels:
        official product APIs, partner commerce APIs, affiliate feeds, and
        authorized marketplace access. ASILUM does not scrape retailers and
        does not reproduce publication articles or imagery — editorial
        summaries are original and link to the publications. your measurements
        never leave this device; taste vectors are stored against an anonymous
        device id. deleting your taste profile (moodboard → full amnesia) is
        immediate and irreversible.
      </p>
    </div>
  );
}
