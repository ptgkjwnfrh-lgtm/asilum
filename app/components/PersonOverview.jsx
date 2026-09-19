"use client";

// Wikipedia text is already a public DTO when it reaches this component.
// Render it as plain text, keep attribution beside the preview, and keep
// relationship controls outside the expand controls (no nested interaction).

import { useId, useState } from "react";
import SaveButton from "./SaveButton.jsx";
import { setFollowBrand, followedBrands } from "../../lib/social.js";
import "./person-overview.css";

const dateLabel = (value) => {
  const match = String(value || "").match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!match) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = match[2] ? months[Number(match[2]) - 1] : null;
  if (match[3] && month) return `${Number(match[3])} ${month} ${match[1]}`;
  return month ? `${month} ${match[1]}` : match[1];
};

function tenure(edge) {
  const start = dateLabel(edge.start);
  const end = dateLabel(edge.end);
  const span = start && end ? `${start}–${end}` : start ? `since ${start}` : end ? `until ${end}` : "dates unresolved";
  return `${edge.role}, ${span}`;
}

function RelatedNameplates({ person, related }) {
  if (!related.length) return null;
  const designer = person.kind === "designer";
  return (
    <nav className="povrelations" aria-label={designer ? `Documented houses for ${person.name}` : `Documented designers for ${person.name}`}>
      <div className="povrelationshead">{designer ? "DOCUMENTED HOUSES" : "DOCUMENTED DESIGNERS"}</div>
      <div className="povplates">
        {related.map((edge) => (
          <a className="povplate" key={edge.id} href={`/discover?q=${encodeURIComponent(edge.queryText)}`}>
            <b>{designer ? edge.house : edge.designer}</b>
            <span>{tenure(edge)}</span>
            <em>{edge.matchingItemCount == null ? "stock not counted" : `${edge.matchingItemCount} matching piece${edge.matchingItemCount === 1 ? "" : "s"}`}</em>
            <small>{edge.queryText}</small>
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function PersonOverview({ person, related = [], compact = false }) {
  if (!person) return null;
  const hasParagraph = Boolean(person.overview?.paragraph);
  if (!hasParagraph && !related.length) return null;
  return <OverviewCard key={person.id} person={person} related={related} compact={compact} hasParagraph={hasParagraph} />;
}

function OverviewCard({ person, related, compact, hasParagraph }) {
  const detailsId = useId();
  const [expanded, setExpanded] = useState(!compact);
  const [following, setFollowing] = useState(() => {
    try { return followedBrands().includes(person.name); } catch { return false; }
  });
  const source = person.sources?.[0] || null;
  const image = person.image || null;
  const house = person.kind === "house";
  const toggle = () => setExpanded((value) => !value);
  const toggleFollow = () => {
    const next = !following;
    setFollowing(next);
    try { setFollowBrand(person.name, next); } catch {}
  };

  return (
    <section className={`pov pov-editorial${compact ? " compact" : ""}${expanded ? " is-expanded" : ""}${house ? " is-house" : ""}`} aria-label={`${person.kind} overview: ${person.name}`}>
      {hasParagraph ? (
        <>
          <div className="povflow">
            <figure className="povimg">
              <button type="button" className="povportrait" aria-label={`${expanded ? "Collapse" : "Read"} overview of ${person.name}`} aria-expanded={expanded} aria-controls={detailsId} onClick={toggle}>
                {image ? <img src={image.url} alt={image.alt || person.name} loading="lazy" /> : <span className="povmono" aria-hidden="true">{person.name.slice(0, 1)}</span>}
                <span className="povmasthead" aria-hidden="true"><b>*</b>ASILUM<br /><span>OVERVIEW</span></span>
              </button>
              {image ? <a className="povcredit" href={image.sourceUrl} target="_blank" rel="noreferrer">{image.credit} · {image.rights}</a> : null}
            </figure>
            <div className="povbody">
              <div className="povkick">WIKIPEDIA · {person.kind === "house" ? "FASHION HOUSE" : "DESIGNER"}</div>
              <h2 className="povname"><button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={toggle}>{person.name}</button></h2>
              {person.overview.language !== "en" ? <div className="povlanguage">ARTICLE LANGUAGE · {person.overview.languageLabel}</div> : null}
              <p id={detailsId} className="povsum">{person.overview.paragraph}</p>
              <button className="txtbtn povread" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={toggle}>{expanded ? "Read less −" : "Read full paragraph +"}</button>
              {source ? (
                <div className="povattribution">
                  <span>Wikipedia contributors</span>
                  <span aria-hidden="true"> · </span><a href={source.articleUrl} target="_blank" rel="noreferrer">Read article</a>
                  <span aria-hidden="true"> · </span><a href={source.licenseUrl} target="_blank" rel="noreferrer">License</a>
                  <details>
                    <summary>Revision and extraction details</summary>
                    <dl>
                      <div><dt>Revision</dt><dd><a href={source.revisionUrl} target="_blank" rel="noreferrer">{source.revisionId}</a> · <a href={source.historyUrl} target="_blank" rel="noreferrer">history</a></dd></div>
                      <div><dt>Retrieved</dt><dd>{person.overview.fetchedAt.slice(0, 10)}</dd></div>
                      <div><dt>Excerpt</dt><dd>one complete introductory paragraph</dd></div>
                      <div><dt>Modifications</dt><dd>{person.overview.editorialModifications.join("; ") || "none"}</dd></div>
                    </dl>
                  </details>
                </div>
              ) : null}
            </div>
          </div>
          <div className="povfooter">
            <div className="povacts">
              <SaveButton kind="person" id={person.id} title={person.name} image={image?.url || null} href={`/discover?q=${encodeURIComponent(person.name)}`} meta={`Wikipedia ${person.kind}`} tags={[]} />
              <button className={`followbtn${following ? " on" : ""}`} aria-pressed={following} onClick={toggleFollow}>{following ? "FOLLOWING" : "FOLLOW"}</button>
              <a className="txtbtn" href={`/discover?q=${encodeURIComponent(person.name)}`}>PIECES →</a>
            </div>
          </div>
        </>
      ) : null}
      <RelatedNameplates person={person} related={related} />
    </section>
  );
}
