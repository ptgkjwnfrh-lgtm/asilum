"use client";

// app/components/PlacesPanel.jsx — AROUND YOU / MY PLACES (V.2).
// The local and global fashion map with its list, filters and the three
// location controls kept apart: the CONFIRMED base city (persistent), the
// optional CURRENT AREA (session, coarse), and the PUBLIC "Based in" field
// with its own detail and audience. Map discoverability is a fourth switch,
// off. Events and permanent places are different rows and say so.
//
// Places come from /api/places (two sourced rows, labelled fixtures). Saves
// go through the one save. Directions open the public map site with the
// pin's own coordinates; calendar hands the browser an .ics of the row.

import { useEffect, useMemo, useState } from "react";
import FashionMap from "./FashionMap.jsx";
import SaveButton from "./SaveButton.jsx";
import ModelTag from "./ModelTag.jsx";
import { CITIES, PLACE_KINDS } from "../../lib/places/registry.js";
import {
  getLocation, confirmBaseCity, clearBaseCity, setLocation, basedInLine,
  getCurrentArea, requestCurrentArea, clearCurrentArea, discoveryCenter,
} from "../../lib/location.js";

const KIND_LABEL = { runway: "RUNWAY", "pop-up": "POP-UP", consignment: "CONSIGNMENT", thrift: "THRIFT", shop: "SHOP", exhibition: "EXHIBITION", creator: "CREATOR" };
const STATUS_LABEL = { upcoming: "UPCOMING", "invitation-only": "INVITATION ONLY", "rsvp-required": "RSVP REQUIRED", "sold-out": "SOLD OUT", postponed: "POSTPONED", canceled: "CANCELED", ended: "ENDED", open: "OPEN" };

function icsFor(p) {
  const d = (s) => String(s || "").replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ASILUM//places//EN", "BEGIN:VEVENT",
    `UID:${p.id}@asilum`, `SUMMARY:${p.name}`, `LOCATION:${p.address || ""}`,
    p.startsAt ? `DTSTART;VALUE=DATE:${d(p.startsAt)}` : "", p.endsAt ? `DTEND;VALUE=DATE:${d(p.endsAt)}` : "",
    p.sourceUrl ? `URL:${p.sourceUrl}` : "", `DESCRIPTION:${(p.note || "").replace(/\n/g, " ")}${p.sample ? " (SAMPLE FIXTURE)" : ""}`,
    "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"));
}

