"use client";

// app/profile/page.js — PROFILE.
// Banner, avatar, identity, counts, and three tabs: Posts / Brands /
// Bag. Identity is local until real accounts exist; all displayed counts are
// derived from real local/server state.

import { useEffect, useState } from "react";
import {
  EMPTY_FIT, getUid, authorizedFetch, thumbFor, loadFitProfile,
  loadServerFitProfile, saveFitProfile, saveServerFitProfile, sendJSON,
} from "../../lib/client.js";
import { convertMeasurementUnit, MEASUREMENT_KEYS } from "../../lib/brain/measurements.js";
import {
  getProfileInfo, saveProfileInfo, listPosts, postStats, timeAgo,
  followedUsers, followedBrands, setFollowBrand, sourceFor,
} from "../../lib/social.js";
import { Avatar, UserSearch } from "../components/UserBits.jsx";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";

export default function ProfilePage() {
  const fit = useFitBrain();
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

      <MeasurementsEditor />

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
                <ColorEvidenceLine item={o} />
                <ProductFitLine item={o} fit={fit} />
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

function MeasurementsEditor() {
  const [profile, setProfile] = useState(EMPTY_FIT);
  const [status, setStatus] = useState("loading your fit profile…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const local = loadFitProfile();
    setProfile(local);
    loadServerFitProfile(getUid()).then((server) => {
      const hasServer = server.usualSize || MEASUREMENT_KEYS.some((key) => server[key] !== "");
      if (hasServer) { setProfile(server); saveFitProfile(server); }
      setStatus(hasServer ? "saved to your private ASILUM account" : "not saved yet");
    }).catch(() => setStatus("using this device — save to sync securely"));
  }, []);

  function change(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
    setStatus("unsaved changes");
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await saveServerFitProfile(profile, getUid());
      setProfile(saved);
      setStatus("saved — listings will now check your measurements");
    } catch (error) { setStatus(error.message); }
    setSaving(false);
  }

  async function clear() {
    const response = await sendJSON("DELETE", "/api/measurements", { user: getUid() }).catch(() => null);
    if (!response?.ok) { setStatus("could not clear measurements"); return; }
    setProfile({ ...EMPTY_FIT });
    saveFitProfile({ ...EMPTY_FIT });
    setStatus("measurements cleared");
  }

  return (
    <section className="measurecard" id="measurements">
      <div className="measurehead">
        <div>
          <div className="psub">YOUR MEASUREMENTS</div>
          <h2>Know before you buy<span className="red">.</span></h2>
          <p className="deck">Private first-party fit scoring. ASILUM never sends these measurements to a model or merchant.</p>
        </div>
        <div className="unitpick" role="group" aria-label="measurement unit">
          {["in", "cm"].map((unit) => (
            <button key={unit} className={profile.unit === unit ? "on" : ""}
              onClick={() => { setProfile((current) => convertMeasurementUnit(current, unit)); setStatus("unsaved changes"); }}>
              {unit.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="measuregrid">
        <label>usual size
          <select value={profile.usualSize} onChange={(event) => change("usualSize", event.target.value)}>
            <option value="">—</option>
            {["XXS","XS","S","M","L","XL","XXL","XXXL"].map((size) => <option key={size}>{size}</option>)}
          </select>
        </label>
        {MEASUREMENT_KEYS.map((key) => (
          <label key={key}>{key} ({profile.unit})
            <input type="number" inputMode="decimal" min="0" step="0.1" value={profile[key]}
              placeholder={{ chest: "40", waist: "32", hips: "40", inseam: "31", height: "70" }[key]}
              onChange={(event) => change(key, event.target.value)} />
          </label>
        ))}
      </div>
      <div className="measureactions">
        <button className="btn" disabled={saving} onClick={save}>{saving ? "SAVING…" : "SAVE MEASUREMENTS"}</button>
        <button className="fitbtn" onClick={clear}>CLEAR</button>
        <span className="measurestatus">{status}</span>
      </div>
    </section>
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
