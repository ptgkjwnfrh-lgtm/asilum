"use client";

// app/settings/page.js — SETTINGS.
// The rack (owner order, Aug 12: old music-making software — numbered
// hardware modules, LEDs, engraved labels; every control a user needs to
// fix anything, in plain language). ASTERISK's own controls live here now:
// guidance, observation, and the model reset sit on one module, with the
// control room and brain dashboard one press away. Every LED reflects real
// state; no control exists that does nothing.

import { useEffect, useState } from "react";
import Notice from "../components/Notice.jsx";
import { getUid, postJSON, sendJSON, authorizedFetch, clearLocalPersonalizationData, brainEnabled } from "../../lib/client.js";
import { observationOn, setObservation } from "../../lib/social.js";
import { authConfigured, getSupabase } from "../../lib/supabase.js";

// The rack's sign-in/log-out row (owner order, Aug 13): module 03 shows
// the account's true state — a SIGN IN road when signed out, LOG OUT
// when signed in. The full form still lives on PROFILE (one home).
function SettingsAuthRow() {
  const [authUser, setAuthUser] = useState(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    let active = true; let subscription = null;
    getSupabase().then((sb) => {
      if (!active || !sb) return;
      subscription = sb.auth.onAuthStateChange((_e, session) => {
        if (active) setAuthUser(session?.user || null);
      })?.data?.subscription || null;
    });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  async function logOut() {
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signOut({ scope: "local" });
      if (error) throw error;
      setNote("logged out — this device is a passport again");
    } catch { setNote("could not log out — try again"); }
  }
  if (!authConfigured()) return null;
  return (
    <div className="rkrow">
      <div className="rkname">{authUser ? "Signed in" : "Sign in"}</div>
      <div className="rkctl">
        {authUser
          ? <button className="fitbtn" onClick={logOut}>LOG OUT</button>
          : <a className="fitbtn" href="/profile#access">SIGN IN →</a>}
      </div>
      <div className="rkdesc">
        {authUser
          ? (authUser.email || authUser.id) + " — your account rides this device."
          : note || "create an account or sign in — the form lives on PROFILE → ACCOUNT."}
        {authUser && note ? " " + note : ""}
      </div>
    </div>
  );
}
import { AsteriskGuidanceToggle } from "../components/AsteriskMemory.jsx";

