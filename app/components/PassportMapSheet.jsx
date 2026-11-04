"use client";

// app/components/PassportMapSheet.jsx — OPEN MAP (owner, 3 Nov 2026: "a window view of apple maps with
// asilums colors. i want to interact with apple maps via asilum. scrolling it should show me events near me and
// clicking on the events should zip the map to the location … cause a footer pop up to come up and open and
// have a cool design of a event ticket and a button to take them to ticket master"). The PASSPORT MAP popup
// (SheetHost VIEWS):
//   the window   Apple's map (MapKit JS, PlaceMap.jsx, tone "asilum" — the owner's own setting: standard,
//                flat, no points of interest, light, the passenger's dot, the scale, each place a black label in
//                white monospaced type); pan and zoom it by hand. Without a MapKit key (owner: "welp im broke"),
//                the free street map — real OpenStreetMap roads for the passenger's area (StreetMap.jsx, the
//                same tone), and the schematic only where no roads can be read. Centred on the passenger's current area or base city (lib/location.js), else the world
//                with a city picker under it.
//   NEAR YOU     the events around that centre (/api/places, dated): Ticketmaster's live listings where this
//                deploy holds the key, the register's rows, its labelled fixtures said to be fixtures
//   an event     tapped: the map flies to it and its TICKET rises from the foot — the event as a ticket stub,
//                and TICKETMASTER ↗ to the event's own Ticketmaster page (a plain link: ASILUM sells nothing
//                here); a register row links its own source instead, a fixture links nothing and says so.

import { useEffect, useMemo, useState } from "react";
import PlaceMap, { useMapkitGate } from "./PlaceMap.jsx";
import StreetMap from "./StreetMap.jsx";
import { useRoads } from "./ParisMap.jsx";
import { discoveryCenter, confirmBaseCity } from "../../lib/location.js";
import { CITIES } from "../../lib/places/registry.js";
import { ocr } from "../../lib/passport/document.js";
import { haptic } from "../../lib/haptics.js";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function dayOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? { d: m[3], m: MON[+m[2] - 1], y: m[1].slice(2) } : null;
}
const serial = (id) => { let h = 2166136261; for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return String((h >>> 0) % 1000000).padStart(6, "0"); };

function Ticket({ ev, onClose }) {
  const day = dayOf(ev.startsAt);
  const ticketmaster = ev.live && ev.sourceUrl;
  const href = ticketmaster || (!ev.sample && ev.sourceUrl) || null;
  return (
    <div className="pmticket" role="dialog" aria-label={`ticket — ${ev.name}`}>
      <div className="pmticketmain">
        <span className="pmticketkind">{ocr(`ADMIT ONE · ${String(ev.kind || "event").toUpperCase()}`)}</span>
        <b className="pmticketname">{ev.name}</b>
        <span className="pmticketvenue">{ev.address || ev.city || ""}</span>
        <span className="pmticketrow">
          {day && <span><i>DATE</i>{ocr(`${day.d} ${day.m} ${day.y}`)}</span>}
          {ev.time && <span><i>DOORS</i>{ocr(ev.time)}</span>}
          {ev.price && <span><i>FROM</i>{ev.price}</span>}
        </span>
        {ev.sample && <span className="pmticketnote">a sample fixture — no tickets exist for it.</span>}
        <span className="pmticketkeys">
          {href ? <a className="ppbtn primary" href={href} target="_blank" rel="noopener noreferrer">{ticketmaster ? "TICKETMASTER ↗" : "THE LISTING ↗"}</a> : null}
          <button className="ppbtn" onClick={onClose}>CLOSE</button>
        </span>
      </div>
      <div className="pmticketstub" aria-hidden="true">
        <span className="pmticketno">{ocr("N0 " + serial(ev.id))}</span>
        <span className="pmticketbars">{serial(ev.id + "b").split("").map((n, i) => <i key={i} style={{ width: `${1 + (+n % 3)}px` }} />)}</span>
      </div>
    </div>
  );
}

