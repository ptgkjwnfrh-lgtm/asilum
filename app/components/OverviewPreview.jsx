"use client";

// app/components/OverviewPreview.jsx — the ASiLUM OVERVIEW card in search,
// cut to the primary reference (IMG_0999, V.2 brief, 1 Oct 2026): the
// portrait at the left with the lettering *ASILUM OVERVIEW behind its
// shoulder and a soft fade at its lower edge; the name, the SUMMARY FROM
// <source ↗> line, a compressed readable summary, and READ MORE. On a
// narrow screen the portrait and the text stack. Everything printed comes
// from the sourced record (lib/people/overviews.js) — the reference's own
// sample biography is a picture, not a fact.

import Icon from "./Icons.jsx";

export default function OverviewPreview({ person, onOpen }) {
  if (!person) return null;
  const src = person.sources && person.facts && person.facts[0] ? person.sources[person.facts[0].source] : null;
  const image = person.image ? { src: person.image, alt: (person.imageCredit && person.imageCredit.alt) || person.name } : null;
  return (
    <article className="ovp" aria-label={"ASILUM overview: " + person.name}>
      <div className="ovpport">
        <span className="ovpletter" aria-hidden="true"><i>*</i>ASILUM<br />OVERVIEW</span>
        {image ? <img className="ovpimg" src={image.src} alt={image.alt} loading="lazy" /> : <span className="ovpimg blank" aria-hidden="true" />}
      </div>
      <div className="ovpbody">
        <h3 className="ovpname">{person.name}</h3>
        <p className="ovpsrc">
          SUMMARY FROM {src ? <a href={src.url} target="_blank" rel="noreferrer">{src.publisher.toUpperCase()} ↗</a> : <span>ASILUM</span>}
        </p>
        <p className="ovptext">{person.summary}</p>
        <button className="ovpmore" onClick={onOpen}>Read more <Icon name="chevron" size={16} /></button>
      </div>
    </article>
  );
}
