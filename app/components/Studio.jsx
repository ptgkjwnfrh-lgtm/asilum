"use client";

// app/components/Studio.jsx — STUDIO, inside the Passport (V.2).
// One account; the business tools appear here, contextually, without a
// second identity. Four instruments:
//   1. CONNECT SHOPIFY STORE — an owner-scoped OAuth installation. The panel
//      reports app-configuration and review blockers as blockers, never as a
//      pretend connection.
//   2. ADD AN EVENT / A SHOP — a submission with every provenance field the
//      map demands, saved as a DRAFT on this device (no directory table
//      exists yet). Submission is open to anyone; it is not verification.
//   3. REQUEST A PROMOTED PLACEMENT — separate from submission; labelled
//      SPONSORED; cannot buy verification, ranking, notifications or a
//      partnership label. A draft, on this device.
//   4. THE VERIFICATION DESK — /api/verification: source claims beside a
//      LOCAL-RULES reading; a human sees material conflicts only; human
//      labour TBD.

import { useEffect, useState } from "react";
import ModelTag from "./ModelTag.jsx";
import { PLACE_KINDS, CITIES } from "../../lib/places/registry.js";
import { authorizedFetch, getUid, postJSON, sendJSON } from "../../lib/client.js";

const DRAFTS_KEY = "asilum-studio-drafts";
const KIND_LABEL = { runway: "RUNWAY", "pop-up": "POP-UP", consignment: "CONSIGNMENT", thrift: "THRIFT", shop: "SHOP", exhibition: "EXHIBITION", creator: "CREATOR" };
const DATED_KINDS = new Set(["runway", "pop-up"]);

function readDrafts() { try { const v = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function writeDrafts(list) { try { window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 50))); } catch {} }

const EMPTY_EVENT = { kind: "pop-up", name: "", organizer: "", address: "", city: "Bowie, Maryland", startsAt: "", endsAt: "", admission: "", price: "", sourceUrl: "", imageRights: false };

