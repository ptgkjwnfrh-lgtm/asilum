"use client";

// app/profile/page.js — PROFILE.
// Banner, avatar, identity, counts, and three tabs: Posts / Brands /
// Purchases. Identity is local until real accounts exist; counts blend real
// data (board follows, order brands) with placeholder followers.

import { useEffect, useState } from "react";
import { getUid, authorizedFetch, thumbFor, hashStr } from "../../lib/client.js";
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
  const [orders, setOrders] = useState([]);
  const [boardFollows, setBoardFollows] = useState(0);
  const [uid, setUid] = useState(""); // set after mount — SSR/client markup must match

  useEffect(() => {
    setInfo(getProfileInfo());
    setPosts(listPosts().filter((p) => p.mine));
    const user = getUid() || "guest";
    setUid(user);
    authorizedFetch("/api/orders?user=" + encodeURIComponent(user))
      .then((r) => r.json()).then((d) => setOrders(d.orders || [])).catch(() => {});
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .then((d) => setBoardFollows(((d.profile || {})._meta || {}).follows?.length || 0))
      .catch(() => {});
  }, []);

  function save(k, v) {
    setInfo((prev) => { const n = { ...prev, [k]: v }; saveProfileInfo(n); return n; });
  }

  if (!info) return <div className="wrap"><div className="empty">…</div></div>;

  const brands = [...new Set(orders.map((o) => o.brand).filter(Boolean))];
  const followingCount = followedUsers().length + boardFollows;
  const followers = 100 + (hashStr(uid || "x") % 900); // placeholder until accounts exist

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
        {[["posts", "POSTS"], ["brands", "BRANDS"], ["purchases", "PURCHASES"]].map(([k, label]) => (
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

      {tab === "brands" && <BrandsTab purchaseBrands={brands} />}

      {tab === "purchases" && (
        <>
          {orders.length === 0 && <div className="empty">no purchases yet.</div>}
          {orders.slice(0, 12).map((o, i) => (
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
// your purchases (followable).
function BrandsTab({ purchaseBrands }) {
  const [followed, setFollowed] = useState(() => followedBrands());
  function toggle(b) {
    const on = !followed.includes(b);
    setFollowed(setFollowBrand(b, on));
  }
  const candidates = purchaseBrands.filter((b) => !followed.includes(b));
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
      <h3 className="statshead">FROM YOUR PURCHASES</h3>
      {candidates.length === 0 ? (
        <div className="empty">everything you bought is already followed — or nothing is bagged yet.</div>
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