export default function SettingsPage() {
  const [uid, setUid] = useState("");
  const [observe, setObserve] = useState(true);
  const [guide, setGuide] = useState(true);
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
    const syncGuide = () => setGuide(brainEnabled());
    syncGuide();
    window.addEventListener("asilum:brain", syncGuide);
    return () => window.removeEventListener("asilum:brain", syncGuide);
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
    <div className="wrap rkr">
      <h1 className="headline"><span className="red">*</span>SETTINGS</h1>
      <p className="deck">the rack — every control that fixes anything, in plain language.</p>
      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      <section className="rkmod" aria-label="appearance">
        <div className="rkhead"><b>01</b> APPEARANCE <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
        <div className="rkrow">
          <div className="rkname">Interface mode</div>
          <div className="rkctl">
            <button className={"fitbtn" + (iface === "01" ? " active" : "")} onClick={() => setInterfaceMode("01")}>MODULE RAIL</button>
            <button className={"fitbtn" + (iface === "02" ? " active" : "")} onClick={() => setInterfaceMode("02")}>ORB HUB</button>
          </div>
          <div className="rkdesc">MODULE RAIL is the standard instrument stack; ORB HUB softens the surfaces.</div>
        </div>
        <div className="rkrow">
          <div className="rkname">Theme</div>
          <div className="rkctl">
            <button className={"fitbtn" + (theme === "system" ? " active" : "")} onClick={() => setThemeMode("system")}>MATCH DEVICE</button>
            <button className={"fitbtn" + (theme === "dark" ? " active" : "")} onClick={() => setThemeMode("dark")}>PHOSPHOR DARK</button>
            <button className={"fitbtn" + (theme === "light" ? " active" : "")} onClick={() => setThemeMode("light")}>ICE LIGHT</button>
          </div>
          <div className="rkdesc">MATCH DEVICE follows your system; or pin phosphor dark / ice light.</div>
        </div>
        <div className="rkrow">
          <div className="rkname">Design console</div>
          <div className="rkctl">
            <button className="fitbtn" onClick={() => window.dispatchEvent(new CustomEvent("asilum:uilab-open"))}>
              OPEN CONSOLE →
            </button>
          </div>
          <div className="rkdesc">hand-edit every text size, button, layout measure, and motion speed — ctrl+shift+D anywhere.</div>
        </div>
      </section>

      <section className="rkmod" aria-label="asterisk">
        <div className="rkhead"><b>02</b> ASTERISK <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
        <div className="rkrow">
          <div className="rkname"><span className={"rkled" + (guide ? " on" : "")} aria-hidden="true" />Guidance</div>
          <div className="rkctl"><AsteriskGuidanceToggle className="fitbtn" /></div>
          <div className="rkdesc">
            when guidance is on, the Asterisk system orders your feed, search, and looks
            through your Passport. paused = general results; your taste record
            is untouched either way.
          </div>
        </div>
        <div className="rkrow">
          <div className="rkname"><span className={"rkled" + (observe ? " on" : "")} aria-hidden="true" />On-device observation</div>
          <div className="rkctl">
            <button
              className={"fitbtn" + (observe ? " active" : "")}
              onClick={() => {
                const next = !observe;
                setObservation(next);
                setObserve(next);
                // D4 continuity: the toggle IS the consent control after the
                // first visit — both directions, server-recorded.
                postJSON("/api/consent", { user: getUid(), choice: next ? "observe" : "general" }).catch(() => {});
                try { window.localStorage.setItem("asilum-consent", next ? "observe" : "general"); } catch {}
                setNotice(next ? "observation on — the brain is watching what you linger on" : "observation off — the brain only learns from explicit actions");
              }}
            >
              {observe ? "ON" : "OFF"}
            </button>
          </div>
          <div className="rkdesc">
            ASILUM notes aesthetics you linger on in-app to sharpen the brain.
            browser or partner activity is not observed unless a real
            connection exists and you explicitly permit it.
          </div>
        </div>
        <div className="rkrow">
          <div className="rkname">Reset recommendation model</div>
          <div className="rkctl"><button className="fitbtn" onClick={resetTaste}>RESET MODEL</button></div>
          <div className="rkdesc">clears learned taste weights only; boards, events, tickets, and anonymous aggregate signals remain.</div>
        </div>
        <div className="rkrow">
          <div className="rkname">Instruments</div>
          <div className="rkctl">
            <a className="fitbtn" href="/stats">BRAIN DASHBOARD →</a>
            <a className="fitbtn" href="/asterisk">CONTROL ROOM →</a>
          </div>
          <div className="rkdesc">the dashboard shows the engine's health; the control room reads back everything the Asterisk system remembers, with erase controls.</div>
        </div>
      </section>

      <section className="rkmod" aria-label="identity">
        <div className="rkhead"><b>03</b> IDENTITY <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
        <div className="rkrow">
          <div className="rkname">This device</div>
          <div className="rkctl"><span className="rkmono">{uid || "—"}</span></div>
          <div className="rkdesc">your pseudonymous device identity — taste, boards, and history hang off this id until you sign in.</div>
        </div>
        <div className="rkrow">
          <div className="rkname">Account, connections &amp; follows</div>
          <div className="rkctl"><a className="fitbtn" href="/profile#access">OPEN ON PROFILE →</a></div>
          <div className="rkdesc">sign in, connect sources, and manage who you follow — identity has one home, on PROFILE.</div>
        </div>
        <SettingsAuthRow />
      </section>

      <section className="rkmod" aria-label="data">
        <div className="rkhead"><b>04</b> DATA <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
        <div className="rkrow">
          <div className="rkname">Delete personalization data</div>
          <div className="rkctl"><button className="fitbtn" onClick={() => setDeleteOpen(true)}>DELETE DATA</button></div>
          <div className="rkdesc">
            deletes profile vectors, interactions, searches, boards, uploads,
            corrections, stylist history, and posts. purchase tickets, consent
            records, the auth account, and deidentified aggregate item
            statistics remain.
          </div>
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
      </section>

      <section className="rkmod" aria-label="legal">
        <div className="rkhead"><b>05</b> LEGAL <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
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
          produced by the Asterisk system, an automated system built on deterministic
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
      </section>

      <PurchaseInfoRack />
    </div>
  );
}

