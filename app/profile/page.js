"use client";

// app/profile/page.js — THE ACCOUNT PAGE.
// Re-upped on the owner's sketch (4 Nov 2026: "pretty much close to
// Instagram"): ProfileHead.jsx is the header — the display name as the
// title, the avatar with the room's SONG under it, the handle with the
// Passenger Score as stars, POSTS · LISTINGS · FOLLOWERS · FOLLOWING, the
// bio — then the key row: EDIT PROFILE, MESSAGE, and beside it the three
// keys that open the owner's own panels in place of the tabs:
//   WARDROBE    the pieces they own (WardrobeTab.jsx)
//   STATISTICS  their BRDCSTs, their follower information, their
//               storefront's numbers — every figure a read of a record
//   BANKING     earnings: the fee ledger and the order intake state the
//               storefront answers with (StorefrontTab.jsx EarningsPanel)
// Under the keys the live ECHOES as rings, and under those four tabs:
// POSTS (the grid), REPOSTS, FEATURED (the room's TOP PIECES and BRANDS ON
// RECORD) and STOREFRONT. The rooms that were tabs — ACCOUNT, ROOM & SONG,
// SIZING, CLOSET, BRANDS — hang off the ⋯ key in the title bar.
// Standing rules: identity is local until real accounts exist; every
// displayed count is derived from real local/server state, and "—" stands
// where nothing is measured; a password-reset link still opens ACCOUNT.

import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_FIT, getUid, authorizedFetch, thumbFor, loadFitProfile,
  saveFitProfile, saveServerFitProfile, sendJSON, SIGN_OUT_NOTICE,
} from "../../lib/client.js";
import {
  convertMeasurementUnit, hasMeasurementProfile, MEASUREMENT_KEYS,
} from "../../lib/brain/measurements.js";
import {
  getProfileInfo, saveProfileInfo, listPosts, timeAgo,
  mapServerPost, matchesLocalPost,
  followedUsers, followedBrands, setFollowBrand, setFollowUser, sourceFor,
} from "../../lib/social.js";
import { postType, brdcstWhen } from "../../lib/feed/types.js";
import { openSheet } from "../../lib/dockstate.js";
import { authConfigured, getSupabase } from "../../lib/supabase.js";
import { Avatar, UserSearch, useFriends } from "../components/UserBits.jsx";
import GlassPane from "../components/GlassPane.jsx";
import ProfileHead, { ProfileTabs, PostGrid, useFollowers } from "../components/ProfileHead.jsx";
import Icon from "../components/Icons.jsx";
import ConnectionsRack from "../components/ConnectionsRack.jsx";
import ConnectionsWheel from "../components/ConnectionsWheel.jsx";
import BusinessAccountPanel from "../components/BusinessAccount.jsx";
import { WardrobeTab } from "../components/WardrobeTab.jsx";
import { RoomEditor } from "../components/ProfileRoom.jsx";
import StorefrontTab from "../components/StorefrontTab.jsx";
import { normalizeEnvelope, EarningsPanel, formatMoney } from "../components/StorefrontTab.jsx";
import Notice from "../components/Notice.jsx";
import {
  ColorEvidenceLine, OriginLine, ProductFitLine, refreshFitProfile, useFitBrain,
} from "../components/ProductSignals.jsx";

const TABS = [["posts", "POSTS"], ["reposts", "REPOSTS"], ["featured", "FEATURED"], ["storefront", "STOREFRONT"]];
// the sketch's four glyphs: the grid, the loop, the portrait, the awning
const TAB_ICONS = Object.freeze({ posts: "grid", reposts: "repost", featured: "featured", storefront: "store" });

// the ⋯ menu: the rooms that used to be tabs, and the account's other doors
const ROOMS = [
  ["account", "ACCOUNT", "SIGN IN · SOURCES · BUSINESS"],
  ["room", "ROOM & SONG", "HANDLE · SKIN · ANTHEM"],
  ["sizing", "SIZING", "THE FIT ON FILE"],
  ["closet", "CLOSET", "THE BAG'S HISTORY"],
  ["brands", "BRANDS", "FOLLOWED HOUSES"],
];
const PANEL_TITLE = { wardrobe: "WARDROBE", stats: "STATISTICS", bank: "BANKING", account: "ACCOUNT", room: "ROOM & SONG", sizing: "SIZING", closet: "CLOSET", brands: "BRANDS" };

