"use client";

// app/components/ProfileHead.jsx — THE PROFILE HEADER (owner's sketch, 4 Nov
// 2026: "re up the account page, pretty much close to Instagram"). One
// header for the account page (/profile, the owner's own) and a passenger's
// public page (/u/[handle]), in the Feed's hand:
//
//   TITLE: DISPLAY NAME                the title bar, the name centred
//   ( avatar )  USERNAME ☆☆☆☆☆ 00      the handle, the Passenger Score as stars
//    ○ Song     00 POSTS · 00 LISTINGS · 00 FOLLOWERS · 00 FOLLOWING
//               bio >>>>>>>>>>>>>>>>>>
//   [ Follow ] [ Message ] [ wardrobe | statistics | banking ]
//   ( ECHO ) ( ECHO ) ( ECHO )          the live echoes, 24 hours each
//   ─────────────────────────────────
//   grid · repost · featured · store    the tabs (ProfileTabs, below)
//
// Every number is a measurement or a dash: the caller passes null for a
// quantity nobody measures on that page and the cell prints "—" with the
// reason in its title (the metric-definition rule, Aug 17). The song is the
// room's anthem (lib/profile/rooms.js, the "soundtrack" module); the stars
// are /api/score (slice 7) and open the Passenger Score popup; the echoes
// are the person's own live ECHO posts (lib/feed/types.js echoLive) and open
// the ECHO viewer.

import { useEffect, useState } from "react";
import { authorizedFetch } from "../../lib/client.js";
import { echoLive, postType } from "../../lib/feed/types.js";
import { HANDLE_RE } from "../../lib/profile/handles.js";
import { openSheet } from "../../lib/dockstate.js";
import { haptic } from "../../lib/haptics.js";
import { timeAgo } from "../../lib/social.js";
import { Avatar } from "./UserBits.jsx";
import Icon from "./Icons.jsx";
import TransmissionText from "./TransmissionText.jsx";

/** The public follower count for a claimed handle (/api/follow?followers=).
 *  null while unread, when the handle is not a claimed one, or when the
 *  server could not answer — the header prints a dash for null, never a 0 it
 *  did not measure. Refreshes on the follow event so a FOLLOW tap on the
 *  public page moves the number. */
export function useFollowers(handle) {
  const [n, setN] = useState(null);
  useEffect(() => {
    const h = String(handle || "").trim().toLowerCase().replace(/^[*@]/, "");
    if (!HANDLE_RE.test(h)) { setN(null); return undefined; }
    let live = true;
    const read = () => authorizedFetch("/api/follow?followers=" + encodeURIComponent(h))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setN(d && Number.isFinite(d.followers) ? d.followers : null); })
      .catch(() => { if (live) setN(null); });
    read();
    window.addEventListener("asilum:follow", read);
    return () => { live = false; window.removeEventListener("asilum:follow", read); };
  }, [handle]);
  return n;
}

/** The Passenger Score as five stars and the review count (6.18): the
 *  score rounded to whole stars lit, the count after. Nothing is drawn until
 *  the server answers; a refused read draws nothing rather than five empty
 *  stars that would read as a zero. */
