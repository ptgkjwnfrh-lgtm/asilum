"use client";

// app/components/UserBits.jsx
// Reusable social atoms: monogram avatar, "Who to follow" module, and the
// user search bar. All follow state is local until real accounts exist.

import { useState } from "react";
import { DEMO_SOCIAL_ENABLED, MOCK_USERS, searchUsers, followedUsers, setFollowUser } from "../../lib/social.js";

export function Avatar({ name }) {
  const initials = String(name || "?")
    .split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span className="uavatar">{initials}</span>;
}

export function FollowButton({ handle }) {
  const [on, setOn] = useState(() => followedUsers().includes(handle));
  return (
    <button
      className={"followbtn" + (on ? " on" : "")}
      onClick={() => { setFollowUser(handle, !on); setOn(!on); }}
    >
      {on ? "Following ✓" : "Follow"}
    </button>
  );
}

export function WhoToFollowList({ compact = false, withSearch = false }) {
  const [page, setPage] = useState(0);
  const per = compact ? 3 : 5;
  const slice = MOCK_USERS.slice(page * per, page * per + per);
  return (
    <>
      {!DEMO_SOCIAL_ENABLED && (
        <div className="pempty">real people appear here after account discovery ships. load-test profiles are hidden.</div>
      )}
      {withSearch && <UserSearch placeholder="find people…" />}
      {slice.map((u) => (
        <div className="urow" key={u.handle}>
          <a href={"/u/" + encodeURIComponent(u.handle)}><Avatar name={u.name} /></a>
          <a className="uinfo" href={"/u/" + encodeURIComponent(u.handle)}>
            <div className="uname">{u.name}</div>
            <div className="uhandle">{u.handle} · {u.tags.join(" / ").toLowerCase()}</div>
          </a>
          <FollowButton handle={u.handle} />
        </div>
      ))}
      {MOCK_USERS.length > per && (
        <button
          className="modmore"
          onClick={() => setPage((p) => ((p + 1) * per >= MOCK_USERS.length ? 0 : p + 1))}
        >
          show more →
        </button>
      )}
    </>
  );
}

export function UserSearch({ placeholder = "search users…" }) {
  const [q, setQ] = useState("");
  const hits = searchUsers(q).slice(0, 5);
  return (
    <div className="usearch">
      <input
        type="text"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
      />
      {q && (
        <div className="usearchhits">
          {hits.length === 0 && <div className="uhandle" style={{ padding: "8px 0" }}>no one yet — invite them.</div>}
          {hits.map((u) => (
            <div className="urow" key={u.handle}>
              <a href={"/u/" + encodeURIComponent(u.handle)}><Avatar name={u.name} /></a>
              <a className="uinfo" href={"/u/" + encodeURIComponent(u.handle)}>
                <div className="uname">{u.name}</div>
                <div className="uhandle">{u.handle}</div>
              </a>
              <FollowButton handle={u.handle} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