export default function ProfilePage() {
  const fit = useFitBrain();
  const [info, setInfo] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("posts");
  const [panel, setPanel] = useState(null);   // wardrobe · stats · bank · account · room · sizing · closet · brands
  const [menu, setMenu] = useState(false);
  const [posts, setPosts] = useState([]);
  const [bagHistory, setBagHistory] = useState([]);
  const [boardFollows, setBoardFollows] = useState(0);
  const [brandFollows, setBrandFollows] = useState(0);
  const [since, setSince] = useState("");
  // the room (handle, anthem, top pieces): null = the feature is off on this
  // deploy; { available: false } = accounts only, with the reason
  const [room, setRoom] = useState(null);
  // the storefront envelope: { state: "signedout" | "ok" | "error", envelope, error }
  const [sf, setSf] = useState({ state: "signedout", envelope: null, error: "" });

  useEffect(() => {
    setInfo(getProfileInfo());
    // POSTS reads the durable record (owner order, Aug 13): this
    // identity's visible transmissions from the server, merged with
    // device copies the server doesn't show yet (just posted, or held
    // for review) — those stay visible to their author, labeled. The
    // local list renders instantly; the server read upgrades it.
    const localMine = listPosts().filter((p) => p.mine);
    setPosts(localMine);
    authorizedFetch("/api/editorial?mine=1&limit=120&user=" + encodeURIComponent(getUid() || ""))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const server = (d.posts || []).map(mapServerPost).filter((p) => p.text)
          .map((p) => ({ ...p, mine: true }));
        setPosts([
          ...server,
          ...localMine
            .filter((m) => !server.some((s) => matchesLocalPost(m, s)))
            .map((m) => ({ ...m, localOnly: true })),
        ].sort((a, b) => b.at - a.at));
      })
      .catch(() => {});
    // MEMBER SINCE: same once-stamped device-real date the passport uses.
    try {
      let s = window.localStorage.getItem("asilum-member-since");
      if (!s) {
        const now = new Date();
        s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        window.localStorage.setItem("asilum-member-since", s);
      }
      setSince(s);
    } catch {}
    const user = getUid() || "guest";
    authorizedFetch("/api/orders?user=" + encodeURIComponent(user))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBagHistory(d.bagHistory || []); }).catch(() => {});
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBoardFollows(((d.profile || {})._meta || {}).follows?.length || 0); })
      .catch(() => {});
  }, []);

  // THE ROOM and THE STOREFRONT, read once and again when the identity
  // changes (sign-in lands a room and a storefront that a device never had).
  // The header's SONG, LISTINGS and FOLLOWERS, the FEATURED tab, STATISTICS
  // and BANKING all read these two records; nothing is fetched twice.
  const loadRecords = useCallback(() => {
    const uid = getUid() || "";
    authorizedFetch("/api/profile/room?user=" + encodeURIComponent(uid))
      .then((r) => (r.status === 503 ? null : r.json()))
      .then((d) => setRoom(d))
      .catch(() => setRoom(null));
    if (!uid.startsWith("sb-")) { setSf({ state: "signedout", envelope: null, error: "" }); return; }
    authorizedFetch(`/api/storefront?user=${encodeURIComponent(uid)}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (r.status === 401 || r.status === 403) { setSf({ state: "signedout", envelope: null, error: "" }); return; }
        if (!r.ok) { setSf({ state: "error", envelope: null, error: body.error || (r.status === 404 ? "storefront service is not enabled on this deployment" : "the storefront record could not be read") }); return; }
        setSf({ state: "ok", envelope: normalizeEnvelope(body), error: "" });
      })
      .catch(() => setSf({ state: "error", envelope: null, error: "the storefront service could not be reached — no empty record is being assumed" }));
  }, []);
  useEffect(() => {
    loadRecords();
    window.addEventListener("asilum:identity", loadRecords);
    return () => window.removeEventListener("asilum:identity", loadRecords);
  }, [loadRecords]);

  // BRANDS counts FOLLOWED brands (metric-definition audit, Aug 17 — it
  // used to count distinct brands in bag history). Held in state and
  // refreshed on "asilum:follow" so STATISTICS agrees with the BRANDS room
  // the moment a chip is toggled there; a render-time read would have gone
  // stale, because the room keeps its own local copy.
  useEffect(() => {
    const read = () => setBrandFollows(followedBrands().length);
    read();
    window.addEventListener("asilum:follow", read);
    return () => window.removeEventListener("asilum:follow", read);
  }, []);

  // ACCOUNT and the one native STOREFRONT live as Profile subviews. Open a
  // named subview on fresh mounts and hash-only changes while already here;
  // every other fragment keeps the normal POSTS default.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#access") setPanel("account");
      if (window.location.hash === "#storefront") { setPanel(null); setTab("storefront"); }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // ---- Landing from a password-reset link (found live, Aug 14) ----
  // This LIVES HERE, in the page that owns `panel`, and reads nothing but the
  // URL. Two things went wrong when it lived in ProfileAccess instead:
  //   1. ProfileAccess only mounts once ACCOUNT is already open —
  //      the very thing this needs to cause — so it could never run first.
  //   2. `setTab` is not in scope there, so the call threw a ReferenceError
  //      that a bare `catch {}` swallowed, silently killing the notice and
  //      the URL cleanup that followed it. A catch that hides a typo is not
  //      error handling.
  // Both the set-a-new-password form and the notice live under ACCOUNT
  // while the page opens on POSTS, so arriving from a reset link — working
  // or expired — must open that panel or the reader sees nothing at all.
  useEffect(() => {
    let hash;
    try {
      hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    } catch { return; }
    const code = hash.get("error_code");
    const failed = !!(code || hash.get("error"));
    const cameFromReset = new URLSearchParams(window.location.search).get("reset") === "1";
    if (!cameFromReset && !failed) return;

    setPanel("account");
    if (failed) {
      // Supabase redirects here even when it REFUSES the link, with the
      // reason in the fragment (#error=access_denied&error_code=...).
      // Saying nothing is the worst answer available: the reader cannot
      // tell a dead link from a broken site. The notice rides the same
      // localStorage + event channel the ACCOUNT panel already reads, so it
      // is waiting there when that panel mounts.
      const described = (hash.get("error_description") || "").replace(/\+/g, " ");
      const message = code === "otp_expired"
        ? "that reset link has expired or was already used — links last about an hour. ask for a new one below."
        : described || "that link could not be used — ask for a new one below.";
      try {
        window.localStorage.setItem("asilum-auth-notice", message);
        window.dispatchEvent(new CustomEvent("asilum:auth-notice", { detail: message }));
        // Strip it so a refresh does not re-accuse a link already explained.
        const url = new URL(window.location.href);
        url.hash = "";
        url.searchParams.delete("reset");
        window.history.replaceState({}, "", url.toString());
      } catch {}
    }
  }, []);

  const ownHandle = room?.room?.handle || null;
  const followers = useFollowers(ownHandle);
  const friends = useFriends();

  function save(k, v) {
    setInfo((prev) => { const n = { ...prev, [k]: v }; saveProfileInfo(n); return n; });
  }

  // Avatar and banner images are device-local (localStorage via profile
  // info), downscaled in-browser so they fit comfortably in storage. The
  // banner fills the key brick and fades out before its slant (KeyBrick.jsx).
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

  const openPanel = (k) => { setMenu(false); setPanel((cur) => (cur === k ? null : k)); };

  if (!info) return <div className="wrap"><div className="empty">…</div></div>;

  // Brands seen in bag history. These are the BRANDS room's *candidates* to
  // follow — they are not brands this reader follows (metric-definition
  // audit, Aug 17).
  const brands = [...new Set(bagHistory.map((o) => o.brand).filter(Boolean))];
  const followingCount = followedUsers().length + boardFollows;
  const envelope = sf.envelope;
  // LISTINGS: the storefront's ACTIVE listings. A signed-in account with no
  // storefront has zero listings — a measurement; a device identity has no
  // storefront to count, so a dash.
  const listings = envelope ? envelope.listings.filter((l) => (l.status || "active") === "active").length : null;
  const anthem = room?.room?.modules?.find((m) => m.module === "soundtrack")?.content?.entities?.[0] || null;
  const handleShown = ownHandle ? "*" + ownHandle : info.handle;

  const counts = [
    { key: "posts", label: "POSTS", value: posts.length },
    { key: "listings", label: "LISTINGS", value: listings, title: sf.state === "signedout" ? "sign in — a storefront belongs to an account" : sf.error || "the storefront record could not be read" },
    { key: "followers", label: "FOLLOWERS", value: followers, title: ownHandle ? "the follower count could not be read" : "claim a handle in your room to be followed" },
    { key: "following", label: "FOLLOWING", value: followingCount },
  ];

  const identity = editing ? (
    <div className="pf3edit">
      <input className="pedit" aria-label="display name" value={info.name} onChange={(e) => save("name", e.target.value)} />
      <input className="pedit small" aria-label="handle" value={info.handle} onChange={(e) => save("handle", e.target.value)} />
      <textarea className="pedit small" aria-label="bio" rows={2} value={info.bio} onChange={(e) => save("bio", e.target.value)} />
      <div className="pf3editkeys">
        <button type="button" className="ppupl" onClick={() => pickImage("avatarImg", 240)}>⇪ AVATAR</button>
        {info.avatarImg ? <button type="button" className="ppupl" onClick={() => save("avatarImg", "")}>REMOVE AVATAR</button> : null}
        <button type="button" className="ppupl" onClick={() => pickImage("bannerImg", 1400)}>⇪ BANNER</button>
        {info.bannerImg ? <button type="button" className="ppupl" onClick={() => save("bannerImg", "")}>REMOVE BANNER</button> : null}
      </div>
    </div>
  ) : null;

  const keys = (
    <>
      <button type="button" className={"pf3key" + (editing ? " on" : "")} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
        {editing ? "DONE" : "EDIT PROFILE"}
      </button>
      <a className="pf3key" href="/messages">MESSAGE</a>
    </>
  );
  // the three keys the logo's brick encases (KeyBrick.jsx)
  const tools = (
    <>
      <div className="pf3cluster" role="group" aria-label="wardrobe, statistics, banking">
        {[["wardrobe", "WARDROBE", "wardrobe"], ["stats", "STATISTICS", "stats"], ["bank", "BANKING", "bank"]].map(([k, label, icon]) => (
          <button type="button" key={k} aria-pressed={panel === k} onClick={() => openPanel(k)} title={label}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </>
  );

  const more = (
    <div className="pf3menu">
      <button type="button" className="pf3more" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} title="more rooms">
        <Icon name="dots" size={18} /><span>MORE</span>
      </button>
      {menu ? (
        <div className="pf3menulist" role="menu">
          {ROOMS.map(([k, label, meta]) => (
            <button type="button" role="menuitem" key={k} onClick={() => openPanel(k)}>{label}<span>{meta}</span></button>
          ))}
          <a role="menuitem" href="/orders">ORDERS<span>TICKETS + RECEIPTS</span></a>
          <a role="menuitem" href="/settings">SETTINGS<span>CONTROL PANEL</span></a>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="wrap pf3">
      {/* THE HEADER (ProfileHead.jsx, the owner's sketch): the display name
          is the page's one heading; the handle, the stars, the four counts
          and the bio sit beside the avatar and its song. */}
      <GlassPane glass="lg-pf-head" className="pfhead" aria-label="identity">
        <ProfileHead
          title={<h1 className="pf3title">{info.name || "Profile"}</h1>}
          menu={more}
          name={info.name}
          handle={handleShown}
          avatar={info.avatarImg || null}
          bio={info.bio}
          identity={identity}
          scoreSubject={getUid()}
          counts={counts}
          song={anthem ? { name: anthem.name, label: anthem.label } : null}
          onSong={() => openPanel("room")}
          actions={keys}
          tools={tools}
          banner={info.bannerImg || null}
          echoes={posts}
          onEchoAdd={() => openSheet("post", { kind: "echo", title: "POST" })}
        />
      </GlassPane>

      {panel ? (
        <GlassPane glass="lg-pf-panel" className="pf3panel" aria-live="polite">
          <div className="pf3panelhead">
            <button type="button" className="pf3back" onClick={() => setPanel(null)}>← PROFILE</button>
            <span className="psub">{PANEL_TITLE[panel]}</span>
          </div>
          {panel === "wardrobe" && <WardrobeTab />}
          {panel === "stats" && (
            <StatsPanel posts={posts} followers={followers} ownHandle={ownHandle} followingCount={followingCount}
              brandFollows={brandFollows} boardFollows={boardFollows} friends={friends} sf={sf} />
          )}
          {panel === "bank" && <BankPanel sf={sf} onStorefront={() => { setPanel(null); setTab("storefront"); }} />}
          {panel === "account" && (
            <>
              <ProfileAccess since={since} />
              <BusinessAccountPanel />
              <h3 className="statshead">FIND PEOPLE</h3>
              <div style={{ maxWidth: 420 }}>
                <UserSearch placeholder="search users to follow…" />
              </div>
            </>
          )}
          {panel === "room" && <RoomEditor />}
          {panel === "sizing" && <MeasurementsEditor />}
          {panel === "brands" && <BrandsTab bagBrands={brands} />}
          {/* THE CLOSET (Grailed): the pieces from the bag's history as a
              grid — the picture, the title, the house and source, the
              colour / origin / fit lines, the price. */}
          {panel === "closet" && (
            <>
              {bagHistory.length === 0 && <div className="empty">nothing in the closet yet — the bag's history lands here.</div>}
              {bagHistory.length > 0 && (
                <div className="pfcloset">
                  {bagHistory.slice(0, 24).map((o, i) => (
                    <a className="pfpiece" key={o.id + i} href={"/?item=" + encodeURIComponent(o.id)}>
                      <img src={o.img || thumbFor(o)} alt="" />
                      <div className="hlttl">{o.title}</div>
                      <div className="hlbrand">{o.brand} — {sourceFor(o)}</div>
                      <ColorEvidenceLine item={o} />
                      <OriginLine item={o} />
                      <ProductFitLine item={o} fit={fit} />
                      <div className="hlstat">{o.price ? `USD ${o.price}` : "—"}</div>
                    </a>
                  ))}
                </div>
              )}
              <a className="btn ghost" href="/orders" style={{ display: "inline-block", marginTop: 16 }}>
                ALL ORDERS & TICKETS →
              </a>
            </>
          )}
        </GlassPane>
      ) : (
        <>
          <ProfileTabs tabs={TABS} icons={TAB_ICONS} tab={tab} onTab={setTab} />
          <div className="pf3sheet" aria-live="polite">
            {tab === "posts" && (
              <PostGrid posts={posts} emptyNode={
                <div className="empty">no transmissions yet — the POST disc on the deck publishes one into <a className="wperma" href="/">THE FEED →</a></div>
              } />
            )}
            {/* REPOSTS: the tab is drawn because the sketch draws it; no
                repost exists anywhere in lib/ or app/api yet, so the sheet
                says so rather than showing a grid of nothing (the no-faking
                rule applies to absence too). */}
            {tab === "reposts" && (
              <div className="empty">reposting is not built yet — nothing here is a measurement. <span className="soon">NOT WIRED YET</span></div>
            )}
            {tab === "featured" && <FeaturedTab room={room} onRoom={() => openPanel("room")} />}
            {tab === "storefront" && <StorefrontTab />}
          </div>
        </>
      )}
    </div>
  );
}

// FEATURED: the room's TOP PIECES and BRANDS ON RECORD (lib/profile/rooms.js
// modules) — the same records the public room shows. Empty states say where
// the record is made.
function FeaturedTab({ room, onRoom }) {
  if (room === null) return <div className="empty">rooms are off on this deployment — nothing is featured anywhere.</div>;
  if (room.available === false) return <div className="empty">{room.reason || "a room belongs to an account — sign in to feature pieces."}</div>;
  const mod = (id) => room.room?.modules?.find((m) => m.module === id);
  const pieces = mod("top-pieces")?.content?.items || [];
  const brands = mod("brands")?.content?.brands || [];
  if (!pieces.length && !brands.length) {
    return <div className="empty">nothing featured yet — pin TOP PIECES and BRANDS ON RECORD in <button type="button" className="wperma" onClick={onRoom}>YOUR ROOM →</button></div>;
  }
  return (
    <>
      {pieces.length > 0 && (
        <div className="pf3grid">
          {pieces.map((item) => (
            <a className="pf3tile media" key={item.id} href={"/?item=" + encodeURIComponent(item.id)}>
              <img src={item.img || thumbFor(item)} alt={item.title || ""} loading="lazy" />
              <span className="pf3time">{item.title}</span>
            </a>
          ))}
        </div>
      )}
      {brands.length > 0 && (
        <>
          <h3 className="statshead">BRANDS ON RECORD</h3>
          <div className="tagfilter">
            {brands.map((b) => <a className="chip" key={b.name || b} href={"/discover?q=" + encodeURIComponent(b.name || b)}>{b.name || b}</a>)}
          </div>
        </>
      )}
    </>
  );
}

// STATISTICS (the sketch's second key): "for brdcsts, follower information,
// store front information". Three ledgers, each a read of a record the page
// already holds — the BRDCST posts, the follow lists, the storefront
// envelope — and a dash with its reason where there is no record.
function StatsPanel({ posts, followers, ownHandle, followingCount, brandFollows, boardFollows, friends, sf }) {
  const brdcsts = posts.filter((p) => postType(p) === "BRDCST");
  const people = followedUsers();
  const env = sf.envelope;
  const live = env ? env.listings.filter((l) => (l.status || "active") === "active").length : null;
  const money = (cents, cur) => formatMoney(cents, cur || env?.fee?.currency || "USD");
  return (
    <div className="ledgergrid pf3stats">
      <section className="ledgercell">
        <h2>BRDCSTS</h2>
        <p>the events you have broadcast into the Feed.</p>
        <ul className="pf3statlist">
          <li><span>BRDCSTS POSTED</span><b>{brdcsts.length}</b></li>
          {brdcsts.slice(0, 6).map((p) => (
            <li key={p.id}><span>{p.title || p.text.slice(0, 48)}</span><b>{p.attachments?.event ? brdcstWhen(p.attachments.event) || timeAgo(p.at) : timeAgo(p.at)}</b></li>
          ))}
        </ul>
        {brdcsts.length === 0 ? <span className="fine">none yet — a BRDCST is composed on the POST disc.</span> : null}
      </section>
      <section className="ledgercell">
        <h2>FOLLOWERS</h2>
        <p>who follows you, and who you follow.</p>
        <ul className="pf3statlist">
          <li><span>FOLLOWERS</span>{followers == null ? <b title={ownHandle ? "the follower count could not be read" : "claim a handle in your room to be followed"}>—</b> : <b>{followers}</b>}</li>
          <li><span>FOLLOWING</span><b>{followingCount}</b></li>
          <li><span>PEOPLE</span><b>{people.length}</b></li>
          <li><span>BOARDS</span><b>{boardFollows}</b></li>
          <li><span>BRANDS FOLLOWED</span><b>{brandFollows}</b></li>
          <li><span>FRIENDS — MUTUAL</span>{friends ? <b>{friends.size}</b> : <b title="friends are read once signed in">—</b>}</li>
        </ul>
      </section>
      <section className="ledgercell">
        <h2>STOREFRONT</h2>
        <p>your storefront, as the ledger returns it.</p>
        {sf.state === "signedout" ? <span className="fine">sign in — a storefront belongs to an account.</span>
          : sf.state === "error" ? <Notice tone="error">{sf.error}</Notice>
          : !env.storefront ? <span className="fine">no storefront yet — open one on the STOREFRONT tab.</span>
          : (
            <ul className="pf3statlist">
              <li><span>STORE</span><b>{env.storefront.name}</b></li>
              <li><span>LIVE LISTINGS</span><b>{live}</b></li>
              <li><span>ALL LISTINGS</span><b>{env.listings.length}</b></li>
              <li><span>ORDERS RETURNED</span><b>{env.orders.length}</b></li>
              <li><span>OPEN OFFERS</span><b>{(env.commerce?.offers || []).filter((o) => o.liveState === "open").length}</b></li>
              <li><span>ORDER INTAKE</span><b>{env.capabilities.canReceiveOrders === true ? "ON" : "OFF"}</b></li>
              {env.fee ? <li><span>FEE COLLECTED</span><b>{money(env.fee.collectedCents ?? env.fee.collected_cents)}</b></li> : null}
            </ul>
          )}
      </section>
    </div>
  );
}

// BANKING (the sketch's third key): "earning and all of that". The fee
// ledger exactly as the storefront's EARNINGS view draws it — every amount
// the server's — and the state that decides whether money can arrive at
// all. Nothing is recomputed here.
function BankPanel({ sf, onStorefront }) {
  if (sf.state === "signedout") return <div className="empty">sign in — earnings belong to an account's storefront.</div>;
  if (sf.state === "error") return <Notice tone="error">{sf.error}</Notice>;
  const env = sf.envelope;
  if (!env.storefront) return <div className="empty">no storefront yet — open one on the <button type="button" className="wperma" onClick={onStorefront}>STOREFRONT tab →</button></div>;
  const intake = env.capabilities.canReceiveOrders === true;
  return (
    <>
      <div className="ledgergrid">
        <section className="ledgercell">
          <h2>ORDER INTAKE</h2>
          <p>{intake ? "on — paid orders can reach this storefront." : "off — the checkout provider is not keyed for this store; nothing can be charged, so nothing is earned."}</p>
          <span className={intake ? "fine" : "soon"}>{intake ? "ON" : "ORDER INTAKE OFF"}</span>
        </section>
        <section className="ledgercell">
          <h2>WHERE MONEY SITS</h2>
          <p>a native sale is a direct charge on your connected account — the funds are yours on settlement, and the hold is that account's payout schedule (lib/storefront/payouts.js).</p>
          <button type="button" className="txtbtn" onClick={onStorefront}>THE STOREFRONT'S ORDERS →</button>
        </section>
      </div>
      <EarningsPanel fee={env.fee} orders={env.orders} />
      <a className="btn ghost" href="/orders" style={{ display: "inline-block", marginTop: 16 }}>YOUR OWN ORDERS & TICKETS →</a>
    </>
  );
}

function ProfileAccess({ since = "" }) {
  const [authUser, setAuthUser] = useState(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Password auth (owner order, Aug 13): create-account mode carries a
  // verify field and the little eye that opens.
  const [mode, setMode] = useState("signin"); // signin | create
  // Password recovery (owner directive, Aug 14 — backlog 7): true once
  // Supabase reports this page was opened from a reset link, which is the
  // only moment updateUser({password}) is allowed to stand in for knowing
  // the old one.
  const [recovering, setRecovering] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
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
      subscription = sb.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        setAuthUser(session?.user || null);
        // PASSWORD_RECOVERY fires when the client consumes a reset link's
        // token. ?reset=1 alone is NOT enough to trust — anyone can type
        // it — so the query string only explains the wait; the event is
        // what opens the form.
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
      })?.data?.subscription || null;
      // The event can fire before this listener attaches (the token is
      // consumed during client construction). If the URL says we came from
      // a reset and a session exists, honor it.
      try {
        if (new URLSearchParams(window.location.search).get("reset") === "1") {
          sb.auth.getSession().then(({ data }) => {
            if (active && data?.session) setRecovering(true);
          });
        }
      } catch {}
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

  async function passwordAuth() {
    const address = email.trim();
    if (busy) return;
    if (!address) { publishNotice("enter your email first"); return; }
    if (password.length < 8) { publishNotice("password must be at least 8 characters"); return; }
    if (mode === "create" && password !== confirm) { publishNotice("the two passwords do not match"); return; }
    setBusy(true);
    try {
      const sb = await getSupabase();
      if (mode === "create") {
        const { data, error } = await sb.auth.signUp({
          email: address, password,
          options: { emailRedirectTo: window.location.origin + "/profile" },
        });
        if (error) publishNotice("could not create the account — " + error.message);
        else if (data?.user && !data.session) publishNotice("account created — confirm it from your inbox, then sign in");
        else publishNotice("account created — you are signed in");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: address, password });
        publishNotice(error ? "could not sign in — " + error.message : "signed in");
      }
      if (!busy) setPassword("");
      setConfirm("");
    } catch { publishNotice("authentication is not configured — check the Supabase keys"); }
    setBusy(false);
  }

  // Ask for a reset link. The answer is the SAME whether or not the
  // address holds an account — confirming it would make this an
  // account-enumeration oracle, which is exactly what sign-up already
  // takes care not to be.
  //
  // DEPLOYMENT REQUIREMENT (owner action, once): the redirectTo below must
  // appear in the project's redirect URL allow list —
  // Supabase dashboard → Authentication → URL Configuration → Redirect
  // URLs. Add "https://www.asilummagazine.com/profile" (and any preview
  // origin that needs it). Supabase silently refuses to redirect anywhere
  // not on that list, which looks like a broken reset link rather than a
  // configuration gap. The "Reset password" email template there is
  // enabled by default and needs no edit.
  async function sendReset() {
    const address = email.trim();
    if (busy) return;
    if (!address) { publishNotice("enter your email first"); return; }
    setBusy(true);
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.resetPasswordForEmail(address, {
        redirectTo: window.location.origin + "/profile?reset=1",
      });
      publishNotice(error
        ? "could not send the reset — " + error.message
        : "if that address holds an account, a reset link is on its way");
    } catch { publishNotice("could not reach the account service — check the Supabase keys"); }
    setBusy(false);
  }

  // Complete the reset. Reachable only while `recovering` is true, i.e.
  // Supabase confirmed the recovery token was consumed on this client.
  async function setNewPassword() {
    if (busy) return;
    if (password.length < 8) { publishNotice("password must be at least 8 characters"); return; }
    if (password !== confirm) { publishNotice("the two passwords do not match"); return; }
    setBusy(true);
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.updateUser({ password });
      if (error) {
        // The server's own words — its password policy is the authority,
        // and paraphrasing it would leave people guessing what to fix.
        publishNotice("could not set the password — " + error.message);
      } else {
        setRecovering(false);
        setPassword("");
        setConfirm("");
        publishNotice("password changed — you are signed in on this device");
        // Drop ?reset=1 so a refresh does not look like a fresh recovery.
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("reset");
          window.history.replaceState({}, "", url.toString());
        } catch {}
      }
    } catch { publishNotice("could not reach the account service — check the Supabase keys"); }
    setBusy(false);
  }

  async function signOut() {
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signOut({ scope: "local" });
      if (error) throw error;
      setAuthUser(null);
      // Shared with app/shell.js's SIGNED_OUT handler: BOTH fire on sign-out
      // and raced with different wording until Aug 8. See SIGN_OUT_NOTICE.
      publishNotice(SIGN_OUT_NOTICE);
    } catch { publishNotice("could not sign out — try again"); }
  }

  function publishNotice(message) {
    setNotice(message);
    try {
      window.localStorage.setItem("asilum-auth-notice", message);
      window.dispatchEvent(new CustomEvent("asilum:auth-notice", { detail: message }));
    } catch {}
  }

  function unfollowPerson(handle) {
    setFollowUser(handle, false);
    setPeople(followedUsers());
  }

  return (
    <section className="pfsec" id="access">
      <div className="measurehead">
        <div>
          <div className="psub">ACCOUNT</div>
          <h2>One identity<span className="red">.</span></h2>
          <p className="deck">sign in, connect sources, and manage who you follow — it all lives here.</p>
          {since ? <div className="pmeta">MEMBER SINCE {since}</div> : null}
        </div>
        <a className="btn ghost" href="/settings">SETTINGS →</a>
      </div>
      <div className="accountgrid">
        <div>
          <div className="psub">SIGN IN</div>
          {authConfigured() ? recovering ? (
            // Arrived from a reset link. This is the ONE moment a new
            // password may be set without proving the old one, so the
            // screen exists only while Supabase says the recovery token
            // was genuinely consumed.
            <>
              <div className="acctline">
                reset link opened{authUser?.email ? " for " + authUser.email : ""} — set a new password now.
              </div>
              <label className="accountemail">new password
                <span className="pwwrap">
                  <input type={showPw ? "text" : "password"} value={password}
                    placeholder="at least 8 characters"
                    autoComplete="new-password"
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") setNewPassword(); }} />
                  <button type="button" className="pweye" aria-label={showPw ? "hide password" : "show password"}
                    onClick={() => setShowPw((v) => !v)}>{showPw ? "◉" : "◡"}</button>
                </span>
              </label>
              <label className="accountemail">verify your password
                <input type={showPw ? "text" : "password"} value={confirm}
                  placeholder="the same password again"
                  autoComplete="new-password"
                  onChange={(event) => setConfirm(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") setNewPassword(); }} />
              </label>
              <button className="btn" disabled={busy} onClick={setNewPassword}>
                {busy ? "WORKING…" : "SET NEW PASSWORD"}
              </button>
            </>
          ) : authUser ? (
            <>
              <div className="acctline">{authUser.email || authUser.id} — signed in</div>
              <button className="btn ghost" onClick={signOut}>SIGN OUT</button>
            </>
          ) : (
            <>
              <div className="authmodes">
                <button className={"txtbtn" + (mode === "signin" ? " cur" : "")} onClick={() => setMode("signin")}>SIGN IN</button>
                <button className={"txtbtn" + (mode === "create" ? " cur" : "")} onClick={() => setMode("create")}>CREATE ACCOUNT</button>
              </div>
              <label className="accountemail">email
                <input type="email" value={email} placeholder="you@example.com"
                  onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="accountemail">password
                <span className="pwwrap">
                  <input type={showPw ? "text" : "password"} value={password}
                    placeholder={mode === "create" ? "at least 8 characters" : "your password"}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") passwordAuth(); }} />
                  <button type="button" className="pweye" aria-label={showPw ? "hide password" : "show password"}
                    onClick={() => setShowPw((v) => !v)}>{showPw ? "◉" : "◡"}</button>
                </span>
              </label>
              {mode === "create" && (
                <label className="accountemail">verify your password
                  <input type={showPw ? "text" : "password"} value={confirm} placeholder="the same password again"
                    onChange={(event) => setConfirm(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") passwordAuth(); }} />
                </label>
              )}
              <button className="btn" disabled={busy} onClick={passwordAuth}>
                {busy ? "WORKING…" : mode === "create" ? "CREATE ACCOUNT" : "SIGN IN"}
              </button>
              <button className="btn ghost" disabled={busy} onClick={sendMagicLink} title="passwordless — a link lands in your inbox">
                MAGIC LINK INSTEAD
              </button>
              {mode === "signin" && (
                <button className="btn ghost" disabled={busy} onClick={sendReset}
                  title="we email a link that lets you set a new password">
                  FORGOT PASSWORD
                </button>
              )}
            </>
          ) : <div className="acctline">Sign-in requires Supabase public keys in the deployment environment.</div>}
          {notice ? <div className="acctline accountnotice">{notice}</div> : null}
        </div>
        <div>
          <div className="psub">SOURCE CONNECTIONS</div>
          {/* V.2 §11: every connector with its explicit per-capability state
              (lib/connectors). The old row of "coming soon" buttons is gone:
              a state is a fact, a disabled button was a promise. */}
          <ConnectionsRack />
        </div>
        <div>
          <div className="psub">CONNECTIONS</div>
          {/* V.2 §11: the searchable list with A–Z shortcuts, and the optional wheel */}
          <ConnectionsWheel />
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
    <section className="pfsec" id="measurements">
      <div className="measurehead">
        <div>
          <div className="psub">SIZING</div>
          <h2>Know before you buy<span className="red">.</span></h2>
          <p className="deck">private first-party fit scoring. ASILUM never sends these measurements to a model or merchant.</p>
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
            <button type="button" className="chip clickable cur" key={b} onClick={() => toggle(b)}>{b} ×</button>
          ))}
        </div>
      )}
      <h3 className="statshead">FROM YOUR BAG</h3>
      {candidates.length === 0 ? (
        <div className="empty">every bag brand is already followed — or nothing is bagged yet.</div>
      ) : (
        <div className="tagfilter">
          {candidates.map((b) => (
            <button type="button" className="chip clickable" key={b} onClick={() => toggle(b)}>+ {b}</button>
          ))}
        </div>
      )}
    </>
  );
}