export function ScoreStars({ subject, name = null }) {
  const [score, setScore] = useState(null);
  useEffect(() => {
    if (!subject) return undefined;
    let live = true;
    authorizedFetch(`/api/score?subject=${encodeURIComponent(subject)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setScore(d && Number.isFinite(d.score) ? { score: d.score, count: Number(d.count) || 0 } : false); })
      .catch(() => { if (live) setScore(false); });
    return () => { live = false; };
  }, [subject]);
  if (!subject || !score) return null;
  const lit = Math.round(score.score);
  return (
    <button type="button" className="pf3stars" onClick={() => { haptic("press"); openSheet("score", { subject, name, title: "PASSENGER SCORE" }); }}
      aria-label={`passenger score ${score.score.toFixed(1)} of 5 from ${score.count} ${score.count === 1 ? "review" : "reviews"} — open`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={"pf3star" + (i <= lit ? " on" : "")} aria-hidden="true">★</span>)}
      <i aria-hidden="true">{String(score.count).padStart(2, "0")}</i>
    </button>
  );
}

const hoursLeft = (p) => {
  const until = Number(p?.attachments?.echo?.expiresAt);
  const h = Math.ceil((until - Date.now()) / 3600000);
  return Number.isFinite(h) && h > 0 ? h + "H" : "";
};

/**
 * props
 *   title      the title bar's node — the page's own h1 (its one heading)
 *   name       the display name (the avatar's initials)
 *   handle     the handle, printed big under the title
 *   avatar     an image's src, or nothing for the initials
 *   bio        the bio
 *   identity   a node that stands in for handle / stars / bio while editing
 *   scoreSubject  the uid whose Passenger Score the stars read (own page only)
 *   counts     [{ key, label, value, title }] — four cells; a null value prints "—"
 *   song       { name, label } or null — the room's anthem
 *   onSong     the song key's action (own page: the room editor); or
 *   songHref   a link instead (public page: the catalog search)
 *   actions    the key row: FOLLOW / EDIT, MESSAGE, the cluster
 *   menu       the title bar's right-hand node (the ⋯ menu)
 *   echoes     the person's posts — the live echoes are kept (echoLive)
 *   onEchoAdd  own page: the + ring opens the composer on ECHO
 */
export default function ProfileHead({
  title, name, handle, avatar = null, bio = "", identity = null, scoreSubject = null,
  counts = [], song = null, onSong = null, songHref = null, actions = null, menu = null,
  echoes = [], onEchoAdd = null,
}) {
  const live = (echoes || []).filter((p) => echoLive(p)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const openEcho = (i) => { haptic("press"); openSheet("echo", { handle, echoes: [...live.slice(i), ...live.slice(0, i)], title: "ECHO" }); };
  const songInner = (
    <>
      <span className="pf3songdisc" aria-hidden="true"><Icon name="disc" size={13} /></span>
      <span className="pf3songword">SONG</span>
      <span className="pf3songname">{song ? song.name : "NONE YET"}</span>
    </>
  );
  return (
    <div className="pf3head">
      <header className="pf3bar">
        {title}
        {menu}
      </header>
      <div className="pf3top">
        <div className="pf3face">
          <div className="pf3avatar">
            {avatar ? <img src={avatar} alt="" /> : <Avatar name={name || handle} />}
          </div>
          {onSong ? (
            <button type="button" className="pf3song" onClick={onSong} title={song ? `${song.name}${song.label ? " — " + song.label : ""} · change it in your room` : "pick a song in your room"}>{songInner}</button>
          ) : song && songHref ? (
            <a className="pf3song" href={songHref} title={`${song.name}${song.label ? " — " + song.label : ""}`}>{songInner}</a>
          ) : song ? (
            <span className="pf3song">{songInner}</span>
          ) : null}
        </div>
        {identity ? <div className="pf3ident">{identity}</div> : (
          <>
            <div className="pf3ident">
              <div className="pf3nameline">
                <span className="pf3name">{handle || name}</span>
                <ScoreStars subject={scoreSubject} name={handle || null} />
              </div>
            </div>
            {/* the counts and the bio sit under the name on a wide screen and
                run the pane's full width on a phone (Instagram's own fold) */}
            <div className="pf3counts" aria-label="counts">
              {counts.map((c) => (
                <span key={c.key}>
                  {c.value == null ? <b title={c.title || "not measured here"}>—</b> : <b>{c.value}</b>}
                  {c.label}
                </span>
              ))}
            </div>
            <p className="pf3bio">{bio}</p>
          </>
        )}
      </div>
      {actions ? <div className="pf3keys">{actions}</div> : null}
      {(live.length > 0 || onEchoAdd) && (
        <div className="pf3echoes" role="list" aria-label="echoes — temporary posts, gone after 24 hours">
          {onEchoAdd ? (
            <button type="button" role="listitem" className="pf3echo add" onClick={onEchoAdd} aria-label="post an echo">
              <span className="pf3echoface" aria-hidden="true">+</span>
              <span className="lbl">ECHO</span>
              <span className="left">NEW</span>
            </button>
          ) : null}
          {live.map((p, i) => (
            <button type="button" role="listitem" className="pf3echo" key={p.id} onClick={() => openEcho(i)} aria-label={"echo from " + timeAgo(p.at) + (hoursLeft(p) ? ", " + hoursLeft(p) + " left" : "")}>
              <span className="echoringface"><Avatar name={name || handle} src={avatar} /></span>
              <span className="lbl">ECHO</span>
              <span className="left">{hoursLeft(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The tab row under the echoes: one glyph and its word per tab (the brief:
 *  every symbol that is not obvious needs a readable label). */
export function ProfileTabs({ tabs, icons, tab, onTab }) {
  return (
    <div className="pf3tabs" role="tablist" aria-label="profile sections">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" className="pf3tab" aria-selected={tab === k} onClick={() => onTab(k)}>
          <Icon name={icons[k]} size={20} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** THE POSTS GRID (Instagram's): three squares across. A STILL or a MOTION
 *  shows its first picture; a TRANSM or a BRDCST shows its words, clamped.
 *  A server post's square is its permalink; a device-only copy stays a
 *  still square, labeled, until the server holds it. */
export function PostGrid({ posts, emptyNode = null }) {
  if (!posts.length) return emptyNode;
  return (
    <div className="pf3grid">
      {posts.map((p) => {
        const type = postType(p);
        const media = Array.isArray(p.attachments?.media) ? p.attachments.media : [];
        const src = (media[0] && media[0].url) || p.imageUrl || "";
        const pictured = src && (type === "STILL" || type === "MOTION");
        const inner = pictured ? (
          <>
            <img src={src} alt={typeof p.attachments?.alt === "string" ? p.attachments.alt : p.title || ""} loading="lazy" />
            {type !== "STILL" || media.length > 1 ? <span className="pf3kind">{type === "MOTION" ? "MOTION" : media.length + " STILLS"}</span> : null}
            <span className="pf3time">{timeAgo(p.at)}{p.serverId == null ? " · on this device" : ""}</span>
          </>
        ) : (
          <>
            <div className="pf3text">
              {p.title ? <div className="wposthead">{p.title}</div> : null}
              <TransmissionText text={p.text} />
            </div>
            {type !== "TRANSM" ? <span className="pf3kind">{type}</span> : null}
            <span className="pf3time">{timeAgo(p.at)}{p.serverId == null ? " · on this device — pending or held" : ""}{p.editedAt ? " · edited" : ""}</span>
          </>
        );
        const cls = "pf3tile" + (pictured ? " media" : "");
        return p.serverId != null
          ? <a className={cls} key={p.id} href={"/hotlist?post=" + encodeURIComponent(p.serverId)}>{inner}</a>
          : <div className={cls} key={p.id}>{inner}</div>;
      })}
    </div>
  );
}
