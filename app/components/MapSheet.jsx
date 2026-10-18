"use client";
// app/components/MapSheet.jsx — THE MAP POPUP (V.2 5.5; slice 12): a BRDCST's
// event opens the Passport Map above the post as a popup, never a page away.
// The pinned place is the registry's row; the ring is 30 km around it; the
// other registry places inside the ring ride along. "I WAS THERE" files an
// attendance claim (17.19) with the browser's coarse area if one is on hand —
// the server decides whether the record substantiates it.

import { useEffect, useState } from "react";
import FashionMap from "./FashionMap.jsx";
import { listPlaces } from "../../lib/places/registry.js";
import { getCurrentArea } from "../../lib/location.js";
import { postJSON, getUid } from "../../lib/client.js";
import { haptic } from "../../lib/haptics.js";

export default function MapSheet({ pin = null }) {
  const place = pin ? listPlaces().find((p) => p.id === pin) || null : null;
  const [sel, setSel] = useState(pin);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSel(pin); }, [pin]);
  if (!place) return <p className="srchfine" role="status">no place on record for this pin.</p>;
  const center = { lat: place.lat, lng: place.lng };
  const near = listPlaces({ near: { lat: place.lat, lng: place.lng, km: 30 } });
  const places = near.some((p) => p.id === place.id) ? near : [place, ...near];
  const started = place.startsAt ? Date.parse(place.startsAt + "T00:00:00Z") - 86_400_000 <= Date.now() : false;
  async function wasThere() {
    if (busy) return;
    setBusy(true); setNote("");
    haptic("press");
    const area = getCurrentArea();
    const res = await postJSON("/api/passport/attendance", { user: getUid(), eventId: place.id, area: area && Number.isFinite(area.lat) ? { lat: area.lat, lng: area.lng, at: area.at || Date.now() } : null }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res || !res.ok) { setNote((d && d.error) || "the claim did not save"); return; }
    setNote(d.record.status === "substantiated" ? `WENT · substantiated — ${d.record.evidence[0].note}` : `WENT · claimed — ${d.record.reason}`);
  }
  return (
    <div className="mapsheet">
      <FashionMap mode="local" center={center} km={30} places={places} selectedId={sel} onSelect={setSel} label={place.city || place.name} />
      <div className="mapsheetrow">
        <b>{place.name}</b>
        <span className="fine">{[place.kind ? String(place.kind).toUpperCase() : null, place.city, place.startsAt ? place.startsAt + (place.endsAt && place.endsAt !== place.startsAt ? " → " + place.endsAt : "") : null, place.sample ? "SAMPLE FIXTURE" : null].filter(Boolean).join(" · ")}</span>
        {place.address ? <span className="fine">{place.address}</span> : null}
      </div>
      <div className="mapsheetacts">
        <a className="txtbtn" href={"/map?pin=" + encodeURIComponent(place.id)}>THE FULL MAP →</a>
        {place.sourceUrl ? <a className="txtbtn" href={place.sourceUrl} target="_blank" rel="noopener noreferrer">THE ORGANIZER ↗</a> : null}
        {place.dated && !place.sample && started ? <button type="button" className="txtbtn" disabled={busy} onClick={wasThere}>I WAS THERE ✓</button> : null}
      </div>
      {note ? <p className="fine" role="status">{note}</p> : null}
    </div>
  );
}
