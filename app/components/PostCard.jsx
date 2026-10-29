"use client";

// app/components/PostCard.jsx — a post as a card in THE ONE FEED (V.2
// Blueprint, owner, 17 Oct 2026: "There is no Wire"; the six publishing
// types), drawn to the owner's post sketch of 25 Oct 2026 (IMG_1143; see
// PostCard below): the author's circle and name over a red rule, the media,
// the caption folded into blocks, and four blue counted actions — the
// heart (LIKE), the comment bubble, the stamp (STAMP, the one save) and the
// share arrow — over a red rule. A post that
// carries an event wears the BRDCST FOOTER hanging from the card, exactly as
// drawn: BRDCST large at the left, the date and time at the right, a rule,
// then "*event name" with a chevron that expands it inline, downward,
// staying attached to the post (5.2–5.6), with the essentials, the map
// popup (5.5) and the tickets link to the organizer's own site.
//
// The card wears its type — TRANSM · STILL · MOTION · BRDCST — read from
// what it carries (lib/feed/types.js postType); its size is the Feed's
// (lib/feed/tetris.js SPANS). Tapping the media enlarges it over the
// Feed (MediaFloat, the "media" popup). A real post carries its byline, its
// permalink and the people-counted LIKE; a sample carries its credit and the
// SAMPLE tag and never a LIKE. The comment bubble is `soon` — comments are
// not built — and says so; nothing here pretends.

import { useCallback, useEffect, useRef, useState } from "react";
import { HoldMenu, CardDots } from "./HoldMenu.jsx";
import { Cut } from "./Cut.jsx";
import TransmissionText from "./TransmissionText.jsx";
import SaveButton from "./SaveButton.jsx";
import Icon from "./Icons.jsx";
import { Avatar, FriendName } from "./UserBits.jsx";
import { registerFeedVideo, feedPolicy } from "../../lib/media/feedplay.js";
import { footerPages } from "../../lib/brdcst/index.js";
import { postType, brdcstWhen, brdcstMoment } from "../../lib/feed/types.js";
import { galleryOf } from "../../lib/feed/tetris.js";
import Fig20 from "./Fig20.jsx";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";
import TagRow from "./TagChip.jsx";
import { BlockText, BlockLine } from "./Blocks.jsx";
import { tagsFor, visibleTags } from "../../lib/tagging/grammar.js";

const STATE_WORD = { draft: "DRAFT · UNPAID", scheduled: "SCHEDULED", active: "LIVE", ended: "ENDED", cancelled: "CANCELLED", under_review: "UNDER REVIEW" };

