"use client";

// app/u/[handle]/page.js — a poster's public page (the identity chain,
// owner order Aug 13: every wire byline lands somewhere REAL), in the
// account page's header (ProfileHead.jsx; owner's sketch, 4 Nov 2026: the
// avatar and the room's song, the handle, the counts, FOLLOW and MESSAGE,
// the live echoes, then POSTS · REPOSTS · FEATURED).
// Resolution order, all server truth:
//   1. A published ROOM at this handle → the header from the room (the
//      statement as the bio, the anthem as the song), the poster's visible
//      transmissions under POSTS, the room itself under FEATURED.
//   2. No room but visible transmissions exist → an honest reader page:
//      their posts, plus "this reader hasn't published a room."
//   3. Neither → NOT FOUND.
// The "@"-prefixed MOCK_USERS demo layer keeps its old view (demo
// surfaces only reach it when demo social is enabled); claimed handles
// never start with "@".
// Every count is a measurement or a dash: FOLLOWERS is the public count
// (/api/follow?followers=); LISTINGS and FOLLOWING are their owner's own
// records and print "—" here with the reason.

import { use, useEffect, useState } from "react";
import { thumbFor, hashStr, aspectFor } from "../../../lib/client.js";
import { MOCK_USERS, listPosts, postStats, timeAgo, fetchPostsByHandle } from "../../../lib/social.js";
import { Avatar, FollowButton } from "../../components/UserBits.jsx";
import ProfileHead, { ProfileTabs, PostGrid, useFollowers } from "../../components/ProfileHead.jsx";
import GlassPane from "../../components/GlassPane.jsx";
import { PublicRoom } from "../../components/ProfileRoom.jsx";
import { ColorEvidenceLine, OriginLine, OriginSticker, ProductFitLine, useFitBrain } from "../../components/ProductSignals.jsx";

const PUBLIC_TABS = [["posts", "POSTS"], ["reposts", "REPOSTS"], ["featured", "FEATURED"]];
const TAB_ICONS = { posts: "grid", reposts: "repost", featured: "featured" };

// the public key row: FOLLOW, and MESSAGE to the mail desk on that person
// (the same event the storefront's MESSAGE key sends; DmLive.jsx answers it)
function PublicKeys({ handle }) {
  return (
    <>
      <FollowButton handle={handle} />
      <button type="button" className="pf3key" onClick={() => window.dispatchEvent(new CustomEvent("asilum:dm-open", { detail: { handle } }))}>MESSAGE</button>
    </>
  );
}

// the poster's transmissions as the grid; the wire's reachability stated
function WireGrid({ wire }) {
  if (wire === null) return <div className="empty">pulling their transmissions…</div>;
  return (
    <>
      {!wire.live && (
        <div className="empty">the Feed could not be reached — their transmissions are unavailable right now.</div>
      )}
      <PostGrid posts={wire.posts} emptyNode={wire.live ? <div className="empty">no transmissions yet.</div> : null} />
    </>
  );
}

const REPOSTS_NOTE = <div className="empty">reposting is not built yet — nothing here is a measurement. <span className="soon">NOT WIRED YET</span></div>;

