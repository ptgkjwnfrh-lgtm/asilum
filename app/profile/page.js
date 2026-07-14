"use client";

// app/profile/page.js — PROFILE.
// Banner, avatar, identity, counts, and three tabs: Posts / Brands /
// Bag. Identity is local until real accounts exist; all displayed counts are
// derived from real local/server state.

import { useEffect, useState } from "react";
import { getUid, authorizedFetch, thumbFor } from "../../lib/client.js";
import {
  getProfileInfo, saveProfileInfo, listPosts, postStats, timeAgo,
  followedUsers, followedBrands, setFollowBrand, sourceFor,
} from "../../lib/social.js";
import { Avatar, UserSearch } from "../components/UserBits.jsx";

export default function ProfilePage() {
  const [info, setInfo] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState([]);
  const [bagHistory, setBagHistory] = useState([]);
  const [boardFollows, setBoardFollows] = useState(0);

  useEffect(() => {
    setInfo(getProfileInfo());
    setPosts(listPosts().filter((p) => p.mine));
    const user = getUid() || "guest";
    authorizedFetch("/api/orders?user=" + encodeURIComponent(user))
      .then((r) => r.json()).then((d) => setBagHistory(d.bagHistory || [])).catch(() => {});
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .then((d) => setBoardFollows(((d.profile || {})._meta || {}).follows?.length || 0))
      .catch(() => {});
  }, []);

  function save(k, v) {
    setInfo((prev) => { const n = { ...prev, [k]: v }; saveProfileInfo(n); return n; });
  }

  if (!info) return <div className="wrap"><div className="empty">…</div></div>;

  const brands = [...new Set(bagHistory.map((o) => o.brand).filter(Boolean))];
  const followingCount = followedUsers().length + boardFollows;
  const followers = 0;

  return (
    <div className="wrap">
      <div className="pbanner"><span>*</span></div>
      <div className="phead2">
        <div className="pavatar"><Avatar name={info.name} /></div>
        <div className="pident">
          {editing ? (
            <>
              <input className="pedit" value={info.name} onChange={(e) => save("name", e.target.value)} />
              <input className="pedit small" value={info.handle} onChange={(e) => save("handle", e.target.value)} />
              <textarea className="pedit small" rows={2} value={info.bio} onChange={(e) => save("bio", e.target.value)} />
            </>
          ) : (
            <>
              <div className="pname">{info.name}</div>
              <div className="uhandle">{info.handle}</div>
              <p className="pbio">{info.bio}</p>
            </>
          )}
          <div className="pcounts">
            <span><b>{followingCount}</b> FOLLOWING</span>
            <span><b>{brands.length}</b> BRANDS</span>
            <span><b>{followers}</b> FOLLOWERS</span>
          </div>
        </div>
        <button className="btn ghost" onClick={() => setEditing((e) => !e)}>
          {editing ? "DONE" : "EDIT PROFILE"}
        </button>
      </div>

      <div className="tabs">
        {[["posts", "POSTS"], ["brands", "BRANDS"], ["bag", "BAG"]].map(([k, label]) => (
          <button key={k} className={"tab" + (tab === k ? " cur" : "")} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <>
          {posts.length === 0 && (
            <div className="empty">no posts yet — the composer lives on HOME.</div>
          )}
          {posts.map((p) => {
            const s = postStats(p);
            return (
              <div className="cpost" key={p.id}>
                <Avatar name={p.name} />
                <div className="cbody">
                  <div className="chead">
                    <span className="uname">{p.name}</span>
                    <span className="uhandle">{p.handle} · {timeAgo(p.at)}</span>
                  </div>
                  <p className="ctext">{p.text}</p>
                  <div className="cacts">
                    <button>○ {s.comments}</button><button>↻ {s.reposts}</button><button>♥ {s.likes}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === "brands" && <BrandsTab bagBrands={brands} />}

      {tab === "bag" && (
        <>
          {bagHistory.length === 0 && <div className="empty">nothing in bag history yet.</div>}
          {bagHistory.slice(0, 12).map((o, i) => (
            <a className="hlrow" key={o.id + i} href={"/?item=" + encodeURIComponent(o.id)}>
              <img src={o.img || thumbFor(o)} alt="" />
              <div className="hlinfo">
                <div className="hlttl" style={{ fontSize: 15 }}>{o.title}</div>
                <div className="hlbrand">{o.brand} — {sourceFor(o)}</div>
              </div>
              <div className="hlstat">{o.price ? `USD ${o.price}` : "—"}</div>
            </a>
          ))}
          <a className="btn ghost" href="/orders" style={{ display: "inline-block", marginTop: 10 }}>
            ALL ORDERS & TICKETS →
          </a>
        </>
      )}

      <hr className="rule" style={{ marginTop: 30 }} />
      <h3 className="statshead">FIND PEOPLE</h3>
      <div style={{ maxWidth: 420 }}>
        <UserSearch placeholder="search users to follow…" />
      </div>
    </div>
  );
}

// Following section for brands: what you follow (removable) + brands from
// brands from your bag intent (followable).
function BrandsTab({ bagBrands }) {
  const [followed, setFollowed] = useState(() => followedBrands());
  function toggle(b) {
    const on = !followed.includes(b);
    setFollowed(setFollowBrand(b, on));
  }
  const candidates = bagBrands.filter((b) => !followed.includes(b));
  return (
    <>
      <h3 className="statshead" style={{ marginTop: 8 }}>FOLLOWING</h3>
      {followed.length === 0 ? (
        <div className="empty">no brands followed yet — follow one below or from any piece.</div>
      ) : (
        <div className="tagfilter">
          {followed.map((b) => (
            <span className="chip clickable cur" key={b} onClick={() => toggle(b)}>{b} ×</span>
          ))}
        </div>
      )}
      <h3 className="statshead">FROM YOUR BAG</h3>
      {candidates.length === 0 ? (
        <div className="empty">every bag brand is already followed — or nothing is bagged yet.</div>
      ) : (
        <div className="tagfilter">
          {candidates.map((b) => (
            <span className="chip clickable" key={b} onClick={() => toggle(b)}>+ {b}</span>
          ))}
        </div>
      )}
    </>
  );
}
