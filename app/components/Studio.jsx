"use client";

// app/components/Studio.jsx — STUDIO, inside the Passport (V.2).
// One account; the business tools appear here, contextually, without a
// second identity. Four instruments:
//   1. CONNECT SHOPIFY STORE — the real path today is the booth application
//      (POST /api/business, a human decides) plus the public products.json
//      import behind THE DESK. Full OAuth needs a partner app the register
//      lists as BLOCKED, so the connection walkthrough is a labelled MODEL
//      and never a fake success.
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

const DRAFTS_KEY = "asilum-studio-drafts";
const KIND_LABEL = { runway: "RUNWAY", "pop-up": "POP-UP", consignment: "CONSIGNMENT", thrift: "THRIFT", shop: "SHOP", exhibition: "EXHIBITION", creator: "CREATOR" };
const DATED_KINDS = new Set(["runway", "pop-up"]);

function readDrafts() { try { const v = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function writeDrafts(list) { try { window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 50))); } catch {} }

const EMPTY_EVENT = { kind: "pop-up", name: "", organizer: "", address: "", city: "Bowie, Maryland", startsAt: "", endsAt: "", admission: "", price: "", sourceUrl: "", imageRights: false };

export default function Studio({ uid }) {
  const [drafts, setDrafts] = useState([]);
  const [ev, setEv] = useState(EMPTY_EVENT);
  const [promo, setPromo] = useState({ draftId: "", startsAt: "", endsAt: "", budget: "" });
  const [shopStep, setShopStep] = useState(0);
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
          <h3 className="sthead">Connect Shopify store <ModelTag kind="connection" /></h3>
          <p className="stp">Real OAuth needs a Shopify partner app ASILUM does not have yet (the rights register marks it blocked). The real path today: a verified booth application, decided by a person, then a catalog import of only the fields ASILUM needs — product and variant identity, price, availability, authorized media. Checkout, payment, inventory truth, shipping and returns stay with the merchant.</p>
          <ol className="stwalk">
            {["store domain — yours, never your password", "scopes: read products and collections only", "choose the collections to show", "catalog fields imported; checkout stays on your store"].map((s, i) => (
              <li key={s} className={i < shopStep ? "done" : i === shopStep ? "cur" : ""}>{s}</li>
            ))}
          </ol>
          <div className="stacts">
            <button className="txtbtn" onClick={() => setShopStep((s) => (s + 1) % 5)}>{shopStep === 4 ? "RESET THE WALKTHROUGH" : "PREVIEW THE CONNECTION →"} <ModelTag>MODEL</ModelTag></button>
            <a className="txtbtn" href="/profile#access">APPLY FOR A VERIFIED BOOTH →</a>
          </div>
          <p className="stfine">staff use their own accounts and receive scoped permissions; disconnecting removes the imported catalog and nothing else.</p>
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
