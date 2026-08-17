"use client";

// app/hotlist/page.js — THE WIRE (owner overhaul, Aug 13; formerly
// EDITORIAL — the destination renamed by owner decree).
// This is where ALL user posts live, and where the hotlist stands.
//
// The posting law (owner order, Aug 13) — three ways to post:
//   TRANSMISSIONS (live): text capped at 5000 characters; the caption
//     acts as the transmission's HEADER (≤200, the server's title).
//   IMAGES (pipeline pending): up to SIX images in one carousel,
//     caption allowed — needs real storage; honestly coming soon.
//   VIDEO (pipeline pending): one video capped at 3:00, caption
//     allowed — same pipeline, same honesty.
//
// The hotlist law (owner order, Aug 13): the hotlist is TEN BOOTH
// SLOTS held for independent Shopify-based brands. A passport account
// becomes a BUSINESS account by verifying itself, connecting its
// Shopify, and connecting its personal website; only business accounts
// get a chance at a booth. No commerce pipeline exists yet, so every
// booth honestly reads OPEN — nothing stands in.
//
// Below the booths, the quieter rungs keep the graded descent:
// ASILUM MAGAZINE → AD SPACE → EXTERNAL DISPATCHES.

import { useEffect, useState } from "react";
import { authorizedFetch, getUid, postJSON } from "../../lib/client.js";
import {
  READING_ROOM, fetchWire, fetchPost, addPost, editPost, deletePost, timeAgo, getProfileInfo,
  fetchEngagement, toggleEngagement,
} from "../../lib/social.js";
import { Avatar, WhoToFollowList } from "../components/UserBits.jsx";
import TransmissionText from "../components/TransmissionText.jsx";

// The identity chain (owner order, Aug 13): every byline is a link —
// your own to /profile, anyone else's to their /u/[handle] page — and a
// server post's timestamp is its permalink (?post=<id> pins it here).
// Device-only copies (just posted, or held) have no server id yet, so
// their timestamps stay plain — a permalink that only works for its
// author would be a lie.
function PostByline({ p }) {
  return (
    <span className="fposthandle">
      {p.mine
        ? <a className="whandle" href="/profile">{p.handle}</a>
        : <a className="whandle" href={"/u/" + encodeURIComponent(p.handle)}>{p.handle}</a>}
      {p.mine ? <i className="cmine">you</i> : null}
      {" · "}
      {p.serverId != null
        ? <a className="wperma" href={"/hotlist?post=" + encodeURIComponent(p.serverId)}>{timeAgo(p.at)}</a>
        : timeAgo(p.at)}
      {/* the edited stamp is server truth — a touched transmission says
          so; an untouched one carries no label (honesty, Aug 14) */}
      {p.editedAt ? <i className="wedited">· edited {timeAgo(p.editedAt)}</i> : null}
    </span>
  );
}

// The wire's hairline field (magazine treatment, Aug 13): pinned to the
// page's first stretch, hand-placed and deterministic.
const EL_HAIRLINES = [
  "elln-h1", "elln-h2", "elln-h3", "elln-h4",
  "elln-v1", "elln-v2", "elln-v3",
];

const BOOTHS = Array.from({ length: 10 }, (_, i) => i + 1);

