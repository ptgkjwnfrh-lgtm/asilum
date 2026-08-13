"use client";

// app/cover/page.js — FRONT COVER.
// The landing edition (owner amendment, July 25: seventh destination),
// rebuilt as a true magazine cover (owner refinement round, Aug 12) and
// densified to full magazine weight (owner round 3, Aug 13): thick
// floating highlight frames over the look strips (State 3.0 reference),
// a contact-sheet film strip beside the hero (Rag & Bone reference),
// Warp-sleeve credit stacks, a field of non-uniform contrast hairlines,
// and magazine marginalia in every gutter. Every displayed value is real
// state: the pick is the feed's actual top item, the hotlist is the live
// person-deduped popularity ranking (feed-fallback labeled honestly),
// the looks come from the live stylist engine, and the marginalia print
// the system ledger's own counters — nothing decorative is invented.

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

// The hairline field (owner order, Aug 13; diagonals swapped for
// verticals same day): horizontal and vertical contrast lines, a few
// thick, most thin, most barely there. Hand-placed and deterministic —
// print texture, not motion, so no random at render.
const HAIRLINES = [
  "cvln-h1", "cvln-h2", "cvln-h3", "cvln-h4", "cvln-h5", "cvln-h6",
  "cvln-v1", "cvln-v2", "cvln-v3", "cvln-v4", "cvln-v5",
];

export default function CoverPage() {
  const [feed, setFeed] = useState([]);
  const [looks, setLooks] = useState([]);
  const [posts, setPosts] = useState(null);
  const [postsLive, setPostsLive] = useState(true);
  const [wireNote, setWireNote] = useState("");
  const [hot, setHot] = useState(null);
  const [sys, setSys] = useState(null);
  const [text, setText] = useState("");
  const [stamp, setStamp] = useState("");
  const [year, setYear] = useState("");

  const pick = feed[0] || null;
  const film = feed.slice(1, 7);

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
    feedPromise.then((d) => setFeed(((d && d.items) || []).slice(0, 9)));
    authorizedFetch("/api/stats")
      .then((r) => r.json())
      .then(async (s) => {
        setSys(s);
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

  const ledger = sys
    ? `${sys.interactions} INTERACTIONS · ${sys.users} READERS · ${sys.boards} BOARDS · ${sys.edges} GRAPH EDGES`
    : "";

  return (
    <div className="wrap cvr">
      <div className="cvlines" aria-hidden="true">
        {HAIRLINES.map((c) => <i key={c} className={c} />)}
      </div>

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
        <div className="cvmeta">
          LIVE EDITION · {stamp}<br />EVERY MODULE OPENS ITS SUBSYSTEM →
          {ledger && <span className="cvledger">SYSTEM LEDGER — {ledger}</span>}
        </div>
      </header>

      <div className="cvherorow">
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
            {/* Warp-sleeve credit stack — labels float, values are real */}
            <div className="cvcred" aria-hidden="true">
              <span className="cclbl">PIECE No.</span>
              <span className="ccval">{pick.id}</span>
              <span className="cclbl">SOURCE</span>
              <span className="ccval">{sourceFor(pick)}</span>
              {pick._zone && (
                <>
                  <span className="cclbl">PULLED FROM</span>
                  <span className="ccval">{pick._zone === "reach" ? "FAR REACH" : String(pick._zone).toUpperCase()} ZONE</span>
                </>
              )}
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

        {film.length > 0 && (
          <aside className="cvfilm" aria-label="next in your ranking">
            <span className="cvfilmlbl">NEXT IN YOUR RANKING</span>
            {film.map((it, i) => (
              <a key={it.id} href={"/?item=" + encodeURIComponent(it.id)}>
                <img src={it.img || thumbFor(it)} alt={it.title} />
                <b>{String(i + 2).padStart(2, "0")} · {(it.brand || "").toUpperCase()}</b>
              </a>
            ))}
          </aside>
        )}
      </div>

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
          <span className="cvside" aria-hidden="true">
            STATE — {sys ? (sys.persistent ? "PERSISTENT LEDGER" : "MEMORY MODE") : "READING"}
          </span>
          <div className="cvkick">TONIGHT&apos;S LOOKS — STYLED BY ASTERISK</div>
          {looks.map((lk, i) => (
            <a className="cvlook" key={i} href="/stylist">
              <div className="cvlookstrip">
                {/* thick floating frames (owner order, Aug 13): the lead
                    piece of each strip is the highlight — the frame also
                    captures empty space, State 3.0 style; images stay
                    straight, only lines get angles */}
                <i className={"tdrf " + (i === 0 ? "tdrfa" : "tdrfb")} aria-hidden="true" />
                {i === 1 && <i className="tdrf tdrfb2" aria-hidden="true" />}
                {(lk.items || []).slice(0, 4).map((it) => (
                  <img key={it.id} src={it.img || thumbFor(it)} alt="" />
                ))}
              </div>
              <div className="cvcredit">
                <span className="cclbl">ORDER No.</span>
                <span className="ccval">{String(i + 1).padStart(2, "0")}</span>
                <span className="cclbl">LOOK</span>
                <span className="ccval">{(lk.dominantTag || "LOOK").toUpperCase()}</span>
                <span className="cclbl">CREDITS</span>
                <span className="ccval">
                  CUT BY ASTERISK · {lk.conf} MATCH · USD {Math.round(lk.total || 0)}
                  {(lk.items || [])[0] ? ` · HIGHLIGHT — ${(lk.items[0].title || "").toUpperCase()}` : ""} →
                </span>
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
          {(posts || []).slice(0, 4).map((p, i) => (
            <div className={"cvpost" + (i === 0 ? " cvlead" : "")} key={p.id}>
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
          <span className="cvside cvsider" aria-hidden="true">
            {sys && sys.alphaEvents != null ? `${sys.alphaEvents} EVENTS ON THE RECORD` : "THE RECORD IS LISTENING"}
          </span>
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

      <footer className="cvcolo" aria-label="colophon">
        *ASILUM LIVE EDITION · {stamp}
        {ledger && <> · SYSTEM LEDGER {ledger}</>}
        {" "}· EVERY VALUE ON THIS PAGE IS REAL STATE — NOTHING IS STAGED
      </footer>
    </div>
  );
}