function ShopifyConnectionPanel({ uid }) {
  const [shop, setShop] = useState("");
  const [connections, setConnections] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    if (!uid) { setConnections([]); return; }
    authorizedFetch(`/api/connections?user=${encodeURIComponent(getUid() || "")}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "connections could not be read");
        setConnections(data.connections || []);
      })
      .catch((error) => setNote(error.message));
  }

  useEffect(() => {
    load();
    const state = new URLSearchParams(window.location.search).get("shopify");
    if (state) setNote(state === "syncing" ? "store authorized — the first catalog sync is running" : `Shopify: ${state.replaceAll("_", " ")}`);
  }, [uid]);

  async function connect(event) {
    event.preventDefault(); setBusy(true); setNote("");
    try {
      const response = await postJSON("/api/connections/shopify/start", { user: getUid(), shop });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.authorizationUrl) throw new Error(data?.error || "authorization could not start");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setNote(error.message); setBusy(false); }
  }

  async function resync(id) {
    setBusy(true); setNote("");
    try {
      const response = await postJSON(`/api/connections/${id}/resync`, { user: getUid(), operationId: crypto.randomUUID() });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "sync could not start");
      setNote("catalog sync queued"); load();
    } catch (error) { setNote(error.message); }
    finally { setBusy(false); }
  }

  async function disconnect(id) {
    setBusy(true); setNote("");
    try {
      const response = await sendJSON("DELETE", `/api/connections/${id}`, { user: getUid() });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "store could not be disconnected");
      setNote("store disconnected and its catalog withdrawn"); load();
    } catch (error) { setNote(error.message); }
    finally { setBusy(false); }
  }

  async function changeDisplay(id, action) {
    setBusy(true); setNote("");
    try {
      const response = await sendJSON("PATCH", `/api/connections/${id}`, { user: getUid(), action });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `store could not ${action}`);
      setNote(action === "pause" ? "store catalog paused and hidden" : "store catalog sync resumed"); load();
    } catch (error) { setNote(error.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <p className="stp">Authorize ASILUM from Shopify. We request read-only product and inventory access; checkout, orders, customers, payments, shipping and returns remain with your store. Only products you explicitly tag <b>asilum:resale</b> enter the resale catalog.</p>
      {!uid && <p className="pempty">sign in before connecting a store.</p>}
      {uid && <form className="stform" onSubmit={connect}>
        <label>your myshopify domain<input type="text" value={shop} onChange={(event) => setShop(event.target.value)} placeholder="your-shop.myshopify.com" required /></label>
        <div className="stacts"><button className="btn" type="submit" disabled={busy}>{busy ? "WORKING…" : "AUTHORIZE IN SHOPIFY →"}</button></div>
      </form>}
      {note && <p className="pempty" role="status">{note}</p>}
      <ul className="stdrafts">
        {connections.map((connection) => <li key={connection.id}>
          <b>{connection.canonicalDomain}</b>
          <span>{connection.status.replaceAll("_", " ")} · {connection.importedCount} imported · {connection.skippedCount} skipped{connection.lastError ? ` · ${connection.lastError}` : ""}</span>
          {connection.status !== "revoked" && <span className="stacts">
            {connection.status === "paused"
              ? <button className="txtbtn" type="button" disabled={busy} onClick={() => changeDisplay(connection.id, "resume")}>RESUME</button>
              : <><button className="txtbtn" type="button" disabled={busy} onClick={() => resync(connection.id)}>SYNC NOW</button><button className="txtbtn" type="button" disabled={busy} onClick={() => changeDisplay(connection.id, "pause")}>PAUSE DISPLAY</button></>}
            <button className="txtbtn" type="button" disabled={busy} onClick={() => disconnect(connection.id)}>DISCONNECT</button>
          </span>}
        </li>)}
      </ul>
      <p className="stfine">disconnecting revokes ASILUM's stored credential and withdraws imported listings. your saves and Passport remain untouched.</p>
    </>
  );
}

export default function Studio({ uid }) {
  const [drafts, setDrafts] = useState([]);
  const [ev, setEv] = useState(EMPTY_EVENT);
  const [promo, setPromo] = useState({ draftId: "", startsAt: "", endsAt: "", budget: "" });
  const [desk, setDesk] = useState(null);
  const [deskOpen, setDeskOpen] = useState(null);
  const [note, setNote] = useState("");
  useEffect(() => { setDrafts(readDrafts()); }, []);
  useEffect(() => {
    fetch("/api/verification?limit=80").then((r) => (r.ok ? r.json() : null)).then(setDesk).catch(() => setDesk({ error: true }));
  }, []);

  function addDraft(kind, payload) {
    const d = { id: "draft-" + Date.now().toString(36), kind, at: new Date().toISOString(), status: "draft — not published", ...payload };
    const next = [d, ...readDrafts()];
    writeDrafts(next); setDrafts(next);
    return d;
  }
  function removeDraft(id) { const next = readDrafts().filter((d) => d.id !== id); writeDrafts(next); setDrafts(next); }
  function submitEvent(e) {
    e.preventDefault();
    if (!ev.name.trim() || !ev.address.trim()) { setNote("a name and a public address are the minimum"); return; }
    const city = CITIES[ev.city];
    addDraft("place", { ...ev, dated: DATED_KINDS.has(ev.kind), tz: city ? city.tz : null, country: city ? city.country : "", lastChecked: null, imageStatus: ev.imageRights ? "author asserts rights — unverified" : "none" });
    setEv(EMPTY_EVENT); setNote("saved as a draft on this device — publication needs a directory and a review desk, neither exists yet");
  }
  function submitPromo(e) {
    e.preventDefault();
    if (!promo.draftId) { setNote("choose a draft event or shop to promote"); return; }
    addDraft("promotion", { ...promo, label: "SPONSORED", buys: "placement only — never verification, ranking truth, notifications or a partnership label" });
    setPromo({ draftId: "", startsAt: "", endsAt: "", budget: "" }); setNote("promotion request saved as a draft on this device — no advertisement is submitted, nothing is charged");
  }
  const eventDrafts = drafts.filter((d) => d.kind === "place");

  return (
    <div className="studio">
      <p className="deck">one account. the same Passport, with tools for what you are building. nothing here creates a second identity, and disconnecting a store never touches your saves.</p>
      {note && <p className="pempty">{note}</p>}

      <div className="stgrid">
        {/* 1 — SHOPIFY */}
        <section className="stcard" aria-label="connect a store">
          <div className="cclbl">01 · BRING YOUR SHOP IN</div>
          <h3 className="sthead">Connect Shopify store</h3>
          <ShopifyConnectionPanel uid={uid} />
        </section>

        {/* 2 — EVENT / SHOP */}
        <section className="stcard" aria-label="add an event or a shop">
          <div className="cclbl">02 · GIVE YOUR SCENE A PLACE</div>
          <h3 className="sthead">Add an event or a shop <ModelTag kind="device" /></h3>
          <form className="stform" onSubmit={submitEvent}>
            <label>kind
              <select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })}>
                {PLACE_KINDS.filter((k) => k !== "creator").map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label>name<input type="text" maxLength={120} value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} required /></label>
            <label>organizer<input type="text" maxLength={120} value={ev.organizer} onChange={(e) => setEv({ ...ev, organizer: e.target.value })} /></label>
            <label>public address<input type="text" maxLength={200} value={ev.address} onChange={(e) => setEv({ ...ev, address: e.target.value })} required /></label>
            <label>city
              <select value={ev.city} onChange={(e) => setEv({ ...ev, city: e.target.value })}>
                {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {DATED_KINDS.has(ev.kind) && (
              <>
                <label>starts<input type="date" value={ev.startsAt} onChange={(e) => setEv({ ...ev, startsAt: e.target.value })} /></label>
                <label>ends<input type="date" value={ev.endsAt} onChange={(e) => setEv({ ...ev, endsAt: e.target.value })} /></label>
              </>
            )}
            <label>admission<input type="text" maxLength={60} placeholder="free · rsvp · ticket" value={ev.admission} onChange={(e) => setEv({ ...ev, admission: e.target.value })} /></label>
            <label>price<input type="text" maxLength={30} value={ev.price} onChange={(e) => setEv({ ...ev, price: e.target.value })} /></label>
            <label>official link<input type="url" maxLength={300} placeholder="https://" value={ev.sourceUrl} onChange={(e) => setEv({ ...ev, sourceUrl: e.target.value })} /></label>
            <label className="stcheck"><input type="checkbox" checked={ev.imageRights} onChange={(e) => setEv({ ...ev, imageRights: e.target.checked })} /> I hold the rights to any image I would add</label>
            <div className="stacts"><button className="btn" type="submit">SAVE AS DRAFT</button></div>
          </form>
          <p className="stfine">anyone may submit without a store. submission is not verification; a person checks the source before a row is published.</p>
        </section>

        {/* 3 — PROMOTION */}
        <section className="stcard" aria-label="request a promoted placement">
          <div className="cclbl">03 · REACH THE RIGHT NEIGHBOURHOOD</div>
          <h3 className="sthead">Request a promoted placement <ModelTag kind="device" /></h3>
          <form className="stform" onSubmit={submitPromo}>
            <label>which draft
              <select value={promo.draftId} onChange={(e) => setPromo({ ...promo, draftId: e.target.value })}>
                <option value="">— choose an event or shop draft —</option>
                {eventDrafts.map((d) => <option key={d.id} value={d.id}>{d.name} · {KIND_LABEL[d.kind] || d.kind}</option>)}
              </select>
            </label>
            <label>from<input type="date" value={promo.startsAt} onChange={(e) => setPromo({ ...promo, startsAt: e.target.value })} /></label>
            <label>to<input type="date" value={promo.endsAt} onChange={(e) => setPromo({ ...promo, endsAt: e.target.value })} /></label>
            <label>budget (USD)<input type="number" min="0" step="1" value={promo.budget} onChange={(e) => setPromo({ ...promo, budget: e.target.value })} /></label>
            <div className="stacts"><button className="btn" type="submit" disabled={!eventDrafts.length}>SAVE THE REQUEST</button></div>
          </form>
          <p className="stfine">a placement is labelled <b>SPONSORED</b> wherever it appears. it cannot buy verification, ranking truth, push access or a partnership label.</p>
        </section>

        {/* drafts */}
        <section className="stcard" aria-label="your drafts">
          <div className="cclbl">YOUR DRAFTS · {drafts.length} ON THIS DEVICE</div>
          {drafts.length === 0 && <p className="stp faint">saved requests appear here. this build never submits an advertisement, publishes a location or charges you.</p>}
          <ul className="stdrafts">
            {drafts.map((d) => (
              <li key={d.id}>
                <b>{d.kind === "promotion" ? "SPONSORED REQUEST" : (KIND_LABEL[d.kind] || d.kind)}</b>
                <span>{d.name || (eventDrafts.find((e) => e.id === d.draftId) || {}).name || "—"} · {d.status}</span>
                <button className="txtbtn" onClick={() => removeDraft(d.id)}>DISCARD</button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 4 — THE DESK */}
      <section className="stdesk" aria-label="the verification desk">
        <div className="cclbl">04 · THE VERIFICATION DESK · HUMAN LABOUR: TBD</div>
        <p className="stp">every piece: the source's tags beside an independent reading. only a <b>material disagreement</b> — brand, category, material — reaches an archivalist. missing evidence stays pending; agreement means consistency, never authenticity.</p>
        {desk && !desk.error && (
          <>
            <div className="stdeskmode">{desk.mode.label} <ModelTag>the research column reads the listing text; cited research arrives with a keyed model</ModelTag></div>
            <div className="stcounts">
              {[["archivalist", "ARCHIVALIST QUEUE"], ["flagged", "FLAGGED"], ["pending", "PENDING"], ["agreed", "AGREED"]].map(([k, l]) => (
                <span key={k} className={"stcount " + k}><b>{String(desk.counts[k] || 0).padStart(2, "0")}</b>{l}</span>
              ))}
            </div>
            <ul className="stcases">
              {desk.cases.filter((c) => c.status !== "agreed").slice(0, 12).map((c) => (
                <li key={c.itemId} className={"stcase " + c.status}>
                  <button className="stcasehead" onClick={() => setDeskOpen(deskOpen === c.itemId ? null : c.itemId)} aria-expanded={deskOpen === c.itemId}>
                    <span className="stcasestatus">{c.status.toUpperCase()}</span>
                    <span className="stcasettl">{c.brand ? c.brand + " — " : ""}{c.title}</span>
                    <span className="stcasesrc">{c.source}</span>
                  </button>
                  {deskOpen === c.itemId && (
                    <table className="stfields">
                      <thead><tr><th>FIELD</th><th>SOURCE CLAIMS</th><th>READING</th><th>STATUS</th></tr></thead>
                      <tbody>
                        {c.fields.map((f) => (
                          <tr key={f.field} className={f.status}>
                            <td>{f.field.toUpperCase()}{f.material ? " *" : ""}</td>
                            <td>{f.source || "—"}</td>
                            <td>{f.research || "—"}<em>{f.evidence}</em></td>
                            <td>{f.status.toUpperCase()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
            <p className="stfine">* a material field. resolution is reversible and recorded with a named reviewer when the desk is staffed (lib/asterisk/facts.js ladder).</p>
          </>
        )}
        {desk && desk.error && <p className="pempty">the desk could not be read.</p>}
      </section>
    </div>
  );
}
