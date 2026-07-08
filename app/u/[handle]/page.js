"use client";

// app/u/[handle]/page.js — another user's account page.
// Banner, avatar, identity, follow button, their posts, and pieces in their
// aesthetic. Users are placeholder accounts until real ones exist.

import { useEffect, useState } from "react";
import { thumbFor, hashStr } from "../../../lib/client.js";
import { MOCK_USERS, listPosts, postStats, timeAgo } from "../../../lib/social.js";
import { Avatar, FollowButton } from "../../components/UserBits.jsx";

export default function UserPage({ params }) {
  const handle = decodeURIComponent(params.handle || "");
  const user = MOCK_USERS.find((u) => u.handle === handle);
  const [pieces, setPieces] = useState([]);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    setPosts(listPosts().filter((p) => p.handle === handle));
    if (user) {
      fetch("/api/discover?tag=" + encodeURIComponent(user.tags[0]) + "&limit=8")
        .then((r) => r.json())
        .then((d) => setPieces(d.items || []))
        .catch(() => {});
    }
  }, [handle]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className="wrap">
        <h1 className="headline"><span className="red">*</span>NOT FOUND</h1>
        <p className="deck">no one wears that handle yet.</p>
        <a className="btn ghost" href="/">back to the feed</a>
      </div>
    );
  }

  const followers = 100 + (hashStr(handle) % 900);

  return (
    <div className="wrap">
      <div className="pbanner"><span>*</span></div>
      <div className="phead2">
        <div className="pavatar"><Avatar name={user.name} /></div>
        <div className="pident">
          <div className="pname">{user.name}</div>
          <div className="uhandle">{user.handle}</div>
          <p className="pbio">{user.tags.join(" / ").toLowerCase()} — taste on record.</p>
          <div className="pcounts">
            <span><b>{(hashStr(handle) >> 4) % 60}</b> FOLLOWING</span>
            <span><b>{user.tags.length}</b> AESTHETICS</span>
            <span><b>{followers}</b> FOLLOWERS</span>
          </div>
        </div>
        <FollowButton handle={user.handle} />
      </div>

      <h3 className="statshead">POSTS</h3>
      {posts.length === 0 && <div className="empty">quiet lately.</div>}
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

      <h3 className="statshead">IN THEIR AESTHETIC</h3>
      <div className="grid">
        {pieces.map((it) => (
          <a className="card" key={it.id} href={"/?item=" + encodeURIComponent(it.id)}>
            <div className="imgwrap">
              <img src={it.img || thumbFor(it)} alt={it.title} loading="lazy" />
            </div>
            <div className="body">
              <div className="ttl">{it.title}</div>
              {it.price ? <div className="price">{it.currency || "USD"} {it.price}</div> : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