// Module 06 — PURCHASE INFO (owner ruling, 20 Aug 2026). The buyer vault's
// ONE editing door: name and address typed once at first purchase live
// here; the saved card shows brand + last4 only (Stripe holds the card —
// ASILUM never saw a number). Every control is real: edit, remove the
// card, or forget everything.
function PurchaseInfoRack() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null); // null = display mode
  const [note, setNote] = useState("");

  async function refresh() {
    const res = await authorizedFetch(`/api/purchase-info?user=${encodeURIComponent(getUid())}`).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (res && res.ok) setProfile(d.profile || null);
  }
  useEffect(() => { refresh(); }, []);

  function beginEdit() {
    setForm({
      fullName: (profile && profile.full_name) || "",
      addressLine1: (profile && profile.address_line1) || "",
      addressLine2: (profile && profile.address_line2) || "",
      city: (profile && profile.city) || "",
      region: (profile && profile.region) || "",
      postalCode: (profile && profile.postal_code) || "",
      country: (profile && profile.country) || "",
    });
  }

  async function save() {
    const res = await sendJSON("PUT", "/api/purchase-info", { user: getUid(), profile: form }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setNote((d && d.error) || "could not save"); return; }
    setProfile(d.profile || null);
    setForm(null);
    setNote("saved — used at your next checkout, typed never again");
  }

  async function dropCard() {
    const res = await fetch(`/api/purchase-info?card=1&user=${encodeURIComponent(getUid())}`, { method: "DELETE" }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (res && res.ok) { setProfile(d.profile || null); setNote("card reference removed — the next fee asks once"); }
  }

  async function forgetAll() {
    const res = await fetch(`/api/purchase-info?user=${encodeURIComponent(getUid())}`, { method: "DELETE" }).catch(() => null);
    if (res && res.ok) { setProfile(null); setForm(null); setNote("forgotten — first purchase will ask once again"); }
  }

  const F = (k, label, auto) => (
    <label><span>{label}</span>
      <input value={form[k]} autoComplete={auto}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
    </label>
  );

  return (
    <section className="rkmod" aria-label="purchase info">
      <div className="rkhead"><b>06</b> PURCHASE INFO <span className="rkscrew" aria-hidden="true">⊕ ⊕</span></div>
      <p className="legal">
        stored once at your first purchase, in a separate vault apart from the
        catalog and your taste record; used only to open checkout without
        retyping. the card itself lives at Stripe — ASILUM keeps a reference
        and the last four digits, never a number.
      </p>
      <Notice onDismiss={() => setNote("")}>{note}</Notice>
      {!profile && !form && (
        <p className="pempty">nothing stored yet — your first purchase asks once, then it lives here.</p>
      )}
      {profile && !form && (
        <div className="chkonfile">
          <span className="cclbl">NAME</span><span className="ccval">{profile.full_name || "—"}</span>
          <span className="cclbl">ADDRESS</span>
          <span className="ccval">
            {[profile.address_line1, profile.address_line2, profile.city, profile.region, profile.postal_code, profile.country]
              .filter(Boolean).join(", ") || "—"}
          </span>
          <span className="cclbl">CARD</span>
          <span className="ccval">
            {profile.has_saved_card
              ? `${(profile.card_brand || "card").toUpperCase()} ···· ${profile.card_last4 || ""}`
              : "none saved"}
          </span>
        </div>
      )}
      {form && (
        <div className="chkform">
          {F("fullName", "FULL NAME", "name")}
          {F("addressLine1", "ADDRESS", "address-line1")}
          {F("addressLine2", "ADDRESS 2 (optional)", "address-line2")}
          {F("city", "CITY", "address-level2")}
          {F("region", "REGION / STATE", "address-level1")}
          {F("postalCode", "POSTAL CODE", "postal-code")}
          {F("country", "COUNTRY", "country-name")}
        </div>
      )}
      <div className="setrow">
        {form ? (
          <>
            <button className="btn" onClick={save}>SAVE ✓</button>
            <button className="btn ghost" onClick={() => setForm(null)}>CANCEL</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={beginEdit}>{profile ? "EDIT" : "ADD DETAILS"}</button>
            {profile && profile.has_saved_card && (
              <button className="btn ghost" onClick={dropCard}>REMOVE CARD ✓</button>
            )}
            {profile && (
              <button className="btn ghost" onClick={forgetAll}>FORGET EVERYTHING ✓</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
