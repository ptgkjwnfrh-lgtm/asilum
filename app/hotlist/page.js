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
import { getUid, postJSON } from "../../lib/client.js";
import { STORIES, fetchWire, fetchPost, addPost, timeAgo, getProfileInfo } from "../../lib/social.js";
import { Avatar, WhoToFollowList } from "../components/UserBits.jsx";

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

  function loadWire() {
    fetchWire("user")
      .then((w) => { setPosts(w.posts); setPostsLive(w.live); })
      .catch(() => { setPosts([]); setPostsLive(false); });
  }

  useEffect(() => {
    setStamp(new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }).toUpperCase());
    loadWire();
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
    addPost(t, info, cap);
    // The server's verdict decides the note — a held-for-review post is
    // saved but invisible to others, and saying "live" would be a lie.
    postJSON("/api/editorial", {
      user: getUid(), handle: info.handle || info.name,
      text: t, title: cap || undefined,
    })
      .then(async (res) => {
        const d = await res.json().catch(() => null);
        setWireNote(d && d.held ? (d.note || "your transmission is saved and paused for a human review") : "");
        loadWire();
      })
      .catch(() => setWireNote("saved on this device — the shared wire could not be reached"));
    loadWire();
    setText("");
    setCaption("");
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
              <p className="fposttext">{focus.text}</p>
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
        {(posts || []).map((p) => (
          <div className="fpost wpost" key={p.id}>
            {p.title ? <div className="wposthead">{p.title}</div> : null}
            <p className="fposttext">{p.text}</p>
            <PostByline p={p} />
          </div>
        ))}
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

      {/* ---- EXTERNAL DISPATCHES — quietest ---- */}
      <section className="elext" aria-label="external dispatches">
        <div className="elh elh5">EXTERNAL DISPATCHES</div>
        {STORIES.map((s) => (
          <a className="elextrow" key={s.title} href={s.url} target="_blank" rel="noopener noreferrer">
            <span className="elextpub">{s.pub.toUpperCase()}</span>
            <span className="elextttl">{s.title} ↗</span>
          </a>
        ))}
        <p className="elextnote">dispatches link out — the stories live with the publications.</p>
      </section>

      <footer className="cvcolo" aria-label="colophon">
        *ASILUM — THE WIRE · {stamp}
        {posts !== null && <> · {posts.length} TRANSMISSION{posts.length === 1 ? "" : "S"}</>}
        {booths !== null && <> · {booths.length} OF 10 BOOTHS HELD</>}
        {" "}· {STORIES.length} EXTERNAL DISPATCHES · EVERY
        VALUE ON THIS PAGE IS REAL STATE
      </footer>
    </div>
  );
}
