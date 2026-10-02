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

const LAYOUT_WORD = { single: "", carousel: "CAROUSEL", fragment: "WARDROBE FRAGMENT", expose: "EXPOSÉ", event: "EVENT" };

/** The composition's attachments (V.2 brief §6), rendered by layout. Every
 *  image carries the author's alt; an exposé's layers are text over the
 *  image AND a readable caption beneath it; pieces, the event and the link
 *  are the snapshots the server stored — never fetched HTML. */
function Attachments({ p }) {
  const a = p.attachments || {};
  const media = Array.isArray(a.media) ? a.media : [];
  const urls = media.map((m) => m.url || (p.imageUrl && media.indexOf(m) === 0 ? p.imageUrl : null)).filter(Boolean);
  const layout = p.layout || (media.length > 1 ? "carousel" : media.length ? "single" : null);
  return (
    <>
      {layout === "expose" && urls[0] && (
        <figure className="wpcfig wpcexpose">
          <img src={urls[0]} alt={media[0].alt || a.alt || ""} loading="lazy" />
          {(a.layers || []).map((l, i) => (
            <span key={i} className={`wpclayer pos-${l.position || "bottom"} al-${l.align || "left"} col-${l.color || "paper"} f-${l.font || "display"}`} aria-hidden="true">{l.text}</span>
          ))}
          <figcaption className="wpclayercap">{(a.layers || []).map((l) => l.text).join(" · ")}</figcaption>
        </figure>
      )}
      {(layout === "single" || (layout === "event" && urls.length === 1)) && urls[0] && layout !== "expose" && (
        <figure className="wpcfig"><img src={urls[0]} alt={media[0] && media[0].alt || a.alt || ""} loading="lazy" /></figure>
      )}
      {layout === "carousel" && urls.length > 0 && (
        <div className="wpccarousel" role="group" aria-label={`${urls.length} images`}>
          {urls.map((u, i) => <img key={u} src={u} alt={media[i] && media[i].alt || ""} loading="lazy" />)}
          <span className="wpccount" aria-hidden="true">{urls.length}</span>
        </div>
      )}
      {Array.isArray(a.pieces) && a.pieces.length > 0 && (
        <ul className={"wpcpieces" + (layout === "fragment" ? " fragment" : "")} aria-label="tagged pieces">
          {a.pieces.map((pc) => (
            <li key={pc.id}>
              <a href={"/?item=" + encodeURIComponent(pc.id)}>
                {pc.img ? <img src={pc.img} alt="" loading="lazy" /> : <span className="wpcpieceblank" aria-hidden="true" />}
                <b>{pc.brand}</b><span>{pc.title}</span>{pc.price != null ? <i>{pc.currency || "USD"} {pc.price}</i> : null}
              </a>
            </li>
          ))}
        </ul>
      )}
      {a.event && (
        <a className="wpcevent" href={"/map?pin=" + encodeURIComponent(a.event.id)}>
          <span className="cclbl">EVENT · {String(a.event.kind || "").toUpperCase()}{a.event.sample ? " · SAMPLE FIXTURE" : ""}</span>
          <b>{a.event.name}</b>
          <span>{a.event.city}{a.event.startsAt ? " · " + a.event.startsAt : ""}{a.event.endsAt && a.event.endsAt !== a.event.startsAt ? " → " + a.event.endsAt : ""}{a.event.status ? " · " + String(a.event.status).toUpperCase() : ""}</span>
        </a>
      )}
      {a.link && (
        <a className="wpclink" href={a.link.url} target="_blank" rel="noreferrer">
          {a.link.image ? <img src={a.link.image} alt="" loading="lazy" /> : null}
          <span className="wpclinkbody"><span className="cclbl">{a.link.site || a.link.host} ↗</span><b>{a.link.title || a.link.url}</b>{a.link.description ? <span>{a.link.description}</span> : null}</span>
        </a>
      )}
    </>
  );
}

export default function WireCard({ post: p, engagement, onEngage }) {
  const sample = !!p.sample;
  const refs = sample ? { category: p.category, intent: p.intent } : readWireRefs(p.tags || []);
  const composed = !sample && p.attachments && Object.keys(p.attachments).length > 0;
  const image = sample ? p.image : (!composed && p.imageUrl ? { src: p.imageUrl, alt: "", credit: "", url: "" } : null);
  const name = sample ? p.name : (p.name || p.handle);
  const eng = !sample && p.serverId != null && engagement ? engagement[String(p.serverId)] : null;
  const href = sample ? "/" : (p.serverId != null ? "/?post=" + encodeURIComponent(p.serverId) : "/");
  return (
    <article className={"card wpostcard" + (sample ? " sample" : "")} data-id={"post:" + (p.serverId ?? p.id)} aria-label={(sample ? "sample editorial: " : "transmission: ") + (p.title || name)}>
      {composed && <Attachments p={p} />}
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
            <span>{[refs.intent && refs.intent.toUpperCase(), CAT_LABEL(refs.category), !sample && p.layout && LAYOUT_WORD[p.layout] ? LAYOUT_WORD[p.layout] : null, !sample && p.at ? timeAgo(p.at) : null].filter(Boolean).join(" · ")}</span>
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