export default function UserPage({ params }) {
  const fit = useFitBrain();
  // Next 16 passes params as a promise — unwrap it, or the first render
  // sees an empty handle and every lookup below misfires.
  const handle = String(use(params).handle || "");
  const user = MOCK_USERS.find((u) => u.handle === handle);
  const [pieces, setPieces] = useState([]);
  const [posts, setPosts] = useState([]);
  const [wire, setWire] = useState(null);       // { posts, live } for real handles
  const [room, setRoom] = useState(null);
  const [roomChecked, setRoomChecked] = useState(!handle || handle.startsWith("@"));
  const [tab, setTab] = useState("posts");
  const followers = useFollowers(handle.startsWith("@") ? null : handle);

  useEffect(() => {
    setPosts(listPosts().filter((p) => p.handle === handle));
    let stale = false;
    if (handle && !handle.startsWith("@")) {
      fetch("/api/profile/room?handle=" + encodeURIComponent(handle))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!stale) { setRoom(d?.room || null); setRoomChecked(true); } })
        .catch(() => { if (!stale) setRoomChecked(true); });
      fetchPostsByHandle(handle)
        .then((w) => { if (!stale) setWire(w); })
        .catch(() => { if (!stale) setWire({ posts: [], live: false }); });
    }
    if (user) {
      fetch("/api/discover?tag=" + encodeURIComponent(user.tags[0]) + "&limit=8")
        .then((r) => r.json())
        .then((d) => { if (!stale) setPieces(d.items || []); })
        .catch(() => {});
    }
    return () => { stale = true; };
  }, [handle]); // eslint-disable-line react-hooks/exhaustive-deps

  const publicCounts = (postCount) => [
    { key: "posts", label: "POSTS", value: postCount, title: "the Feed could not be reached" },
    { key: "listings", label: "LISTINGS", value: null, title: "a storefront's listings are counted on its own page" },
    { key: "followers", label: "FOLLOWERS", value: followers, title: "the follower count could not be read" },
    { key: "following", label: "FOLLOWING", value: null, title: "who they follow is their own record" },
  ];

  if (room) {
    const mod = (id) => room.modules.find((m) => m.module === id);
    const statement = mod("statement")?.content?.text || "";
    const anthem = mod("soundtrack")?.content?.entities?.[0] || null;
    return (
      <div className="wrap pf3">
        <div className="locline"><a href="/">← THE FEED</a><span>/ {handle}</span></div>
        <GlassPane glass="lg-u-head" className="pfhead" aria-label="identity">
          <ProfileHead
            title={<h1 className="pf3title">{room.handle}</h1>}
            name={room.handle}
            handle={"*" + room.handle}
            bio={statement}
            counts={publicCounts(wire ? wire.posts.length : null)}
            song={anthem ? { name: anthem.name, label: anthem.label } : null}
            songHref={anthem ? "/discover?q=" + encodeURIComponent(anthem.name) : null}
            actions={<PublicKeys handle={handle} />}
            echoes={wire ? wire.posts : []}
          />
        </GlassPane>
        <ProfileTabs tabs={PUBLIC_TABS} icons={TAB_ICONS} tab={tab} onTab={setTab} />
        <div className="pf3sheet" aria-live="polite">
          {tab === "posts" && <WireGrid wire={wire} />}
          {tab === "reposts" && REPOSTS_NOTE}
          {tab === "featured" && <PublicRoom room={room} handle={handle} />}
        </div>
      </div>
    );
  }
  if (!roomChecked) return <div className="wrap"><div className="empty">…</div></div>;

  // No published room — but a real poster still gets a real page.
  if (!user && !handle.startsWith("@")) {
    if (wire === null) return <div className="wrap"><div className="empty">…</div></div>;
    if (wire.posts.length > 0 || !wire.live) {
      return (
        <div className="wrap pf3">
          <div className="locline"><a href="/">← THE FEED</a><span>/ {handle}</span></div>
          <GlassPane glass="lg-u-head" className="pfhead" aria-label="identity">
            <ProfileHead
              title={<h1 className="pf3title">{handle}</h1>}
              name={handle}
              handle={"*" + handle}
              bio="this reader hasn't published a room — only their wire record speaks for them."
              counts={publicCounts(wire.live ? wire.posts.length : null)}
              actions={<PublicKeys handle={handle} />}
              echoes={wire.posts}
            />
          </GlassPane>
          <ProfileTabs tabs={PUBLIC_TABS} icons={TAB_ICONS} tab={tab} onTab={setTab} />
          <div className="pf3sheet" aria-live="polite">
            {tab === "posts" && <WireGrid wire={wire} />}
            {tab === "reposts" && REPOSTS_NOTE}
            {tab === "featured" && <div className="empty">no room published — nothing is featured.</div>}
          </div>
        </div>
      );
    }
  }

  if (!user) {
    return (
      <div className="wrap">
        <h1 className="headline"><span className="red">*</span>NOT FOUND</h1>
        <p className="deck">no one wears that handle yet.</p>
        <a className="btn ghost" href="/">back to the feed</a>
      </div>
    );
  }

  // THE DEMO LAYER (MOCK_USERS, demo social only): the fixture's own
  // numbers, which are the fixture's — not a measurement of anyone.
  const demoFollowers = 100 + (hashStr(handle) % 900);
  return (
    <div className="wrap pf3">
      <GlassPane glass="lg-u-head" className="pfhead" aria-label="identity">
        <ProfileHead
          title={<h1 className="pf3title">{user.name}</h1>}
          name={user.name}
          handle={user.handle}
          bio={user.tags.join(" / ").toLowerCase() + " — taste on record."}
          counts={[
            { key: "posts", label: "POSTS", value: posts.length },
            { key: "aesthetics", label: "AESTHETICS", value: user.tags.length },
            { key: "followers", label: "FOLLOWERS", value: demoFollowers },
            { key: "following", label: "FOLLOWING", value: (hashStr(handle) >> 4) % 60 },
          ]}
          actions={<PublicKeys handle={user.handle} />}
        />
      </GlassPane>

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
                <span className="castat" title="comments">○ {s.comments}</span>
                <span className="castat" title="reposts">↻ {s.reposts}</span>
                <span className="castat" title="likes">♥ {s.likes}</span>
              </div>
            </div>
          </div>
        );
      })}

      <h3 className="statshead">IN THEIR AESTHETIC</h3>
      <div className="grid">
        {pieces.map((it) => (
          <a className="card" key={it.id} href={"/?item=" + encodeURIComponent(it.id)}>
            <div className="imgwrap" style={{ aspectRatio: aspectFor(it.id) }}>
              <OriginSticker item={it} />
              <img src={it.img || thumbFor(it)} alt={it.title} loading="lazy" />
            </div>
            <div className="body">
              <div className="ttl">{it.title}</div>
              <ColorEvidenceLine item={it} />
              <OriginLine item={it} />
              <ProductFitLine item={it} fit={fit} />
              {it.price ? <div className="price">{it.currency || "USD"} {it.price}</div> : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
