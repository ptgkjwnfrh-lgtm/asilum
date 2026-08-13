"use client";

// app/cover/page.js — FRONT COVER.
// The landing edition (owner amendment, July 25: seventh destination),
// rebuilt as a true magazine cover (owner refinement round, Aug 12):
// bold floating masthead type, the machine's pick as an off-grid straight
// hero with type crossing the image, a floating hotlist preview, the wire,
// tonight's looks as a film-strip collage, and editorial dispatches —
// borders only where they earn it. Every displayed value is real state:
// the pick is the feed's actual top item, the hotlist is the live
// person-deduped popularity ranking (feed-fallback labeled honestly),
// the looks come from the live stylist engine.

import { useEffect, useState } from "react";
import { getUid, postJSON, authorizedFetch, thumbFor } from "../../lib/client.js";
import {
  STORIES, fetchWire, addPost, timeAgo, getProfileInfo, sourceFor,
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
  const [posts, setPosts] = useState(null);
  const [postsLive, setPostsLive] = useState(true);
  const [wireNote, setWireNote] = useState("");
  const [hot, setHot] = useState(null);
  const [text, setText] = useState("");
  const [stamp, setStamp] = useState("");
  const [year, setYear] = useState("");

  function loadCoverWire() {
    fetchWire()
      .then((w) => { setPosts(w.posts); setPostsLive(w.live); })
      .catch(() => { setPosts([]); setPostsLive(false); });
  }

  useEffect(() => {
    const user = getUid() || "guest";
    loadCoverWire();
    const now = new Date();
    setStamp(now.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }).toUpperCase());
    setYear(String(now.getFullYear()));
    // The hotlist preview mirrors /hotlist exactly: live person-deduped
    // popularity counters when at least 3 items have them, otherwise the
    // caller's own ranked feed, labeled as such — never dressed as live.
    const feedPromise = authorizedFetch("/api/feed?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .catch(() => null);
    feedPromise.then((d) => setPick(((d && d.items) || [])[0] || null));
    authorizedFetch("/api/stats")
      .then((r) => r.json())
      .then(async (s) => {
        if (s.topItems && s.topItems.length >= 3) {
          setHot({
            live: true,
            rows: s.topItems.slice(0, 5).map((t) => ({
              id: t.id, title: t.title, brand: t.brand,
              stat: (t.engagers ?? 0) + (t.engagers === 1 ? " PERSON" : " PEOPLE"),
            })),
          });
          return;
        }
        const d = await feedPromise;
        setHot({
          live: false,
          rows: ((d && d.items) || []).slice(0, 5).map((it) => ({
            id: it.id, title: it.title, brand: it.brand,
            stat: it._zone === "reach" ? "FAR REACH" : (it._zone || "").toUpperCase(),
          })),
        });
      })
      .catch(() => setHot({ live: false, rows: [] }));
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
    // The server's verdict decides the note — a held-for-review post is
    // saved but invisible to others, and saying "live" would be a lie.
    postJSON("/api/editorial", { user: getUid(), handle: info.handle || info.name, text: t })
      .then(async (res) => {
        const d = await res.json().catch(() => null);
        setWireNote(d && d.held ? (d.note || "your post is saved and paused for a human review") : "");
        loadCoverWire();
      })
      .catch(() => setWireNote("saved on this device — the shared wire could not be reached"));
    loadCoverWire();
    setText("");
  }

  return (
    <div className="wrap cvr">
      <header className="cvmast" aria-label="front cover masthead">
        <div className="cvmastblock">
          <span className="cvmastline"><b className="red">*</b>FRONT</span>
          <span className="cvmastline">COVER</span>
          {year && (
            <span className="cvmastline cvyear">
              {year.slice(0, 2)}<i>{year.slice(2)}</i>
            </span>
          )}
        </div>
        <div className="cvmeta">LIVE EDITION · {stamp}<br />EVERY MODULE OPENS ITS SUBSYSTEM →</div>
      </header>

      {pick ? (
        <a
          className="cvhero"
          aria-label="tonight's pick"
          href={"/?item=" + encodeURIComponent(pick.id)}
        >
          <span className="cvvert" aria-hidden="true">TONIGHT THE MACHINE RECOMMENDS</span>
          <div className="cvheroimg">
            <img src={pick.img || thumbFor(pick)} alt={pick.title || "front cover piece"} />
          </div>
          <div className="cvherotext">
            <span className="cvherobrand">{(pick.brand || "").toUpperCase()}</span>
            <span className="cvherottl">{pick.title}</span>
            <span className="cvheroline">
              {sourceFor(pick)} · {pick.currency || "USD"} {pick.price}
            </span>
            <span className="cvlink">OPEN RECORD →</span>
          </div>
        </a>
      ) : (
        <section className="cvhero cvempty" aria-label="tonight's pick">
          <span className="cvvert" aria-hidden="true">TONIGHT THE MACHINE RECOMMENDS</span>
          <div className="pempty">
            the machine is still reading you — browse the CATALOG and it will
            put tonight&apos;s pick here.
          </div>
        </section>
      )}

      <div className="cvband">
        <section className="cvhot" aria-label="hotlist preview">
          <div className="cvkick">THE HOTLIST</div>
          <div className="cvnote">
            {hot === null
              ? "counting…"
              : hot.live
                ? "ranked live by what everyone is favoriting, bagging, and sharing."
                : "the counters are warming up — this is your own feed standing in, not a shared list."}
          </div>
          {(hot?.rows || []).map((r, i) => (
            <a className="cvhotrow" key={r.id} href={"/?item=" + encodeURIComponent(r.id)}>
              <span className="cvhotnum" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="cvhotttl">
                {r.title}
                <i>{r.brand}</i>
              </span>
              <span className="cvhotstat">{r.stat}</span>
            </a>
          ))}
          {hot && hot.rows.length === 0 && (
            <div className="pempty">nothing yet — go touch the feed.</div>
          )}
          <a className="cvlink cvmore" href="/hotlist">THE FULL HOTLIST →</a>
        </section>

        <section className="cvlooks" aria-label="tonight's looks">
          <div className="cvkick">TONIGHT&apos;S LOOKS — STYLED BY ASTERISK</div>
          {looks.map((lk, i) => (
            <a className="cvlook" key={i} href="/stylist">
              <div className="cvlookstrip">
                {(lk.items || []).slice(0, 4).map((it) => (
                  <img key={it.id} src={it.img || thumbFor(it)} alt="" />
                ))}
              </div>
              <div className="cvlookline">
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
          <a className="cvlink cvmore" href="/stylist">OPEN THE STYLIST →</a>
        </section>
      </div>

      <div className="cvband2">
        <section className="cvwire" aria-label="the wire">
          <div className="cvkick">THE WIRE — WHAT ARE YOU WEARING?</div>
          <div className="cvcompose">
            <Avatar name={getProfileInfo().name} />
            <div className="cvcomposebox">
              <textarea
                rows={2}
                maxLength={400}
                placeholder="today's uniform, tonight's find…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="cvcomposerow">
                <span className="ccount">{text.length}/400</span>
                <button className="btn" onClick={post} disabled={!text.trim()}>POST</button>
              </div>
            </div>
          </div>
          {wireNote && <div className="pempty">{wireNote}</div>}
          {(posts || []).slice(0, 4).map((p) => (
            <div className="cvpost" key={p.id}>
              <p className="cvposttext">{p.text}</p>
              <span className="cvposthandle">
                {p.handle}{p.mine ? <i className="cmine">you</i> : null} · {timeAgo(p.at)}
              </span>
            </div>
          ))}
          {posts && !postsLive && (
            <div className="pempty">
              the shared wire could not be reached — showing this device&apos;s
              posts only.
            </div>
          )}
          {posts && postsLive && posts.length === 0 && (
            <div className="pempty">no transmissions yet — yours opens the wire.</div>
          )}
        </section>

        <section className="cvstories" aria-label="editorial dispatches">
          <div className="cvkick">EDITORIAL DISPATCHES</div>
          {STORIES.slice(0, 3).map((st) => (
            <a className="cvstory" key={st.title} href={st.url} target="_blank" rel="noreferrer">
              <span className="cvpub">{st.pub.toUpperCase()}</span>
              <span className="cvstoryttl">{st.title} ↗</span>
              <span className="cvstorysum">{st.summary}</span>
            </a>
          ))}
          <a className="cvlink cvmore" href="/hotlist">THE FULL EDITORIAL →</a>
        </section>
      </div>

      <nav className="cvindex" aria-label="subsystem index">
        {SUBSYSTEMS.map((s) => (
          <a key={s.href} href={s.href}>
            <b>{s.label}</b>
            <span>{s.meta}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