/** One event inside the footer: collapsed to its title and date until tapped (5.11). */
function BrdcstEvent({ event, open, onToggle }) {
  return (
    <li className={"brdcstev" + (open ? " open" : "")}>
      <button type="button" className="brdcstevhead" aria-expanded={open} onClick={() => { haptic("press"); onToggle(); }}>
        <b>{event.name}</b>
        <span className="brdcstwhen">{brdcstWhen(event)}</span>
      </button>
      {open ? (
        <div className="brdcstbody">
          <BlockText className="fine" text={[String(event.kind || "").toUpperCase(), event.city, event.status ? String(event.status).toUpperCase() : null, event.admission].filter(Boolean).join(" · ")} />
          <div className="brdcstacts">
            {/* 5.5 (slice 12): the map opens above the post as a popup */}
            <button type="button" className="txtbtn" onClick={() => { haptic("press"); openSheet("map", { pin: event.id, title: "MAP" }); }}>PASSPORT MAP →</button>
            {event.sourceUrl ? <a className="txtbtn" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">TICKETS · THE ORGANIZER ↗</a> : <span className="fine">tickets: no organizer link on record</span>}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The BRDCST footer (blueprint 5.2–5.6, 5.10–5.12; slice 8; the owner's
 * drawing of 18 Oct): the white is the post, the broadcast hangs from it.
 * The head reads BRDCST · the soonest event's date and time; under the rule
 * the event's name with the asterisk and the chevron. Expanded: five
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
  const meta = brdcst ? (brdcst.yours ? (STATE_WORD[brdcst.state] || String(brdcst.state).toUpperCase()) + (brdcst.radiusMi ? ` · ${brdcst.radiusMi} MI` : "") : brdcst.radiusMi ? `BRDCST: ${brdcst.radiusMi} MI` : null) : null;
  return (
    <div className={"brdcst" + (open ? " open" : "")}>
      <div className="brdcsthead">
        <b className="brdcstword">BRDCST{pages.more > 0 ? <small>+{pages.more}</small> : null}</b>
        <span className="brdcstwhen">{brdcstWhen(first)}</span>
      </div>
      <button type="button" className="brdcstname" aria-expanded={open} onClick={() => { haptic("press"); setOpen((o) => !o); }}>
        <span>{first.name}</span>
        <Icon name="chevron" size={20} className={open ? "up" : ""} />
      </button>
      {open ? (
        <ul className="brdcstlist" aria-label={`${pages.total} event${pages.total === 1 ? "" : "s"}`}>
          {meta ? <li className="brdcstmeta fine">{meta}</li> : null}
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
function MotionMedia({ video, id, onMedia, label, videoRef = null }) {
  const ref = useRef(null);
  const [policy, setPolicy] = useState(null);
  useEffect(() => { if (videoRef) videoRef.current = ref.current; setPolicy(feedPolicy()); return registerFeedVideo(ref.current, id); }, [id, videoRef]);
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
    </figure>
  );
}

/** The composition's media, rendered by layout. Every image carries the
 *  author's alt; an exposé's layers are text over the image AND a readable
 *  caption beneath it. */
function Media({ p, onMedia, videoRef = null }) {
  const a = p.attachments || {};
  const media = Array.isArray(a.media) ? a.media : [];
  const urls = media.map((m) => m.url || (p.imageUrl && media.indexOf(m) === 0 ? p.imageUrl : null)).filter(Boolean);
  const layout = p.layout || (media.length > 1 ? "carousel" : media.length ? "single" : null);
  return (
    <>
      {a.video && a.video.url && <MotionMedia video={a.video} id={p.serverId ?? p.id} onMedia={onMedia} label={"open the motion: " + (p.title || "")} videoRef={videoRef} />}
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
    </>
  );
}

/** The snapshots a composition carries beneath its media: tagged pieces
 *  (each opens its LISTING) and the link — the snapshots the server stored,
 *  never fetched HTML. */
function Extras({ p }) {
  const a = p.attachments || {};
  return (
    <>
      {Array.isArray(a.pieces) && a.pieces.length > 0 && (
        <ul className={"wpcpieces" + (p.layout === "fragment" ? " fragment" : "")} aria-label="tagged pieces">
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
    </>
  );
}


/** A standalone BRDCST (owner's drawing, 25 Oct 2026, evening: "nearly
 *  identical to the image"): the event's photograph CLOUDED across the whole
 *  strip, the BRDCST badge in its white ring with the red rule under the
 *  word, the name large in white, where and when small beneath it, the × at
 *  the corner. A tap opens the BRDCST popup (BrdcstSheet.jsx), where the
 *  photograph is clear. The photograph is the record's own free-use picture
 *  (lib/places/registry.js `image`); a record without one gets the grey. */
export function brdcstLines(ev) {
  const name = String(ev.name || "");
  const dash = name.indexOf(" — ");
  const big = dash > 0 ? name.slice(0, dash) : name;
  const sub = dash > 0 ? name.slice(dash + 3) : "";
  const kind = String(ev.kind || "").toLowerCase();
  const live = /concert|show|gig|live|music|performance/.test(kind);
  const city = String(ev.city || "");
  const parts = city.split(",").map((x) => x.trim()).filter(Boolean);
  const short = parts.length > 1 && /^[A-Z]{2,3}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : parts[0] || "";
  const where = short.toUpperCase();
  const lead = live ? "LIVE IN " + where : (kind ? kind.toUpperCase() + (where ? " IN " + where : "") : where);
  // the small line is where and when, as drawn ("LIVE IN DC NOV 30th"); the name's second half waits for the popup
  const small = [lead, brdcstMoment(ev.startsAt, { tz: ev.tz })].filter(Boolean).join(" · ");
  return { big, sub, small };
}

function BrdcstStrip({ p, id }) {
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const a = p.attachments || {};
  const ev = a.event || (a.events && a.events[0]) || null;
  if (!ev) return null;
  const { big, small } = brdcstLines(ev);
  const what = "the broadcast " + ev.name;
  return (
    <article className={"card wpostcard type-brdcst bstrip" + (ev.image ? " withphoto" : "")} data-id={id} data-type="BRDCST" aria-label={"broadcast: " + ev.name}>
      <CardDots what={what} open={menu} onOpen={() => setMenu(true)} />
      <HoldMenu id={id} what={what} href={null} open={menu} onClose={close} />
      <button type="button" className="bsopen" onClick={() => { haptic("press"); openSheet("brdcst", { id: ev.id, title: "BRDCST" }); }} aria-label={"open the broadcast " + ev.name}>
        {ev.image ? <img className="bsimg" src={ev.image} alt="" loading="lazy" aria-hidden="true" /> : null}
        <span className="bsbadge" aria-hidden="true"><b>BRDCST</b><i /></span>
        <span className="bsbody">
          <b className="bsname">{big}</b>
          <span className="bswhen">{small}</span>
        </span>
      </button>
    </article>
  );
}

/** The four actions (owner's post sketch, 25 Oct 2026, Figs. 2–5; late that
 *  night: "get rid of the three dots below" — no counts): ♡ LIKE · the
 *  bubble · the STAMP · share, thin and a little transparent. */
function Acts({ p, eng, onEngage, sample, href, name, image }) {
  const [shared, setShared] = useState("");
  async function share() {
    haptic("press");
    const url = window.location.origin + href;
    try {
      if (navigator.share) await navigator.share({ url, title: p.title || name });
      else await navigator.clipboard.writeText(url);
      setShared("link copied ✓");
    } catch { setShared(""); }
    setTimeout(() => setShared(""), 1800);
  }
  return (
    <div className="p2acts" role="group" aria-label="post actions">
      <span className="p2act">
        {eng
          ? <button type="button" className={"wpcact" + (eng.youLike ? " on" : "")} aria-pressed={!!eng.youLike} onClick={() => { haptic("press"); onEngage && onEngage(p, "like"); }} aria-label={"like, " + eng.likes} title="LIKE"><Icon name="heart" size={26} /></button>
          : <span className="wpcact quiet" title={sample ? "a sample carries no LIKE" : "LIKE arrives with the post's record"} aria-hidden="true"><Icon name="heart" size={26} /></span>}
      </span>
      <span className="p2act">
        <span className="wpcact soon" title="comments are not built yet" aria-label="comments — not built yet"><Icon name="comment" size={26} /></span>
      </span>
      <span className="p2act">
        <SaveButton className="wpcact" icon="stamp" kind="post" id={sample ? p.id : String(p.serverId ?? p.id)} title={p.title || (p.text || "").slice(0, 80)} image={image ? image.src : ""} href={href} meta={name} tags={sample ? p.tags : (p.tags || [])} labels={["STAMP", "STAMPED ✓"]} />
      </span>
      <span className="p2act">
        {sample
          ? <span className="wpcact quiet" title="a sample has no link of its own" aria-hidden="true"><Icon name="share" size={26} /></span>
          : <button type="button" className="wpcact" onClick={share} aria-label="share the post" title={shared || "SHARE"}><Icon name="share" size={26} /></button>}
      </span>
      {shared ? <span className="wpcshared" role="status">{shared}</span> : null}
    </div>
  );
}

/** The ring beside the caption on a MOTION: its sound, on and off — a real
 *  control over the post's own audio, so a still carries none. */
function SoundRing({ video }) {
  const [on, setOn] = useState(false);
  return (
    <button type="button" className={"p2ring" + (on ? " on" : "")} aria-pressed={on} aria-label={on ? "mute the motion" : "hear the motion"} title={on ? "SOUND ON" : "SOUND OFF"}
      onClick={() => { const v = video(); if (!v) return; haptic("press"); v.muted = on; if (!on) { const pl = v.play(); if (pl && pl.catch) pl.catch(() => {}); } setOn(!on); }} />
  );
}

/** THE CAPTION (the post sketch's Fig. 7): folded into a line of blocks, one
 *  per word, with the fold mark to unfold it (the words load in behind the
 *  blocks), the sound ring at the right on a motion. The post card and the
 *  recommended motions (MotionRail.jsx, a caption per video) both wear it;
 *  `key` it by the text to fold it again when the text changes. */
export function Caption({ text, motion = false, videoRef = null }) {
  const [more, setMore] = useState(0);
  return (
    <div className="p2cap">
      <div className="p2line">
        {more ? (
          <BlockText as="p" className="p2text" text={text} play={more} />
        ) : (
          <button type="button" className="p2fold" aria-expanded="false" onClick={() => { haptic("press"); setMore((m) => m + 1); }}>
            <BlockLine className="p2fold-line" text={text} />
            <span className="idlabel">read the caption: {text}</span>
          </button>
        )}
        <button type="button" className={"p2more" + (more ? " up" : "")} aria-expanded={!!more} aria-label={more ? "fold the caption" : "unfold the caption"} onClick={() => { haptic("press"); setMore((m) => (m ? 0 : 1)); }}>
          <Icon name="fold" size={18} />
        </button>
        {motion && videoRef ? <SoundRing video={() => videoRef.current} /> : null}
      </div>
    </div>
  );
}

export default function PostCard({ post: p, engagement, onEngage }) {
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const videoRef = useRef(null);
  const sample = !!p.sample;
  const type = postType(p);
  const composed = !sample && p.attachments && Object.keys(p.attachments).length > 0;
  const a = p.attachments || {};
  const image = sample ? p.image : (!composed && p.imageUrl ? { src: p.imageUrl, alt: "", credit: "", url: "" } : null);
  const name = sample ? p.name : (p.name || p.handle);
  const eng = !sample && p.serverId != null && engagement ? engagement[String(p.serverId)] : null;
  const href = sample ? "/" : (p.serverId != null ? "/?post=" + encodeURIComponent(p.serverId) : "/");
  const hasMedia = type === "STILL" || type === "MOTION";
  const onMedia = hasMedia ? () => { haptic("press"); openSheet("media", sample ? { id: p.id, sample: true, title: type } : { id: p.serverId, title: type }); } : undefined;
  const events = a.event || (a.events && a.events.length) ? <BrdcstFooter event={a.event} events={a.events} brdcst={a.brdcst || null} /> : null;
  const cardId = "post:" + (p.serverId ?? p.id);
  if (type === "BRDCST") return <BrdcstStrip p={p} id={cardId} />;
  // (a sample photograph's url is its credit page; a composition's url is the image — src first)
  const gallery = hasMedia ? galleryOf(p) : [];
  const motion = type === "MOTION";
  const caption = [p.title, p.text].filter(Boolean).join(" — ");
  const what = "the post " + (p.title || name);
  // FIGURE 20 (owner, 25 Oct 2026, late: "for the carousels … simply input
  // figure 20 how it is … the ipod style collapsed cards floating"; then: "I
  // want the caption and the like, comment, stamp and share buttons to be
  // floating over top of the feed, and make the profile pic and user name
  // float as well, so the carousel can have the exact same dimensions as
  // just a regular post"): a post of two or more stills is the post card's
  // own head, caption and actions with Figure 20 for its media and no
  // housing — no box, no ground. Then: "allow the header and captions to
  // float over top of the actual card, so the carousel cards still have the
  // same height as the regular motion and still cards": the coverflow fills
  // the whole cell as a photograph fills a post (withmedia), its centre card
  // the full height, the head and the foot floating over it.
  const carousel = gallery.length > 1;
  // THE POST CARD (owner's post sketch, 25 Oct 2026, IMG_1143): the author's
  // circle and name (Figs. 8–10) over a red rule (11); the media; the
  // counter "01/26" (6); the caption folded into two lines of BLOCKS, one
  // per word, with the fold mark to unfold it, the words loading in behind
  // a run of blocks (7; owner, 25 Oct: the blocks replace the chevrons); the
  // four counted actions (2–5) over a red rule (1).
  return (
    <article className={"card wpostcard p2 type-" + (carousel ? "carousel f20post" : type.toLowerCase()) + (sample ? " sample" : "") + (hasMedia ? " withmedia" : "") + (events ? " withevent" : "")} data-id={cardId} data-type={type} aria-label={(carousel ? "carousel of " + gallery.length + " photographs" : type === "TRANSM" ? "note" : type.toLowerCase()) + ": " + (p.title || name)} style={image && image.ink ? { "--on-card": image.ink } : undefined}>
      <CardDots what={what} open={menu} onOpen={() => setMenu(true)} />
      <HoldMenu id={cardId} what={what} href={sample ? null : href} open={menu} onClose={closeMenu} />
      {/* THE STAGE (owner, 25 Oct 2026, evening: "every media card should be
          comprised of the entire image — text and icons overlap it"): the
          media fills it; the head rides its top and the foot — the credit,
          the caption, the four actions — its bottom, each on a scrim */}
      <div className="p2stage">
      <header className="p2head">
        <span className="p2orb">{sample ? <Avatar name={name} src={p.avatar || null} /> : <a href={p.mine ? "/profile" : "/u/" + encodeURIComponent(p.handle)} aria-label={"the author, " + name}><Avatar name={name} /></a>}</span>
        <span className="p2user">{sample ? name : <FriendName handle={p.handle}>{name}</FriendName>}</span>
      </header>
      <Cut className="p2rule" />
      <div className="p2media">
        {carousel ? (
          <Fig20
            aspect={1 / 2}
            items={gallery.map((g, i) => ({ key: (g.src || g.url) + i, src: g.src || g.url, alt: g.alt || "" }))}
            label={`${gallery.length} photographs by ${name}`}
            render={(g, i) => <button type="button" className="wpcmedia" onClick={onMedia} aria-label={"enlarge photograph " + (i + 1)}><img src={g.src} alt={g.alt} loading="lazy" /></button>}
          />
        ) : hasMedia ? (
          <div className="wpcstage">
            {composed && <Media p={p} onMedia={onMedia} videoRef={videoRef} />}
            {sample && p.video && <MotionMedia video={p.video} id={p.id} onMedia={onMedia} label={"open the sample motion: " + (p.title || "")} videoRef={videoRef} />}
            {image && !p.video && (
              <figure className="wpcfig">
                <button type="button" className="wpcmedia" onClick={onMedia} aria-label="enlarge the photograph"><img src={image.src} alt={image.alt || ""} loading="lazy" /></button>
              </figure>
            )}
          </div>
        ) : (
          <div className="p2words"><TransmissionText text={p.text} className="p2wordstext" /></div>
        )}
      </div>
      <div className="p2foot">
      {image && image.credit ? <span className="wpccredit"><a href={image.url} target="_blank" rel="noreferrer">{image.credit}</a></span> : null}
      <Caption text={caption} motion={motion} videoRef={videoRef} />
      <Acts p={p} eng={eng} onEngage={onEngage} sample={sample} href={href} name={name} image={image} />
      </div>
      </div>
      {composed ? <Extras p={p} /> : null}
      {events}
    </article>
  );
}