export default function PlacesPanel({ compact = false, showControls = true }) {
  const [loc, setLoc] = useState(null);
  const [area, setArea] = useState(null);
  const [mode, setMode] = useState("local");   // local | world
  const [view, setView] = useState("map");     // map | list
  const [kind, setKind] = useState("");        // "" = all
  const [dated, setDated] = useState("all");   // all | events | places
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [cityPick, setCityPick] = useState("Bowie, Maryland");
  const [cityFree, setCityFree] = useState("");
  const [askingArea, setAskingArea] = useState(false);
  const [corrected, setCorrected] = useState("");

  useEffect(() => {
    const sync = () => { setLoc(getLocation()); setArea(getCurrentArea()); };
    sync();
    window.addEventListener("asilum:location", sync);
    return () => window.removeEventListener("asilum:location", sync);
  }, []);

  const center = useMemo(() => (loc ? discoveryCenter() : null), [loc, area]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const qs = new URLSearchParams();
    if (mode === "local" && center) { qs.set("lat", center.lat); qs.set("lng", center.lng); qs.set("km", "80"); }
    if (kind) qs.set("kind", kind);
    if (dated === "events") qs.set("dated", "1");
    if (dated === "places") qs.set("dated", "0");
    fetch("/api/places?" + qs.toString())
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData({ places: [], count: 0, error: true }));
  }, [mode, kind, dated, center && center.lat, center && center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const places = (data && data.places) || [];
  const selected = sel ? places.find((p) => p.id === sel) : null;

  function confirmCity() {
    const name = cityFree.trim() || cityPick;
    confirmBaseCity(name);
  }
  async function useArea() {
    setAskingArea(true);
    await requestCurrentArea();
    setAskingArea(false);
  }
  function queueCorrection(p) {
    try {
      const key = "asilum-corrections";
      const list = JSON.parse(window.localStorage.getItem(key) || "[]");
      list.unshift({ kind: "place", id: p.id, note: "reported for correction", at: new Date().toISOString() });
      window.localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
    } catch {}
    setCorrected(p.id);
  }

  const basedIn = loc ? basedInLine(loc, "everyone") : null;

  return (
    <div className={"places" + (compact ? " compact" : "")}>
      {loc && !loc.baseCity && (
        <div className="plconfirm">
          <div className="cclbl">YOUR BASE CITY</div>
          <p className="deck">Confirm where you are based. Nothing is detected; you choose it, and it stays private until you say otherwise.</p>
          <div className="plconfirmrow">
            <select aria-label="choose a base city" value={cityPick} onChange={(e) => setCityPick(e.target.value)}>
              {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input aria-label="or type a city" type="text" placeholder="or type your city" value={cityFree} onChange={(e) => setCityFree(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmCity()} />
            <button className="btn" onClick={confirmCity}>CONFIRM</button>
          </div>
        </div>
      )}

      <div className="pltop">
        <div className="fmodes">
          <button className={"fmode" + (mode === "local" ? " cur" : "")} onClick={() => setMode("local")} disabled={!center}>LOCAL{center ? ` · ${center.label.toUpperCase()}` : ""}</button>
          <button className={"fmode" + (mode === "world" ? " cur" : "")} onClick={() => setMode("world")}>WORLD</button>
          <span className="plsep" aria-hidden="true">·</span>
          <button className={"fmode" + (view === "map" ? " cur" : "")} onClick={() => setView("map")}>MAP</button>
          <button className={"fmode" + (view === "list" ? " cur" : "")} onClick={() => setView("list")}>LIST</button>
        </div>
        <div className="fmodes">
          {[["all", "ALL"], ["events", "EVENTS"], ["places", "PLACES"]].map(([k, l]) => (
            <button key={k} className={"fmode" + (dated === k ? " cur" : "")} onClick={() => setDated(k)}>{l}</button>
          ))}
        </div>
        <div className="plkinds">
          <button className={"wchip" + (!kind ? " on" : "")} onClick={() => setKind("")}>EVERY KIND</button>
          {PLACE_KINDS.map((k) => <button key={k} className={"wchip" + (kind === k ? " on" : "")} onClick={() => setKind(kind === k ? "" : k)}>{KIND_LABEL[k]}</button>)}
        </div>
      </div>

      {view === "map" && (
        <div className="plmapwrap">
          <FashionMap mode={center ? mode : "world"} center={center} km={mode === "local" ? 40 : 80} places={places} selectedId={sel} onSelect={setSel} label={center ? center.label : ""} />
          {!center && mode === "local" && <p className="deck">confirm a base city above to centre the local map.</p>}
        </div>
      )}

      <div className="plmeta">
        {data ? `${data.count || 0} ${dated === "events" ? "EVENTS" : dated === "places" ? "PLACES" : "EVENTS AND PLACES"}` : "READING THE MAP…"}
        {data && data.sampleCount > 0 && <> · {data.sampleCount} ARE LABELLED FIXTURES</>}
        {data && data.coverage && <> · {data.coverage.sourced} SOURCED</>}
      </div>

      <ul className="pllist">
        {places.map((p) => (
          <li key={p.id} className={"plcard" + (p.sample ? " sample" : "") + (sel === p.id ? " sel" : "")}>
            <button className="plcardhead" onClick={() => setSel(sel === p.id ? null : p.id)} aria-expanded={sel === p.id}>
              <span className="plkind">{KIND_LABEL[p.kind]}{p.dated ? " · EVENT" : " · PLACE"}</span>
              <span className="plname">{p.name}</span>
              <span className="plwhere">{p.city}{p.distanceKm != null ? ` · ${p.distanceKm} KM` : ""}{p.startsAt ? ` · ${p.startsAt}${p.endsAt && p.endsAt !== p.startsAt ? " → " + p.endsAt : ""}` : ""}</span>
              <span className={"plstatus " + p.status}>{STATUS_LABEL[p.status] || p.status.toUpperCase()}</span>
              {p.sample ? <ModelTag kind="sample">SAMPLE FIXTURE</ModelTag> : <span className="modeltag">SOURCED · CHECKED {p.lastChecked}</span>}
            </button>
            {sel === p.id && (
              <div className="plcardbody">
                <p className="plnote">{p.note}</p>
                <dl className="plprov">
                  <div><dt>ORGANIZER</dt><dd>{p.organizer}</dd></div>
                  <div><dt>ADDRESS</dt><dd>{p.address}</dd></div>
                  <div><dt>TIMEZONE</dt><dd>{p.tz}</dd></div>
                  <div><dt>ADMISSION</dt><dd>{p.admission || "—"}{p.price ? ` · ${p.price}` : ""}</dd></div>
                  <div><dt>IMAGE</dt><dd>{p.imageStatus}</dd></div>
                  <div><dt>SOURCE</dt><dd>{p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer">official page ↗</a> : "none — fixture"}</dd></div>
                </dl>
                <div className="plactions">
                  <SaveButton kind={p.dated ? "event" : "place"} id={p.id} title={p.name} href="/board?tab=places" meta={`${KIND_LABEL[p.kind]} · ${p.city}`} tags={p.tags} />
                  {p.dated && !p.sample && <a className="txtbtn" href={icsFor(p)} download={p.id + ".ics"}>ADD TO CALENDAR</a>}
                  {!p.sample && <a className="txtbtn" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=15/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer">DIRECTIONS ↗</a>}
                  {p.sourceUrl && <a className="txtbtn" href={p.sourceUrl} target="_blank" rel="noreferrer">{p.dated ? "TICKETS / OFFICIAL PAGE ↗" : "OFFICIAL PAGE ↗"}</a>}
                  <button className="txtbtn" onClick={() => queueCorrection(p)}>{corrected === p.id ? "REPORTED — QUEUED ON THIS DEVICE" : "REPORT / CORRECT"}</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {data && places.length === 0 && <li className="empty">nothing in this frame — widen to WORLD, or clear a filter.</li>}
      </ul>

      {showControls && loc && (
        <section className="plcontrols" aria-label="location and privacy">
          <div className="cclbl">LOCATION · PRIVATE BY DEFAULT</div>
          <div className="plctlgrid">
            <div className="plctl">
              <b>BASE CITY</b>
              <span>{loc.baseCity ? `${loc.baseCity.name}${loc.baseCity.country ? ", " + loc.baseCity.country : ""} · confirmed` : "not set"}</span>
              {loc.baseCity && <button className="txtbtn" onClick={clearBaseCity}>CHANGE</button>}
            </div>
            <div className="plctl">
              <b>CURRENT AREA</b>
              <span>{area ? `about ${area.lat}, ${area.lng} · this session only` : "off — nearby discovery uses the base city"}</span>
              {area ? <button className="txtbtn" onClick={clearCurrentArea}>FORGET</button> : <button className="txtbtn" disabled={askingArea} onClick={useArea}>{askingArea ? "ASKING…" : "USE MY CURRENT AREA"}</button>}
            </div>
            <div className="plctl">
              <b>PUBLIC LOCATION</b>
              <label className="plsel">detail
                <select aria-label="public location detail" value={loc.publicDetail} onChange={(e) => setLocation({ publicDetail: e.target.value })}>
                  <option value="none">nothing</option>
                  <option value="country">country only</option>
                  <option value="city">city and country</option>
                  <option value="borough">borough and city</option>
                </select>
              </label>
              {loc.publicDetail === "borough" && <input aria-label="borough" type="text" placeholder="borough" maxLength={40} value={loc.borough} onChange={(e) => setLocation({ borough: e.target.value })} />}
              <label className="plsel">audience
                <select aria-label="who can see your location" value={loc.audience} onChange={(e) => setLocation({ audience: e.target.value })}>
                  <option value="me">only me</option>
                  <option value="followers">followers</option>
                  <option value="everyone">everyone</option>
                </select>
              </label>
              <span className="plpreview">{basedIn ? `shows as “${basedIn}”` : "shows nothing"}</span>
            </div>
            <div className="plctl">
              <b>ON THE MAP</b>
              <label className="plswitch">
                <input type="checkbox" checked={!!loc.mapDiscoverable} onChange={(e) => setLocation({ mapDiscoverable: e.target.checked })} disabled={!loc.baseCity || loc.publicDetail === "none"} />
                discoverable as a coarse city-area creator pin
              </label>
              <span>{loc.publicDetail === "none" ? "needs a public location first" : "never a home, a street, a trail or a live position"}</span>
            </div>
          </div>
          <ModelTag kind="device">STORED ON THIS DEVICE — the server holds no location field yet</ModelTag>
        </section>
      )}
    </div>
  );
}