export default function PassportMapSheet() {
  const [centre, setCentre] = useState(null);
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [city, setCity] = useState(Object.keys(CITIES)[0]);

  useEffect(() => {
    const sync = () => setCentre(discoveryCenter());
    sync();
    window.addEventListener("asilum:location", sync);
    return () => window.removeEventListener("asilum:location", sync);
  }, []);
  useEffect(() => {
    const qs = new URLSearchParams({ dated: "1" });
    if (centre) { qs.set("lat", centre.lat); qs.set("lng", centre.lng); qs.set("km", "80"); }
    fetch("/api/places?" + qs.toString()).then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d || { places: [] })).catch(() => setData({ places: [], error: true }));
  }, [centre && centre.lat, centre && centre.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const gate = useMapkitGate();          // "apple" when this deploy holds a MapKit key
  const roads = useRoads(centre);       // the free street map's own roads, when it is not
  // the roads come from the public Overpass service; when it cannot answer, Paris still has the copy the app
  // ships (public/paris-roads.json), so a Paris centre keeps its streets
  const paris = roads.paris && roads.paris.center && centre ? Math.hypot(centre.lat - roads.paris.center[0], (centre.lng - roads.paris.center[1]) * Math.cos((centre.lat * Math.PI) / 180)) < 0.06 : false;
  const streets = roads.own ? roads.map : paris ? roads.paris : null;
  const events = useMemo(() => ((data && data.places) || []).filter((p) => p.dated), [data]);
  const ev = sel ? events.find((p) => p.id === sel) : null;
  const focus = ev && Number.isFinite(ev.lat) ? { lat: ev.lat, lng: ev.lng } : centre;
  const choose = (id) => { haptic("tick"); setSel(id); };

  return (
    <section className={"pmsheet" + (ev ? " ticketed" : "")} aria-label="map">
      <div className="pmwin">
        {gate !== "apple" && centre && (streets || roads.loading) ? (
          <StreetMap map={streets} centre={centre} places={events} selectedId={sel} onSelect={choose} height={360} tone="asilum" />
        ) : (
          <PlaceMap mode={focus ? "local" : "world"} center={focus} km={ev ? 3 : 40} places={events} selectedId={sel} onSelect={choose}
            label={ev ? ev.name : centre ? centre.label : ""} tone="asilum" />
        )}
        <span className="pmcorner" aria-hidden="true">{ocr(ev ? (ev.city || ev.name).toUpperCase() : centre ? String(centre.label).toUpperCase() : "THE WORLD")}</span>
      </div>

      <h4 className="pmhead">{centre ? "NEAR YOU" : "EVENTS"} <i>{ocr(String(events.length).padStart(2, "0"))}</i></h4>
      {!centre && (
        <div className="pmcity">
          <span className="pmnote">choose your city and this shows what is on near you —</span>
          <select aria-label="your base city" value={city} onChange={(e) => setCity(e.target.value)}>{Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <button className="txtbtn" onClick={() => confirmBaseCity(city)}>CONFIRM ✓</button>
        </div>
      )}
      {data && data.live && !data.live.enabled && <p className="pmnote">{data.live.reason || "live listings are off on this deploy"}.</p>}
      {data && events.length === 0 && <p className="pmnote">nothing listed near here right now.</p>}
      <ul className="pmlist">
        {events.map((p) => {
          const day = dayOf(p.startsAt);
          return (
            <li key={p.id}>
              <button className={"pmrow" + (p.id === sel ? " cur" : "")} onClick={() => choose(p.id)}>
                <span className="pmday">{day ? <><b>{ocr(day.d)}</b><i>{day.m}</i></> : <b>—</b>}</span>
                <span className="pmrowbody">
                  <b>{p.name}</b>
                  <span>{[p.city, p.live ? "TICKETMASTER" : p.sample ? "SAMPLE FIXTURE" : String(p.kind || "").toUpperCase()].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {ev && <Ticket ev={ev} onClose={() => setSel(null)} />}
    </section>
  );
}
