"use client";

// app/cover/page.js — FRONT COVER.
// The landing edition (owner amendment, July 25: seventh destination).
// Grailed-landing energy inside the OS: the machine's current front-page
// pick, the wire (community transmissions), editorial dispatches, and
// tonight's styled looks. Every module is a doorway into its subsystem,
// and every displayed value is real state — the pick is the feed's actual
// top item, the looks come from the live stylist engine.

import { useEffect, useState } from "react";
import { getUid, postJSON, authorizedFetch, thumbFor } from "../../lib/client.js";
import {
  STORIES, listPosts, addPost, postStats, timeAgo, getProfileInfo, sourceFor,
} from "../../lib/social.js";
import { Avatar } from "../components/UserBits.jsx";

const SUBSYSTEMS = [
  { href: "/", label: "CATALOG", meta: "your curated edit" },
  { href: "/hotlist", label: "EDITORIAL", meta: "the living magazine" },
  { href: "/board", label: "PASSPORT", meta: "train the brain" },
  { href: "/discover", label: "DISCOVER", meta: "the open index" },
  { href: "/profile", label: "PROFILE", meta: "your public record" },
  { href: "/settings", label: "SETTINGS", meta: "control panel" },
];

export default function CoverPage() {
  const [pick, setPick] = useState(null);
  const [looks, setLooks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState("");
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    const user = getUid() || "guest";
    setPosts(listPosts());
    setStamp(new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }).toUpperCase());
    authorizedFetch("/api/feed?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .then((d) => setPick((d.items || [])[0] || null))
      .catch(() => {});
    authorizedFetch("/api/outfits?user=" + encodeURIComponent(user) + "&n=2")
      .then((r) => r.json())
      .then((d) => setLooks((d.outfits || []).slice(0, 2)))
      .catch(() => {});
  }, []);

  function post() {
    const t = text.trim();
    if (!t) return;
    const info = getProfileInfo();
    addPost(t, info);
    postJSON("/api/editorial", { user: getUid(), handle: info.handle || info.name, text: t }).catch(() => {});
    setPosts(listPosts());
    setText("");
  }

  return (
    <div className="wrap">
      <div className="shead-cover">
        <h1 className="headline"><span className="red">*</span>FRONT COVER</h1>
        <div className="covermeta">LIVE EDITION · {stamp}<br />EVERY MODULE OPENS ITS SUBSYSTEM →</div>
      </div>
      <hr className="rule" />

      <div className="coverhero">
        <section className="coverpick" aria-label="tonight's pick">
          <div className="psub">TONIGHT THE MACHINE RECOMMENDS</div>
          {pick ? (
            <a className="coverpickbody" href={"/?item=" + encodeURIComponent(pick.id)}>
              <div className="coverpickimg">
                <img src={pick.img || thumbFor(pick)} alt={pick.title || "front cover piece"} />
              </div>
              <div className="coverpickinfo">
                <div className="coverbrand">{(pick.brand || "").toUpperCase()}</div>
                <div className="coverttl">{pick.title}</div>
                <div className="coverline">
                  {sourceFor(pick)} · {pick.currency || "USD"} {pick.price}
                </div>
                <span className="btn">OPEN RECORD →</span>
              </div>
            </a>
          ) : (
            <div className="pempty">
              the machine is still reading you — browse the CATALOG and it will
              put tonight&apos;s pick here.
            </div>
          )}
        </section>

        <section className="coverwire" aria-label="the wire">
          <div className="psub">THE WIRE — WHAT ARE YOU WEARING?</div>
          <div className="coverposter">
            <Avatar name={getProfileInfo().name} />
            <div className="coverpostbox">
              <textarea
                rows={2}
                maxLength={400}
                placeholder="today's uniform, tonight's find…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="coverpostrow">
                <span className="ccount">{text.length}/400</span>
                <button className="btn" onClick={post} disabled={!text.trim()}>POST</button>
              </div>
            </div>
          </div>
          {posts.slice(0, 4).map((p) => {
            const s = postStats(p);
            return (
              <div className="coverpost" key={p.id}>
                <Avatar name={p.name} />
                <div className="coverpostbody">
                  <div className="coverposthead">
                    <b>{p.name}</b> <span>{p.handle} · {timeAgo(p.at)}</span>
                  </div>
                  <p>{p.text}</p>
                  <div className="coverpoststats">○ {s.comments} · ↻ {s.reposts} · ♥ {s.likes}</div>
                </div>
              </div>
            );
          })}
          {posts.length === 0 && (
            <div className="pempty">no transmissions yet — yours opens the wire.</div>
          )}
        </section>
      </div>

      <div className="covergrid">
        <section aria-label="editorial dispatches">
          <div className="psub">EDITORIAL DISPATCHES</div>
          {STORIES.slice(0, 3).map((st) => (
            <a className="coverstory" key={st.title} href={st.url} target="_blank" rel="noreferrer">
              <span className="coverpub">{st.pub.toUpperCase()}</span>
              <span className="coverstoryttl">{st.title} ↗</span>
              <span className="coverstorysum">{st.summary}</span>
            </a>
          ))}
          <a className="coverall" href="/hotlist">THE FULL EDITORIAL →</a>
        </section>

        <section aria-label="tonight's looks">
          <div className="psub">TONIGHT&apos;S LOOKS — STYLED BY ASTERISK</div>
          {looks.map((lk, i) => (
            <a className="coverlook" key={i} href="/stylist">
              <div className="coverlookthumbs">
                {(lk.items || []).slice(0, 4).map((it) => (
                  <img key={it.id} src={it.img || thumbFor(it)} alt="" />
                ))}
              </div>
              <div className="coverlookline">
                {(lk.dominantTag || "LOOK").toUpperCase()} · {lk.conf} MATCH · USD {Math.round(lk.total || 0)} →
              </div>
            </a>
          ))}
          {looks.length === 0 && (
            <div className="pempty">
              the stylist needs a little taste to work with — stamp your
              PASSPORT and looks appear here.
            </div>
          )}
          <a className="coverall" href="/stylist">OPEN THE STYLIST →</a>
        </section>
      </div>

      <div className="coveridx" aria-label="subsystem index">
        {SUBSYSTEMS.map((s) => (
          <a key={s.href} href={s.href}>
            <b>{s.label}</b>
            <span>{s.meta}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
