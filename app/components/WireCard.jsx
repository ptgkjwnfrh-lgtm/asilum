"use client";

// app/components/WireCard.jsx — a post as a card in THE ONE FEED (V.2
// Blueprint, owner, 17 Oct 2026: "There is no Wire"; the six publishing
// types). The card wears its type — TRANSM · STILL · MOTION · BRDCST —
// read from what it carries (lib/feed/types.js postType), the same column
// a LISTING takes, and a STILL or MOTION takes the full width (Tetris
// weight 70%). Tapping the media enlarges it over the Feed (MediaFloat,
// the "media" popup). A post that carries an event wears the BRDCST
// FOOTER: collapsed to the title and the date with a discreet expander
// (5.2); expanded inline, downward, staying attached to the post (5.3),
// with the essentials, the map shortcut and the tickets link to the
// organizer's own site (5.4–5.6). A real post carries its byline, its
// permalink and the people-counted LIKE; a sample carries its credit and
// the SAMPLE tag. STAMP is the one save.

import { useEffect, useRef, useState } from "react";
import TransmissionText from "./TransmissionText.jsx";
import SaveButton from "./SaveButton.jsx";
import ModelTag from "./ModelTag.jsx";
import Icon from "./Icons.jsx";
import { Avatar, FriendName } from "./UserBits.jsx";
import { timeAgo } from "../../lib/social.js";
import { readWireRefs } from "../../lib/model/media.js";
import { registerFeedVideo, feedPolicy } from "../../lib/media/feedplay.js";
import { footerPages } from "../../lib/brdcst/index.js";
import { postType } from "../../lib/feed/types.js";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";
import TagRow from "./TagChip.jsx";
import { tagsFor, visibleTags } from "../../lib/tagging/grammar.js";

const LAYOUT_WORD = { single: "", carousel: "CAROUSEL", fragment: "WARDROBE FRAGMENT", expose: "EXPOSÉ", event: "" };

const STATE_WORD = { draft: "DRAFT · UNPAID", scheduled: "SCHEDULED", active: "LIVE", ended: "ENDED", cancelled: "CANCELLED", under_review: "UNDER REVIEW" };

