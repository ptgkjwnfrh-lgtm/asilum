"use client";

// app/components/WireCard.jsx — a transmission as a card in THE STREAM's
// masonry (V.2 round three): the same column a piece takes, so culture and
// commerce share one flow. A real post carries its byline, its permalink
// and the people-counted LIKE; a sample carries its credit and the SAMPLE
// tag. SAVE is the one save. Tags lead into DISCOVER.

import TransmissionText from "./TransmissionText.jsx";
import SaveButton from "./SaveButton.jsx";
import ModelTag from "./ModelTag.jsx";
import { Avatar } from "./UserBits.jsx";
import { timeAgo } from "../../lib/social.js";
import { WIRE_CATEGORIES, readWireRefs } from "../../lib/model/media.js";

const CAT_LABEL = (id) => (WIRE_CATEGORIES.find((c) => c.id === id) || {}).label || "";

export default function WireCard({ post: p, engagement, onEngage }) {
  const sample = !!p.sample;
  const refs = sample ? { category: p.category, intent: p.intent } : readWireRefs(p.tags || []);
  const image = sample ? p.image : (p.imageUrl ? { src: p.imageUrl, alt: "", credit: "", url: "" } : null);
  const name = sample ? p.name : (p.name || p.handle);
  const eng = !sample && p.serverId != null && engagement ? engagement[String(p.serverId)] : null;
  const href = sample ? "/" : (p.serverId != null ? "/?post=" + encodeURIComponent(p.serverId) : "/");
  return (
    <article className={"card wpostcard" + (sample ? " sample" : "")} aria-label={(sample ? "sample editorial: " : "transmission: ") + (p.title || name)}>
      {image && (
        <figure className="wpcfig">
          <img src={image.src} alt={image.alt || ""} loading="lazy" />
          {image.credit && <figcaption><a href={image.url} target="_blank" rel="noreferrer">{image.credit}</a></figcaption>}
        </figure>
      )}
      <div className="body">
        <div className="wpcby">
          {sample ? <Avatar name={name} /> : <a href={p.mine ? "/profile" : "/u/" + encodeURIComponent(p.handle)}><Avatar name={name} /></a>}
          <span className="wpcwho">
            <b>{name}</b>
            <span>{[refs.intent && refs.intent.toUpperCase(), CAT_LABEL(refs.category), !sample && p.at ? timeAgo(p.at) : null].filter(Boolean).join(" · ")}</span>
          </span>
          {sample ? <ModelTag kind="sample">SAMPLE</ModelTag> : null}
        </div>
        {p.title ? <a className="wposthead wpcttl" href={href}>{p.title}</a> : null}
        <TransmissionText text={p.text} className="wpctext" />
        <div className="cardacts">
          <SaveButton kind="post" id={sample ? p.id : String(p.serverId ?? p.id)} title={p.title || (p.text || "").slice(0, 80)} image={image ? image.src : ""} href={href} meta={name} tags={sample ? p.tags : (p.tags || [])} />
          {eng && (
            <button className={"weng" + (eng.youLike ? " on" : "")} onClick={() => onEngage && onEngage(p, "like")}>LIKE{eng.likes > 0 ? <b> {eng.likes}</b> : null}</button>
          )}
          {(sample ? p.tags : []).slice(0, 2).map((t) => <a key={t} className="txtbtn" href={"/discover?q=" + encodeURIComponent(String(t).toLowerCase())}>{t}</a>)}
        </div>
      </div>
    </article>
  );
}
