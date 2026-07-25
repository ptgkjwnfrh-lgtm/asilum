"use client";

// app/profile/page.js — PROFILE.
// Banner, avatar, identity, counts, and three tabs: Posts / Brands /
// Bag. Identity is local until real accounts exist; all displayed counts are
// derived from real local/server state.

import { useEffect, useState } from "react";
import {
  EMPTY_FIT, getUid, authorizedFetch, thumbFor, loadFitProfile,
  saveFitProfile, saveServerFitProfile, sendJSON, postJSON,
} from "../../lib/client.js";
import {
  convertMeasurementUnit, hasMeasurementProfile, MEASUREMENT_KEYS,
} from "../../lib/brain/measurements.js";
import {
  getProfileInfo, saveProfileInfo, listPosts, postStats, timeAgo,
  followedUsers, followedBrands, setFollowBrand, setFollowUser, sourceFor,
} from "../../lib/social.js";
import { authConfigured, getSupabase } from "../../lib/supabase.js";
import { Avatar, UserSearch } from "../components/UserBits.jsx";
import { WardrobeTab } from "../components/WardrobeTab.jsx";
import { RoomEditor } from "../components/ProfileRoom.jsx";
import {
  ColorEvidenceLine, ProductFitLine, refreshFitProfile, useFitBrain,
} from "../components/ProductSignals.jsx";

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

  // Banner and avatar images are device-local (localStorage via profile
  // info), downscaled in-browser so they fit comfortably in storage.
  function pickImage(key, maxW) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        save(key, c.toDataURL("image/jpeg", 0.82));
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
    input.click();
  }

  if (!info) return <div className="wrap"><div className="empty">…</div></div>;

  const brands = [...new Set(bagHistory.map((o) => o.brand).filter(Boolean))];
  const followingCount = followedUsers().length + boardFollows;
  const followers = 0;

  return (
    <div className="wrap">
      <div
        className="pbanner"
        style={info.bannerImg ? { backgroundImage: `url(${info.bannerImg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <span>*</span>
        {editing && (
          <div className="pbannerctl">
            <button className="ppupl" onClick={() => pickImage("bannerImg", 1400)}>⇪ BANNER</button>
            <button className="ppupl" onClick={() => pickImage("avatarImg", 240)}>⇪ AVATAR</button>
          </div>
        )}
      </div>
      <div className="phead2">
        <div className="pavatar">
          {info.avatarImg
            ? <img className="pavimg" src={info.avatarImg} alt={info.name || "avatar"} />
            : <Avatar name={info.name} />}
        </div>
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

      <ProfileAccess />
      <RoomEditor />
      <MeasurementsEditor />

      <div className="tabs">
        {[["posts", "POSTS"], ["brands", "BRANDS"], ["bag", "BAG"], ["wardrobe", "WARDROBE"]].map(([k, label]) => (
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
                    <span className="castat" title="comments">○ {s.comments}</span>
                    <span className="castat" title="reposts">↻ {s.reposts}</span>
                    <span className="castat" title="likes">♥ {s.likes}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === "brands" && <BrandsTab bagBrands={brands} />}
      {tab === "wardrobe" && <WardrobeTab />}

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

const PLATFORMS = ["ebay", "pinterest", "shopify"];

function ProfileAccess() {
  const [authUser, setAuthUser] = useState(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState("");
  const [connectNotice, setConnectNotice] = useState("");
  const [people, setPeople] = useState(() => followedUsers());

  useEffect(() => {
    let active = true;
    try { setNotice(window.localStorage.getItem("asilum-auth-notice") || ""); } catch {}
    const noticeHandler = (event) => setNotice(event.detail || "");
    const followHandler = () => setPeople(followedUsers());
    window.addEventListener("asilum:auth-notice", noticeHandler);
    window.addEventListener("asilum:follow", followHandler);
    let subscription = null;
    getSupabase().then((sb) => {
      if (!active || !sb) return;
      subscription = sb.auth.onAuthStateChange((_event, session) => {
        if (active) setAuthUser(session?.user || null);
      })?.data?.subscription || null;
    });
    return () => {
      active = false;
      window.removeEventListener("asilum:auth-notice", noticeHandler);
      window.removeEventListener("asilum:follow", followHandler);
      subscription?.unsubscribe();
    };
  }, []);

  async function sendMagicLink() {
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signInWithOtp({
        email: address, options: { emailRedirectTo: window.location.origin + "/profile" },
      });
      publishNotice(error ? "could not send the link — " + error.message : "magic link sent — check your inbox");
    } catch { publishNotice("could not send the link — check the Supabase keys"); }
    setBusy(false);
  }

  async function signOut() {
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signOut({ scope: "local" });
      if (error) throw error;
      setAuthUser(null);
      publishNotice("signed out — device taste remains; account measurements are locked");
    } catch { publishNotice("could not sign out — try again"); }
  }

  function publishNotice(message) {
    setNotice(message);
    try {
      window.localStorage.setItem("asilum-auth-notice", message);
      window.dispatchEvent(new CustomEvent("asilum:auth-notice", { detail: message }));
    } catch {}
  }

  async function connect(platform) {
    if (connecting) return;
    setConnecting(platform);
    try {
      const response = await postJSON("/api/connect", { user: getUid(), platform });
      const data = await response.json().catch(() => null);
      setConnectNotice(data?.message || `${platform} linking requires partner setup`);
    } catch { setConnectNotice(`${platform} linking requires partner setup`); }
    setConnecting("");
  }

  function unfollowPerson(handle) {
    setFollowUser(handle, false);
    setPeople(followedUsers());
  }

  return (
    <section className="accountcard" id="access">
      <div className="measurehead">
        <div>
          <div className="psub">PROFILE ACCESS</div>
          <h2>One identity<span className="red">.</span></h2>
          <p className="deck">Sign-in, settings, connections, follows, and fit all live on this profile.</p>
        </div>
        <a className="btn ghost" href="/settings">SETTINGS →</a>
      </div>
      <div className="accountgrid">
        <div>
          <div className="psub">SIGN IN</div>
          {authConfigured() ? authUser ? (
            <>
              <div className="acctline">{authUser.email || authUser.id} — signed in</div>
              <button className="btn ghost" onClick={signOut}>SIGN OUT</button>
            </>
          ) : (
            <>
              <label className="accountemail">email — magic link
                <input type="email" value={email} placeholder="you@example.com"
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") sendMagicLink(); }} />
              </label>
              <button className="btn" disabled={busy} onClick={sendMagicLink}>{busy ? "SENDING…" : "SEND LINK"}</button>
            </>
          ) : <div className="acctline">Sign-in requires Supabase public keys in the deployment environment.</div>}
          {notice ? <div className="acctline accountnotice">{notice}</div> : null}
        </div>
        <div>
          <div className="psub">SOURCE CONNECTIONS</div>
          <div className="platformrow">
            {PLATFORMS.map((platform) => (
              <button key={platform} className="platform soon" disabled={!!connecting} onClick={() => connect(platform)}>
                {connecting === platform ? "checking…" : platform}
              </button>
            ))}
          </div>
          {connectNotice ? <div className="acctline accountnotice">{connectNotice}</div> : null}
        </div>
        <div>
          <div className="psub">FOLLOWING — PEOPLE</div>
          {people.length ? <div className="tagfilter">
            {people.map((handle) => <button className="chip clickable cur" key={handle}
              onClick={() => unfollowPerson(handle)}>{handle} ×</button>)}
          </div> : <div className="acctline">No one followed yet — find people below.</div>}
        </div>
      </div>
    </section>
  );
}

function MeasurementsEditor() {
  const [profile, setProfile] = useState(EMPTY_FIT);
  const [status, setStatus] = useState("loading your fit profile…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = (event) => {
      if (!active) return;
      const next = event?.detail ? { ...event.detail } : loadFitProfile();
      setProfile(next);
      setStatus(hasMeasurementProfile(next) ? "saved privately to this identity" : "not saved yet");
    };
    sync();
    window.addEventListener("asilum:fit", sync);
    refreshFitProfile().catch(() => {
      if (active) setStatus("using this device — save to sync securely");
    });
    return () => {
      active = false;
      window.removeEventListener("asilum:fit", sync);
    };
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
