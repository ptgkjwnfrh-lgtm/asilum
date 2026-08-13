"use client";

// app/settings/page.js — SETTINGS.
// On-device taste observation, privacy controls, and the legal position.
// Identity, public profile, source connections, follows, and fit live on PROFILE.

import { useEffect, useState } from "react";
import Notice from "../components/Notice.jsx";
import { getUid, postJSON, sendJSON, clearLocalPersonalizationData } from "../../lib/client.js";
import { observationOn, setObservation } from "../../lib/social.js";

export default function SettingsPage() {
  const [uid, setUid] = useState("");
  const [observe, setObserve] = useState(true);
  const [notice, setNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [iface, setIface] = useState("01");
  const [theme, setTheme] = useState("system");

  useEffect(() => {
    setUid(getUid() || "");
    setObserve(observationOn());
    setIface(document.documentElement.dataset.model || "01");
    // "system" = no stored pick; the shell follows the device preference.
    let storedTheme = null;
    try { storedTheme = window.localStorage.getItem("asilum-theme"); } catch {}
    setTheme(storedTheme === "dark" || storedTheme === "light" ? storedTheme : "system");
    // Clear stale flags: the old simulated-import "connected" marker, and
    // the boot-sweep opt-out left behind when the boot sweep was deleted.
    try {
      window.localStorage.removeItem("asilum-connected");
      window.localStorage.removeItem("asilum-boot");
    } catch {}
  }, []);

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

  function setInterfaceMode(mode) {
    setIface(mode);
    document.documentElement.dataset.model = mode;
    try { window.localStorage.setItem("asilum-model", mode); } catch {}
  }
  function setThemeMode(mode) {
    setTheme(mode);
    if (mode === "system") {
      try { window.localStorage.removeItem("asilum-theme"); } catch {}
      document.documentElement.dataset.theme =
        window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      return;
    }
    document.documentElement.dataset.theme = mode;
    try { window.localStorage.setItem("asilum-theme", mode); } catch {}
  }

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>SETTINGS</h1>
      <p className="deck">observation, appearance, privacy, and the fine print.</p>
      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      <h3 className="statshead">APPEARANCE</h3>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Interface mode</div>
          <div className="uhandle">MODULE RAIL is the standard instrument stack; ORB HUB puts the engine front and centre.</div>
        </div>
        <div className="controls" style={{ margin: 0 }}>
          <button className={"fitbtn" + (iface === "01" ? " active" : "")} onClick={() => setInterfaceMode("01")}>MODULE RAIL</button>
          <button className={"fitbtn" + (iface === "02" ? " active" : "")} onClick={() => setInterfaceMode("02")}>ORB HUB</button>
        </div>
      </div>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Design console</div>
          <div className="uhandle">edit every text size, button, layout measure, and motion speed by hand — ctrl+shift+D anywhere.</div>
        </div>
        <button
          className="fitbtn"
          onClick={() => window.dispatchEvent(new CustomEvent("asilum:uilab-open"))}
        >
          OPEN CONSOLE →
        </button>
      </div>
      <div className="setrow">
        <div className="setinfo">
          <div className="setname">Theme</div>
          <div className="uhandle">MATCH DEVICE follows your system; or pin phosphor dark / ice light.</div>
        </div>
        <div className="controls" style={{ margin: 0 }}>
          <button className={"fitbtn" + (theme === "system" ? " active" : "")} onClick={() => setThemeMode("system")}>MATCH DEVICE</button>
          <button className={"fitbtn" + (theme === "dark" ? " active" : "")} onClick={() => setThemeMode("dark")}>PHOSPHOR DARK</button>
          <button className={"fitbtn" + (theme === "light" ? " active" : "")} onClick={() => setThemeMode("light")}>ICE LIGHT</button>
        </div>
      </div>

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

      <div className="controls">
        <span className="uhandle">device id: {uid}</span>
        <a className="fitbtn" href="/profile">profile & connections →</a>
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
        are stored privately under your pseudonymous device or authenticated account,
        used only for first-party fit scoring, and never sent to a merchant or
        external model; you can clear them from PROFILE or delete them with the
        personalization controls above. taste vectors use a pseudonymous device or authenticated
        account identifier. resetting the recommendation model does not delete history;
        the data controls above state exactly what a broader deletion retains.
      </p>
      <p className="legal">
        automated systems: ASILUM&apos;s recommendations and cultural readings are
        produced by Asterisk, an automated system built on deterministic
        taste arithmetic and a human-curated, source-cited culture catalog.
        no generative AI model currently produces content in this product;
        if that changes, the surface it appears on will say so. guidance can
        be paused, corrected, or erased at any time — see the{" "}
        <a href="/asterisk">ASTERISK CONTROL ROOM</a> for the full read and
        controls.
      </p>
      <p className="legal">
        the fine print, in full:{" "}
        <a href="/privacy">PRIVACY POLICY</a> ·{" "}
        <a href="/terms">TERMS OF SERVICE</a> ·{" "}
        <a href="/accessibility">ACCESSIBILITY</a>
      </p>
    </div>
  );
}
