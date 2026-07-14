"use client";

// app/hotlist/page.js — EDITORIAL / HOTLIST.
// Three tabs: STORIES (a fashion magazine feed inside a marketplace — original
// one-line summaries linking out to the publications, never copied text or
// images), HOTLIST (live ranking from the popularity counters), and COMMUNITY
// (user posts).

import { useEffect, useState } from "react";
import { getUid, authorizedFetch, thumbFor } from "../../lib/client.js";
import { STORIES, listPosts, postStats, timeAgo } from "../../lib/social.js";
import { Avatar } from "../components/UserBits.jsx";

export default function EditorialPage() {
  const [tab, setTab] = useState("stories");
  const [rows, setRows] = useState(null);
  const [live, setLive] = useState(true);
  const [posts, setPosts] = useState([]);
  const [liked, setLiked] = useState(() => new Set());

  useEffect(() => {
    setPosts(listPosts());
    fetch("/api/stats")
      .then((r) => r.json())
      .then(async (s) => {
        if (s.topItems && s.topItems.length >= 3) {
          setLive(true);
          setRows(s.topItems.map((t) => ({
            id: t.id, title: t.title, brand: t.brand,
            stat: Math.round(t.eng * 10) / 10 + " engagements", item: null,
          })));
          return;
        }
        setLive(false);
        const f = await authorizedFetch("/api/feed?user=" + encodeURIComponent(getUid() || "guest")).then((r) => r.json());
        setRows((f.items || []).slice(0, 10).map((it) => ({
          id: it.id, title: it.title, brand: it.brand,
          stat: it._zone === "reach" ? "far reach" : it._zone, item: it,
        })));
      })
      .catch(() => setRows([]));
  }, []);

  const top = STORIES[0];
  const rest = STORIES.slice(1);

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>EDITORIAL</h1>
      <p className="deck">the magazine layer — stories, the live hotlist, and the community floor.</p>

      <div className="tabs">
        {[["stories", "STORIES"], ["hotlist", "HOTLIST"], ["community", "COMMUNITY"]].map(([k, label]) => (
          <button key={k} className={"tab" + (tab === k ? " cur" : "")} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* ---- STORIES ---- */}
      {tab === "stories" && (
        <>
          <div className="storyband">
            <a className="storybig" href={top.url} target="_blank" rel="noopener noreferrer">
              <div className="storypub">{top.pub}</div>
              <div className="storyttl">{top.title}</div>
              <p className="storysum">{top.summary}</p>
              <span className="readlink">Read full article ↗</span>
            </a>
            <div className="adbox">
              <div className="adlabel">EDITORIAL SUBMISSIONS</div>
              <div className="adbody">
                <span className="adstar">*</span>
                submission intake requires setup.
                <em>coming soon</em>
              </div>
            </div>
          </div>
          <div className="storygrid">
            {rest.map((s) => (
              <a className="storycard" key={s.title} href={s.url} target="_blank" rel="noopener noreferrer">
                <div className="storypub">{s.pub}</div>
                <div className="storyttl small">{s.title}</div>
                <p className="storysum">{s.summary}</p>
                <span className="readlink">Read full article ↗</span>
              </a>
            ))}
            <div className="adbox slim">
              <div className="adlabel">ADVERTISEMENT</div>
              <div className="adbody"><span className="adstar">*</span>space for taste.</div>
            </div>
          </div>
          <p className="deck" style={{ marginTop: 18 }}>
            summaries are original — full stories live with the publications.
          </p>
        </>
      )}

      {/* ---- HOTLIST ---- */}
      {tab === "hotlist" && (
        <>
          <p className="deck">
            <span className="pulse" />
            {live
              ? "ranked live by what everyone is favoriting, bagging, and sharing."
              : "the counters are warming up — today's list is an editorial pick."}
          </p>
          {!rows && <div className="empty">counting…</div>}
          {rows && rows.length === 0 && <div className="empty">nothing yet — go touch the feed.</div>}
          {rows && rows.map((r, i) => (
            <a className="hlrow" key={r.id} href={"/?item=" + encodeURIComponent(r.id)}>
              <div className="hlnum">{String(i + 1).padStart(2, "0")}</div>
              {r.item ? <img src={r.item.img || thumbFor(r.item)} alt="" /> : null}
              <div className="hlinfo">
                <div className="hlttl">{r.title}</div>
                <div className="hlbrand">{r.brand}</div>
              </div>
              <div className="hlstat">{r.stat}</div>
            </a>
          ))}
        </>
      )}

      {/* ---- COMMUNITY ---- */}
      {tab === "community" && (
        <>
          {posts.map((p) => {
            const s = postStats(p);
            const isLiked = liked.has(p.id);
            return (
              <div className="cpost" key={p.id}>
                <Avatar name={p.name} />
                <div className="cbody">
                  <div className="chead">
                    <span className="uname">{p.name}</span>
                    <span className="uhandle">{p.handle} · {timeAgo(p.at)}</span>
                    {p.mine ? <span className="cmine">you</span> : null}
                  </div>
                  <p className="ctext">{p.text}</p>
                  <div className="cacts">
                    <button title="comments">○ {s.comments}</button>
                    <button title="reposts">↻ {s.reposts}</button>
                    <button
                      title="like"
                      className={isLiked ? "on" : ""}
                      onClick={() => setLiked((prev) => {
                        const n = new Set(prev);
                        n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                        return n;
                      })}
                    >
                      ♥ {s.likes + (isLiked ? 1 : 0)}
                    </button>
                    <button
                      title="share"
                      onClick={() => navigator.clipboard && navigator.clipboard.writeText(window.location.origin + "/hotlist").catch(() => {})}
                    >
                      ↗
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <p className="deck" style={{ marginTop: 16 }}>
            post from the composer on HOME — “what are you wearing?”
          </p>
        </>
      )}
    </div>
  );
}