export default function TheWirePage() {
  const [posts, setPosts] = useState(null);
  const [postsLive, setPostsLive] = useState(true);
  const [house, setHouse] = useState(null);
  const [houseLive, setHouseLive] = useState(true);
  const [stamp, setStamp] = useState("");
  const [mode, setMode] = useState("transmission"); // transmission | images | video
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const [wireNote, setWireNote] = useState("");
  // ?post=<id> pins one transmission above the wire. undefined = no
  // permalink requested; null = looking it up; false = honestly absent.
  const [focus, setFocus] = useState(undefined);
  // The booth roster — verified business accounts, server truth.
  const [booths, setBooths] = useState(null);
  // Which floor posts are the caller's own — SERVER truth (?mine=1, the
  // verified identity), not the local text-match chip: controls that
  // could 404 on a stranger's post must never render on one.
  const [mineIds, setMineIds] = useState(null);
  const [editing, setEditing] = useState(null);   // serverId under edit
  const [editText, setEditText] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [confirmDel, setConfirmDel] = useState(null); // serverId armed to delete
  // Real engagement counts, keyed by server id. {} = not read yet or the
  // server could not be reached — the floor then shows NO counts rather
  // than zeros it cannot stand behind.
  const [engagement, setEngagement] = useState({});

  function loadWire() {
    fetchWire("user")
      .then((w) => {
        setPosts(w.posts);
        setPostsLive(w.live);
        const ids = w.posts.map((p) => p.serverId).filter((v) => v != null);
        if (ids.length) fetchEngagement(ids).then((e) => setEngagement((prev) => ({ ...prev, ...e })));
      })
      .catch(() => { setPosts([]); setPostsLive(false); });
  }

  // One person's like/save. The server's counts replace ours — we never
  // increment a number locally, because the counter is people, not clicks,
  // and only the ledger knows whether this person was already counted.
  function engage(p, kind) {
    const now = engagement[String(p.serverId)];
    const on = !(kind === "like" ? now?.youLike : now?.youSave);
    toggleEngagement(p.serverId, kind, on).then((r) => {
      if (r.ok) setEngagement((prev) => ({ ...prev, [String(p.serverId)]: r.counts }));
      else setWireNote(r.error || "the wire could not be reached");
    });
  }

  function loadMine() {
    authorizedFetch("/api/editorial?mine=1&limit=120&user=" + encodeURIComponent(getUid() || ""))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMineIds(new Set((d.posts || []).map((p) => String(p.id)))); })
      .catch(() => {});
  }

  function beginEdit(p) {
    setEditing(p.serverId);
    setEditText(p.text);
    setEditCaption(p.title || "");
    setConfirmDel(null);
  }

  function saveEdit() {
    const p = (posts || []).find((x) => x.serverId === editing);
    const t = editText.trim();
    if (!p || !t) return;
    editPost(p, t, editCaption.trim()).then((r) => {
      setWireNote(!r.ok
        ? (r.error || "the edit could not reach the wire")
        : r.held ? (r.note || "your edit is saved and paused for a human review") : "");
      setEditing(null);
      loadWire();
      loadMine();
    });
  }

  function doDelete(p) {
    deletePost(p).then((r) => {
      setWireNote(r.ok ? "" : (r.error || "the delete could not reach the wire"));
      setConfirmDel(null);
      loadWire();
      loadMine();
      // if the deleted transmission was pinned by permalink, it is now
      // honestly gone — say so rather than keep showing it.
      if (focus && focus.serverId === p.serverId) setFocus(false);
    });
  }

  useEffect(() => {
    setStamp(new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }).toUpperCase());
    loadWire();
    loadMine();
    fetchWire("asilum")
      .then((w) => { setHouse(w.posts); setHouseLive(w.live); })
      .catch(() => { setHouse([]); setHouseLive(false); });
    const sp = new URLSearchParams(window.location.search);
    const pid = sp.get("post");
    if (pid && /^\d{1,18}$/.test(pid)) {
      setFocus(null);
      fetchPost(pid).then((p) => setFocus(p || false));
    }
    fetch("/api/business?booths=1")
      .then((r) => r.json())
      .then((d) => setBooths(Array.isArray(d.booths) ? d.booths.slice(0, 10) : []))
      .catch(() => setBooths([]));
  }, []);

  function publish() {
    const t = text.trim();
    if (!t) return;
    const cap = caption.trim();
    const info = getProfileInfo();
    // The device copy is written only AFTER the server accepts.
    //
    // It used to be written first, for instant render, and the handler below
    // only ever asked whether the post was HELD — so any refusal set the note
    // to "" and left the copy in place. Once posting began requiring a
    // signed-in account (Aug-16 audit), that turned into the worst possible
    // outcome: a signed-out visitor saw their transmission appear on their own
    // wire, with no error, having published nothing. The honesty contract says
    // a refusal must look like a refusal.
    postJSON("/api/editorial", {
      user: getUid(), handle: info.handle || info.name,
      text: t, title: cap || undefined,
    })
      .then(async (res) => {
        const d = await res.json().catch(() => null);
        if (!res.ok) {
          // The server's own words — it knows why better than this page does.
          setWireNote((d && (d.error || d.note)) || "the wire did not accept that transmission");
          return;
        }
        addPost(t, info, cap);
        setWireNote(d && d.held ? (d.note || "your transmission is saved and paused for a human review") : "");
        setText("");
        setCaption("");
        loadWire();
        loadMine();
      })
      .catch(() => setWireNote("the shared wire could not be reached — nothing was published"));
  }

  return (
    <div className="wrap elr ctr">
      <div className="cvlines ellines" aria-hidden="true">
        {EL_HAIRLINES.map((c) => <i key={c} className={c} />)}
      </div>
      {posts !== null && (
        <span className="cvside elside" aria-hidden="true">
          {posts.length} TRANSMISSION{posts.length === 1 ? "" : "S"} ON THE WIRE
        </span>
      )}
      <span className="cvside cvsider elsider" aria-hidden="true">
        {booths === null
          ? "10 BOOTHS"
          : booths.length === 0
            ? "10 BOOTHS · ALL OPEN"
            : `10 BOOTHS · ${booths.length} HELD · ${10 - booths.length} OPEN`}
      </span>

      <header className="cthead">
        <h1 className="headline"><span className="red">*</span>THE WIRE</h1>
        {stamp && (
          <div className="ctmeta">
            LIVE EDITION · {stamp}
            {posts !== null && (
              <span>
                {posts.length} TRANSMISSION{posts.length === 1 ? "" : "S"}
                {booths !== null && ` · ${10 - booths.length} OF 10 BOOTHS OPEN`}
              </span>
            )}
          </div>
        )}
      </header>
      <p className="deck">
        every post lives here — transmissions, and in time images and video.
        under the floor, the hotlist&apos;s ten booths.
      </p>

      {/* ---- Permalink focus: ?post=<id> pins one transmission ---- */}
      {focus !== undefined && (
        <section className="wfocus" aria-label="pinned transmission">
          <a className="wfocusback" href="/hotlist">← BACK TO THE FULL WIRE</a>
          {focus === null && <div className="empty">pulling the transmission…</div>}
          {focus === false && (
            <div className="empty">
              this transmission is not on the wire — it may be held for
              review, or it may be gone.
            </div>
          )}
          {focus && (
            <div className="fpost wpost wfocuspost">
              {focus.title ? <div className="wposthead">{focus.title}</div> : null}
              <TransmissionText text={focus.text} />
              <PostByline p={focus} />
            </div>
          )}
        </section>
      )}

      {/* ---- THE COMPOSER — three ways of posting (owner law, Aug 13) ---- */}
      <section className="wcomposer" aria-label="post to the wire">
        <div className="wmodes">
          <button className={"fmode" + (mode === "transmission" ? " cur" : "")} onClick={() => setMode("transmission")}>
            TRANSMISSION
          </button>
          <button className={"fmode" + (mode === "images" ? " cur" : "")} onClick={() => setMode("images")}>
            IMAGES ×6
          </button>
          <button className={"fmode" + (mode === "video" ? " cur" : "")} onClick={() => setMode("video")}>
            VIDEO ≤3:00
          </button>
        </div>

        {mode === "transmission" && (
          <div className="wcompose">
            <Avatar name={getProfileInfo().name} />
            <div className="wcright">
              <input
                className="wcap"
                type="text"
                maxLength={200}
                placeholder="caption — becomes the transmission's header"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <textarea
                rows={4}
                maxLength={5000}
                placeholder="the transmission — today's uniform, tonight's find, the whole account of it…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="cvcomposerow">
                <span className="ccount">{text.length}/5000</span>
                <button className="btn postbtn" onClick={publish} disabled={!text.trim()}>POST</button>
              </div>
            </div>
          </div>
        )}
        {mode === "images" && (
          <div className="wsoonpanel">
            <b>IMAGES</b> — up to SIX images in one carousel, caption allowed.
            the media pipeline (storage, moderation, playback) requires setup;
            nothing here is faked in the meantime. <em>coming soon</em>
          </div>
        )}
        {mode === "video" && (
          <div className="wsoonpanel">
            <b>VIDEO</b> — one video, capped at THREE MINUTES, caption allowed.
            arrives with the same media pipeline. <em>coming soon</em>
          </div>
        )}
        {wireNote && <div className="pempty">{wireNote}</div>}
      </section>

      {/* ---- THE FLOOR — every post, newest first ---- */}
      <section className="elfloor wfloor" aria-label="the wire's posts">
        {posts === null && <div className="empty">pulling the wire…</div>}
        {posts && !postsLive && (
          <div className="empty">
            the shared wire could not be reached — showing this device&apos;s
            posts only.
          </div>
        )}
        {posts && postsLive && posts.length === 0 && (
          <div className="empty">no transmissions yet — yours opens the wire.</div>
        )}
        {(posts || []).map((p) => {
          const own = p.serverId != null && mineIds !== null && mineIds.has(String(p.serverId));
          const inEdit = own && editing === p.serverId;
          return (
            <div className="fpost wpost" key={p.id}>
              {inEdit ? (
                <div className="wedit">
                  <input
                    className="wcap"
                    type="text"
                    maxLength={200}
                    placeholder="caption — becomes the transmission's header"
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                  />
                  <textarea
                    rows={4}
                    maxLength={5000}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="cvcomposerow">
                    <span className="ccount">{editText.length}/5000</span>
                    <button className="wctl" onClick={() => setEditing(null)}>CANCEL</button>
                    <button className="btn postbtn" onClick={saveEdit} disabled={!editText.trim()}>SAVE</button>
                  </div>
                </div>
              ) : (
                <>
                  {p.title ? <div className="wposthead">{p.title}</div> : null}
                  <TransmissionText text={p.text} />
                </>
              )}
              <PostByline p={p} />
              {own && !inEdit && (
                <span className="wctls">
                  <button className="wctl" onClick={() => beginEdit(p)}>EDIT</button>
                  {confirmDel === p.serverId
                    ? <button className="wctl warn" onClick={() => doDelete(p)}>SURE? DELETE</button>
                    : <button className="wctl" onClick={() => setConfirmDel(p.serverId)}>DELETE</button>}
                </span>
              )}
              {/* Real counters or none. A count renders only once the ledger
                  has answered for this transmission; a number nobody has
                  earned yet stays silent rather than printing 0. */}
              {p.serverId != null && engagement[String(p.serverId)] && (
                <span className="wengage">
                  <button
                    className={"weng" + (engagement[String(p.serverId)].youLike ? " on" : "")}
                    onClick={() => engage(p, "like")}
                  >
                    LIKE
                    {engagement[String(p.serverId)].likes > 0 && (
                      <b>{engagement[String(p.serverId)].likes}</b>
                    )}
                  </button>
                  <button
                    className={"weng" + (engagement[String(p.serverId)].youSave ? " on" : "")}
                    onClick={() => engage(p, "save")}
                  >
                    SAVE
                    {engagement[String(p.serverId)].saves > 0 && (
                      <b>{engagement[String(p.serverId)].saves}</b>
                    )}
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="fwho" aria-label="who to follow">
        <div className="elh elh4">WHO TO FOLLOW</div>
        <WhoToFollowList compact withSearch />
      </section>

      {/* ---- THE HOTLIST — ten booths, business accounts only ---- */}
      <section className="elhot" aria-label="the hotlist">
        <div className="elmast">THE HOTLIST</div>
        <p className="elnote">
          <span className="pulse" />
          ten booths, held for verified independent brands. a passport account
          becomes a BUSINESS account by verifying itself, connecting its
          Shopify, and connecting its personal website — only business
          accounts get a chance at a booth. nothing stands in.
        </p>
        {BOOTHS.map((n) => {
          const holder = booths ? booths[n - 1] : null;
          return (
            <div className="booth" key={n}>
              <div className="elnum" aria-hidden="true">{String(n).padStart(2, "0")}</div>
              {holder ? (
                <div className="boothbody">
                  <b>{holder.brandName}</b>
                  <span>
                    verified independent brand ·{" "}
                    <a className="boothsite" href={holder.websiteUrl} target="_blank" rel="noopener noreferrer">
                      their site ↗
                    </a>
                  </span>
                </div>
              ) : (
                <div className="boothbody">
                  <b>BOOTH OPEN</b>
                  <span>held for a verified independent brand</span>
                </div>
              )}
              <span className="boothtag">{holder ? "VERIFIED BUSINESS" : "BUSINESS ACCOUNTS ONLY"}</span>
            </div>
          );
        })}
        <div className="elsubmit">
          <span className="adstar" aria-hidden="true">*</span>
          <span>
            RAISE YOUR PASSPORT TO BUSINESS — verify your brand, your Shopify
            storefront, and your own site; a human reviews every application.{" "}
            <a className="bizapply" href="/profile#access">APPLY ON YOUR ACCOUNT →</a>
          </span>
        </div>
      </section>

      {/* ---- ASILUM MAGAZINE — the house's own dispatches ---- */}
      <section className="elhouse" aria-label="asilum magazine">
        <div className="elh elh2">ASILUM MAGAZINE</div>
        {house === null && <div className="empty">opening the house pages…</div>}
        {house && !houseLive && (
          <p className="elhousenote">the house pages could not be reached — try again in a moment.</p>
        )}
        {house && houseLive && house.length === 0 && (
          <p className="elhousenote">
            the first ASILUM dispatch is on the cutting table — the house
            writes here, under its own byline, when there is something worth
            saying.
          </p>
        )}
        {(house || []).map((p) => (
          <article className="elpiece" key={p.id}>
            <div className="elpiecettl">{p.title || p.text.slice(0, 80)}</div>
            <p className="elpiecesum">{p.excerpt || p.text}</p>
            <span className="elpiecedate">{timeAgo(p.at)}</span>
          </article>
        ))}
        <div className="elsubmit">
          <span className="adstar" aria-hidden="true">*</span>
          <span>EDITORIAL SUBMISSIONS — submission intake requires setup. <em>coming soon</em></span>
        </div>
      </section>

      {/* ---- AD SPACE — open placements, always labeled ---- */}
      <section className="elads" aria-label="ad space">
        <div className="elh elh3">AD SPACE</div>
        <div className="eladrow">
          <div className="elad">
            <span className="adstar" aria-hidden="true">*</span>
            <b>THIS PLACEMENT IS OPEN</b>
            <em>space for taste.</em>
          </div>
          <div className="elad">
            <span className="adstar" aria-hidden="true">*</span>
            <b>THIS PLACEMENT IS OPEN</b>
            <em>sponsored placements are always disclosed.</em>
          </div>
        </div>
      </section>

      {/* ---- THE READING ROOM — quietest ----
           Was EXTERNAL DISPATCHES, printing headlines ASILUM invented under
           real mastheads. It is a reading list now: the publication, what it
           actually covers, and a link to its front page. */}
      <section className="elext" aria-label="the reading room">
        <div className="elh elh5">THE READING ROOM</div>
        {READING_ROOM.map((s) => (
          <a className="elextrow" key={s.pub} href={s.url} target="_blank" rel="noopener noreferrer">
            <span className="elextpub">{s.pub.toUpperCase()}</span>
            <span className="elextttl">{s.beat} ↗</span>
          </a>
        ))}
        <p className="elextnote">
          mastheads ASILUM reads. the lines are ours, describing their beat — not
          their headlines. each link goes to their front page.
        </p>
      </section>

      <footer className="cvcolo" aria-label="colophon">
        *ASILUM — THE WIRE · {stamp}
        {posts !== null && <> · {posts.length} TRANSMISSION{posts.length === 1 ? "" : "S"}</>}
        {booths !== null && <> · {booths.length} OF 10 BOOTHS HELD</>}
        {" "}· {READING_ROOM.length} MASTHEADS IN THE READING ROOM
      </footer>
    </div>
  );
}
