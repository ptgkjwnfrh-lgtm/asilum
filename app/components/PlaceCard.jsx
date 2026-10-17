"use client";

// app/components/PlaceCard.jsx — THE PLACE CARD (V.2 Blueprint, owner, 17
// Oct 2026, Foundations: "PLACE expands in place inside the Feed with a
// sourced description, rating, distance and a MAPS link"; the weight target
// is 20%, so the card is compact until opened).
//
// The record is lib/places/registry.js, read through /api/places: two
// sourced rows and labelled fixtures, nothing scraped. Honesty: a rating
// exists for no place (no review source is wired) and is not drawn; the
// distance is printed only when the device has shared its position to the
// map (lib/location.js); a sample fixture says SAMPLE FIXTURE; the
// description is the record's own note and organizer, and the source link
// is the public listing.

import { useState } from "react";
import { haptic } from "../../lib/haptics.js";
import Icon from "./Icons.jsx";

function km(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function PlaceCard({ place: p, here = null }) {
  const [open, setOpen] = useState(false);
  const d = km(here, p);
  const when = p.dated && p.startsAt ? p.startsAt + (p.endsAt && p.endsAt !== p.startsAt ? " → " + p.endsAt : "") : null;
  return (
    <article className={"card placecard" + (open ? " open" : "")} data-id={"place:" + p.id} data-type="PLACE" aria-label={"place: " + p.name}>
      <button type="button" className="placehead" aria-expanded={open} onClick={() => { haptic("press"); setOpen((o) => !o); }}>
        <span className="typechip">PLACE</span>
        <b className="placename">{p.name}</b>
        <span className="placemeta">{String(p.kind || "").toUpperCase()} · {p.city}{when ? " · " + when : ""}{p.sample ? " · SAMPLE FIXTURE" : ""}</span>
        <span className="placeexp" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="placebody">
          {p.organizer ? <p className="placedesc">{p.organizer}</p> : null}
          {p.note ? <p className="placedesc fine">{p.note}</p> : null}
          {p.address ? <p className="placeline"><Icon name="locate" size={14} /> {p.address}</p> : null}
          {d != null ? <p className="placeline">{d < 1 ? "under a kilometre away" : Math.round(d) + " km away"}</p> : null}
          {p.admission ? <p className="placeline">admission · {p.admission}</p> : null}
          <div className="placeacts">
            <a className="txtbtn" href={"/map?pin=" + encodeURIComponent(p.id)}>MAPS →</a>
            {p.sourceUrl ? <a className="txtbtn" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">THE LISTING ↗</a> : <span className="fine">no public listing to link</span>}
          </div>
        </div>
      ) : null}
    </article>
  );
}