/** One event inside the footer: collapsed to its title and date until tapped (5.11). */
function BrdcstEvent({ event, open, onToggle }) {
  const when = event.startsAt ? event.startsAt + (event.endsAt && event.endsAt !== event.startsAt ? " → " + event.endsAt : "") : "";
  return (
    <li className={"brdcstev" + (open ? " open" : "")}>
      <button type="button" className="brdcstevhead" aria-expanded={open} onClick={() => { haptic("press"); onToggle(); }}>
        <b>{event.name}</b>
        <span className="brdcstwhen">{when}{event.sample ? " · SAMPLE FIXTURE" : ""}</span>
      </button>
      {open ? (
        <div className="brdcstbody">
          <span className="fine">{String(event.kind || "").toUpperCase()}{event.city ? " · " + event.city : ""}{event.status ? " · " + String(event.status).toUpperCase() : ""}{event.admission ? " · " + event.admission : ""}</span>
          <div className="brdcstacts">
            <a className="txtbtn" href={"/map?pin=" + encodeURIComponent(event.id)}>PASSPORT MAP →</a>
            {event.sourceUrl ? <a className="txtbtn" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">TICKETS · THE ORGANIZER ↗</a> : <span className="fine">tickets: no organizer link on record</span>}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The BRDCST footer (blueprint 5.2–5.6, 5.10–5.12; slice 8): the white is
 * the post, the broadcast hangs from it. Collapsed: the soonest event's
 * title and date, "+N" when more ride along, the expander. Expanded: five
 * soonest-first, each collapsed until tapped, the next five on a discreet
 * control. `brdcst` is the server's delivery note — the author sees the
 * campaign's state; a reader in reach sees the radius.
 */
export function BrdcstFooter({ event, events = null, brdcst = null }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState(null);
  const all = Array.isArray(events) && events.length ? events : event ? [event] : [];
  if (!all.length) return null;
  const pages = footerPages(all, { page });
  const first = pages.visible[0] || all[0];
  const when = first.startsAt ? first.startsAt + (first.endsAt && first.endsAt !== first.startsAt ? " → " + first.endsAt : "") : "";
  const meta = brdcst ? (brdcst.yours ? (STATE_WORD[brdcst.state] || String(brdcst.state).toUpperCase()) + (brdcst.radiusMi ? ` · ${brdcst.radiusMi} MI` : "") : brdcst.radiusMi ? `BRDCST: ${brdcst.radiusMi} MI` : null) : null;
  return (
    <div className={"brdcst" + (open ? " open" : "")}>
      <button type="button" className="brdcsthead" aria-expanded={open} onClick={() => { haptic("press"); setOpen((o) => !o); }}>
        <span className="typechip brd">BRDCST{pages.more > 0 ? ` +${pages.more}` : ""}</span>
        <b>{first.name}</b>
        <span className="brdcstwhen">{when}{first.sample ? " · SAMPLE FIXTURE" : ""}{meta ? " · " + meta : ""}</span>
        <span className="brdcstexp" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <ul className="brdcstlist" aria-label={`${pages.total} event${pages.total === 1 ? "" : "s"}`}>
          {pages.visible.map((ev) => <BrdcstEvent key={ev.id} event={ev} open={openId === ev.id || (pages.total === 1)} onToggle={() => setOpenId(openId === ev.id ? null : ev.id)} />)}
          {pages.pages > 1 ? (
            <li className="brdcstpage">
              <span className="fine">{pages.page + 1}/{pages.pages}</span>
              {pages.page > 0 ? <button type="button" className="txtbtn" onClick={() => setPage(pages.page - 1)}>← PREVIOUS FIVE</button> : null}
              {pages.next ? <button type="button" className="txtbtn" onClick={() => setPage(pages.page + 1)}>NEXT FIVE →</button> : null}
            </li>
          ) : null}
          {brdcst && brdcst.yours && brdcst.state === "draft" ? <li className="brdcstpage"><a className="txtbtn" href="/board?tab=studio">PAY THE BRDCST IN THE STUDIO →</a></li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** A MOTION in the Feed (slice 9, 3.3): muted adaptive autoplay — the most
 *  visible plays, the others pause, captions during muted autoplay, nothing
 *  when the passenger or the platform says no (lib/media/feedplay.js). The
 *  tap enlarges it into the housing. A generated sample says so. */
function MotionMedia({ video, id, onMedia, label }) {
  const ref = useRef(null);
  const [policy, setPolicy] = useState(null);
  useEffect(() => { setPolicy(feedPolicy()); return registerFeedVideo(ref.current, id); }, [id]);
  const trackSrc = (tr) => (video.generated ? tr.src : `/api/editorial/motion?captions=${encodeURIComponent(video.id)}&lang=${encodeURIComponent(tr.lang)}`);
  return (
    <figure className="wpcfig wpcmotion">
      <button type="button" className="wpcmedia" onClick={onMedia} aria-label={label || "open the motion"}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={ref} src={video.url} poster={video.poster || undefined} muted playsInline loop preload="metadata" aria-label={label || "motion"} data-rotation={video.rotation || 0}>
          {(video.captions || []).map((tr) => <track key={tr.lang} kind="captions" srcLang={tr.lang} label={tr.label || tr.lang} src={trackSrc(tr)} />)}
        </video>
        <span className="wpcmotiontag" aria-hidden="true">MOTION · {Math.round((video.durationMs || 0) / 1000)}s{policy && !policy.autoplay ? " · " + policy.reason : ""}</span>
      </button>
      {video.generated ? <figcaption>SAMPLE MOTION · GENERATED TEST PATTERN, NO SOUND</figcaption> : null}
    </figure>
  );
}

/** The composition's attachments, rendered by layout. Every image carries
 *  the author's alt; an exposé's layers are text over the image AND a
 *  readable caption beneath it; pieces, the event and the link are the
 *  snapshots the server stored — never fetched HTML. */
function Attachments({ p, onMedia }) {
  const a = p.attachments || {};
  const media = Array.isArray(a.media) ? a.media : [];
  const urls = media.map((m) => m.url || (p.imageUrl && media.indexOf(m) === 0 ? p.imageUrl : null)).filter(Boolean);
  const layout = p.layout || (media.length > 1 ? "carousel" : media.length ? "single" : null);
  return (
    <>
      {a.video && a.video.url && <MotionMedia video={a.video} id={p.serverId ?? p.id} onMedia={onMedia} label={"open the motion: " + (p.title || "")} />}
      {layout === "expose" && urls[0] && (
        <figure className="wpcfig wpcexpose">
          <button type="button" className="wpcmedia" onClick={onMedia} aria-label="enlarge the photograph"><img src={urls[0]} alt={media[0].alt || a.alt || ""} loading="lazy" /></button>
          {(a.layers || []).map((l, i) => (
            <span key={i} className={`wpclayer pos-${l.position || "bottom"} al-${l.align || "left"} col-${l.color || "paper"} f-${l.font || "display"}`} aria-hidden="true">{l.text}</span>
          ))}
          <figcaption className="wpclayercap">{(a.layers || []).map((l) => l.text).join(" · ")}</figcaption>
        </figure>
      )}
      {(layout === "single" || (layout === "event" && urls.length === 1)) && urls[0] && layout !== "expose" && (
        <figure className="wpcfig"><button type="button" className="wpcmedia" onClick={onMedia} aria-label="enlarge the photograph"><img src={urls[0]} alt={media[0] && media[0].alt || a.alt || ""} loading="lazy" /></button></figure>
      )}
      {layout === "carousel" && urls.length > 0 && (
        <div className="wpccarousel" role="group" aria-label={`${urls.length} images`}>
          {urls.map((u, i) => <button key={u} type="button" className="wpcmedia" onClick={onMedia} aria-label={"enlarge photograph " + (i + 1)}><img src={u} alt={media[i] && media[i].alt || ""} loading="lazy" /></button>)}
          <span className="wpccount" aria-hidden="true">{urls.length}</span>
        </div>
      )}
      {Array.isArray(a.pieces) && a.pieces.length > 0 && (
        <ul className={"wpcpieces" + (layout === "fragment" ? " fragment" : "")} aria-label="tagged pieces">
          {a.pieces.map((pc) => (
            <li key={pc.id}>
              <button type="button" onClick={() => openSheet("listing", { id: pc.id, title: "LISTING" })}>
                {pc.img ? <img src={pc.img} alt="" loading="lazy" /> : <span className="wpcpieceblank" aria-hidden="true" />}
                <b>{pc.brand}</b><span>{pc.title}</span>{pc.price != null ? <i>{pc.currency || "USD"} {pc.price}</i> : null}
              </button>
              <TagRow tags={visibleTags(tagsFor(pc)).shown} size="card" />
            </li>
          ))}
        </ul>
      )}
      {a.link && (
        <a className="wpclink" href={a.link.url} target="_blank" rel="noreferrer">
          {a.link.image ? <img src={a.link.image} alt="" loading="lazy" /> : null}
          <span className="wpclinkbody"><span className="cclbl">{a.link.site || a.link.host} ↗</span><b>{a.link.title || a.link.url}</b>{a.link.description ? <span>{a.link.description}</span> : null}</span>
        </a>
      )}
      {(a.event || (a.events && a.events.length)) && <BrdcstFooter event={a.event} events={a.events} brdcst={a.brdcst || null} />}
    </>
  );
}

export default function WireCard({ post: p, engagement, onEngage }) {
  const sample = !!p.sample;
  const type = postType(p);
  const refs = sample ? { category: p.category, intent: p.intent } : readWireRefs(p.tags || []);
  const composed = !sample && p.attachments && Object.keys(p.attachments).length > 0;
  const image = sample ? p.image : (!composed && p.imageUrl ? { src: p.imageUrl, alt: "", credit: "", url: "" } : null);
  const name = sample ? p.name : (p.name || p.handle);
  const eng = !sample && p.serverId != null && engagement ? engagement[String(p.serverId)] : null;
  const href = sample ? "/" : (p.serverId != null ? "/?post=" + encodeURIComponent(p.serverId) : "/");
  const onMedia = (type === "STILL" || type === "MOTION") ? () => { haptic("press"); openSheet("media", sample ? { id: p.id, sample: true, title: type } : { id: p.serverId, title: type }); } : undefined;
  return (
    <article className={"card wpostcard type-" + type.toLowerCase() + (sample ? " sample" : "")} data-id={"post:" + (p.serverId ?? p.id)} data-type={type} aria-label={type.toLowerCase() + (sample ? " (sample editorial): " : ": ") + (p.title || name)}>
      {composed && <Attachments p={p} onMedia={onMedia} />}
      {sample && p.video && <MotionMedia video={p.video} id={p.id} onMedia={onMedia} label={"open the sample motion: " + (p.title || "")} />}
      {image && !p.video && (
        <figure className="wpcfig">
          <button type="button" className="wpcmedia" onClick={onMedia} aria-label="enlarge the photograph"><img src={image.src} alt={image.alt || ""} loading="lazy" /></button>
          {image.credit && <figcaption><a href={image.url} target="_blank" rel="noreferrer">{image.credit}</a></figcaption>}
        </figure>
      )}
      <div className="body">
        <div className="wpcby">
          {sample ? <Avatar name={name} /> : <a href={p.mine ? "/profile" : "/u/" + encodeURIComponent(p.handle)}><Avatar name={name} /></a>}
          <span className="wpcwho">
            <b>{sample ? name : <FriendName handle={p.handle}>{name}</FriendName>}</b>
            <span><span className="typechip">{type}</span>{[refs.intent && refs.intent.toUpperCase(), !sample && p.layout && LAYOUT_WORD[p.layout] ? LAYOUT_WORD[p.layout] : null, !sample && p.at ? timeAgo(p.at) : null].filter(Boolean).map((s) => " · " + s).join("")}</span>
          </span>
          {sample ? <ModelTag kind="sample">SAMPLE</ModelTag> : null}
        </div>
        {p.title ? <a className="wposthead wpcttl" href={href}>{p.title}</a> : null}
        <TransmissionText text={p.text} className="wpctext" />
        <div className="cardacts">
          <SaveButton kind="post" id={sample ? p.id : String(p.serverId ?? p.id)} title={p.title || (p.text || "").slice(0, 80)} image={image ? image.src : ""} href={href} meta={name} tags={sample ? p.tags : (p.tags || [])} labels={["STAMP", "STAMPED ✓"]} />
          {eng && (
            <button className={"weng" + (eng.youLike ? " on" : "")} onClick={() => onEngage && onEngage(p, "like")}><Icon name="heart" size={14} /> LIKE{eng.likes > 0 ? <b> {eng.likes}</b> : null}</button>
          )}
          {(sample ? p.tags : []).slice(0, 2).map((t) => <a key={t} className="txtbtn" href={"/discover?q=" + encodeURIComponent(String(t).toLowerCase())}>{t}</a>)}
        </div>
      </div>
    </article>
  );
}
