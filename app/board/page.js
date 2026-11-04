"use client";

// app/board/page.js — THE PASSPORT (Live Launch V.2).
// The card and three keys, nothing else (owner, 3 Nov 2026: "the passport tab should only have the passport
// card. a button to open map and a button to stamp the passport and a small button to VIEW TASTE GLOBE thats
// it"):
//   the card          the Taste Passport (PassportDocument.jsx) over the reader's streets (PassportSecurity.jsx)
//   OPEN MAP          its own full-screen view (owner, 3 Nov 2026: "allow the buttons to take users to a different
//                     tab … fill up the whole screen with a back button in the left corner"): the map window, the
//                     events near you, an event's ticket (PassportMapSheet.jsx)
//   STAMP PASSPORT    its own full-screen view: ALL STAMPS and PAGES — a stamp a pin, a page a board
//                     (StampsView.jsx; a page opens in the popup, PageSheet.jsx)
//                     Each view is a step in the history, so ← PASSPORT, the browser's back and a phone's swipe all
//                     return to the card.
//   VIEW TASTE GLOBE  the network of everything kept, in depth, in the popup (TasteGlobe.jsx → TasteNetwork.jsx)
// Every /board?tab= link holds: `places` opens the map, `collection` the stamps, `fullread` the globe, and
// `studio` shows the Studio under the card (a BRDCST's "pay in the studio" lands there). The achievements are
// the profile's Wardrobe (Achievements.jsx); uploading is /upload's. Opened with ?id=<boardId> the page shows
// someone's board read-only with FOLLOW.

import { openSheet } from "../../lib/dockstate.js";
import { useEffect, useRef, useState } from "react";
import Notice from "../components/Notice.jsx";
import { getUid, postJSON, authorizedFetch, thumbFor, safeExternalUrl, aspectFor } from "../../lib/client.js";
import { vizState } from "../../lib/brain/memory.js";
import PassportSecurity from "../components/PassportSecurity.jsx";
import { useRoads } from "../components/ParisMap.jsx";
import { getProfileInfo, saveProfileInfo } from "../../lib/social.js";
import { tasteClass } from "../../lib/brain/taste-class.js";
import { convictionsOf, mrzZone, ocr, passportLanguage } from "../../lib/passport/document.js";
import { Lamp, blinkLamp } from "../components/Blocks.jsx";
import PassportDocument from "../components/PassportDocument.jsx";
import PassportSpin from "../components/PassportSpin.jsx";
import { ColorEvidenceLine, OriginLine, OriginSticker, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";
import { useLiquidGlass } from "../components/LiquidGlass.jsx";
import PageMast from "../components/PageMast.jsx";
import Studio from "../components/Studio.jsx";
import PassportMapSheet from "../components/PassportMapSheet.jsx";
import StampsView from "../components/StampsView.jsx";
import { getLocation, setLocation } from "../../lib/location.js";

// what each old /board?tab= link opens now: the map or the stamps under the card (the globe is a popup; the
// Studio shows under the card)
const TAB_VIEWS = { places: "map", collection: "stamps" };
const VIEW_TABS = { map: "places", stamps: "collection" };
const STUDIO = { id: "studio", label: "STUDIO", word: "studio" };

// A LEAF: one page of the passport under the document — the band's machine line and the page number above,
// the leaf's name with the drawn language's word beside it, as the data page sets its labels. A view out of
// the way (no `no`) carries its machine line alone.
function Leaf({ no, of, tab, lang, sub, children, map }) {
  const word = (lang && tab.word && lang[tab.word]) || "";
  const machine = ocr(((no ? "P<" + String(no).padStart(2, "0") : "P") + "<<" + tab.label + "<<<<<<<<<<<<<<<<").slice(0, 20));
  return (
    <section className={"ppleaf ppleaf-" + tab.id} aria-label={tab.label.toLowerCase()}>
      {map}
      <div className="ppleafhead">
        <span className="ppleafmrz" aria-hidden="true">{machine}</span>
        {no ? <span className="ppleafno">{ocr(`P.${String(no).padStart(2, "0")} / ${String(of).padStart(2, "0")}`)}</span> : null}
      </div>
      <h3 className="ppleafttl">{tab.label} /{word && <em lang={lang.code} dir={lang.dir}>{word}</em>}</h3>
      {sub && <p className="ppleafsub">{sub}</p>}
      {children}
    </section>
  );
}

export default function BoardPage() {
  const fit = useFitBrain();
  const [uid, setUid] = useState(null);
  const [shared, setShared] = useState(null); // read-only board from ?id=
  const [notice, setNotice] = useState("");
  const [following, setFollowing] = useState(false);
  const [viz, setViz] = useState(null);
  const photoRef = useRef(null);
  const [ppPhoto, setPpPhoto] = useState(null);
  const [pinfo, setPinfo] = useState({ name: "", handle: "", since: "", origin: "", idnty: "", dob: "" });
  const [tab, setTab] = useState(""); // "studio" when the Studio is asked for by link
  const [view, setView] = useState(null); // "map" | "stamps": a full-screen view in place of the card
  const [loc, setLoc] = useState(null);
  const ppRef = useRef(null);
  const ppGlass = useLiquidGlass(ppRef, { id: "lg-passport", strength: 0.5, bend: ".ppwash-under" });
  // THE PASSPORT, LIFTED AND SPUN (owner, 3 Nov 2026: "click on their passport and have it isolate it in space and
  // spin it"): a tap on the page itself — not on a key, a field, the photo slot or the signature pad — lifts it
  const [spin, setSpin] = useState(false);
  function liftPassport(e) {
    if (e.target.closest("button, input, label, a, textarea, .ppsigpad")) return;
    setSpin(true);
  }
  // the page is focusable too, so the keyboard lifts it with Enter or Space ON THE PAGE ITSELF (a key pressed in a
  // field inside it is the field's); its label says so — the page carries no LIFT & SPIN key of its own any more
  // (owner, later on 3 Nov 2026: the card and three keys, "thats it")
  function liftByKey(e) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSpin(true); }
  }
  // THE READER'S OWN STREETS (V.2 round two): the document's map is the
  // area around the confirmed base city — first suggested from the
  // connection's address (/api/geo), the browser's own location as the
  // fallback, a city picker after that. Paris stands in only until a
  // centre exists.
  const centre = loc && loc.baseCity && Number.isFinite(loc.baseCity.lat) ? { lat: loc.baseCity.lat, lng: loc.baseCity.lng, label: loc.baseCity.name } : null;
  const roads = useRoads(centre);
  const docMap = roads.map;
  const [geoNote, setGeoNote] = useState("");
  useEffect(() => {
    // one suggestion per device: the connection's city area, confirmed by
    // being shown (CHANGE sits beside it); never a street, never stored raw
    const current = getLocation();
    if (current.baseCity) return;
    let asked = false;
    try { asked = window.localStorage.getItem("asilum-geo-asked") === "1"; } catch {}
    if (asked) return;
    fetch("/api/geo").then((r) => (r.ok ? r.json() : null)).then((g) => {
      try { window.localStorage.setItem("asilum-geo-asked", "1"); } catch {}
      if (g && g.located) {
        const name = [g.city, g.region].filter(Boolean).join(", ") || "your area";
        setLocation({ baseCity: { name, lat: g.lat, lng: g.lng, country: g.country || "", region: g.region || null, tz: null, detected: true }, confirmedAt: new Date().toISOString() });
        setGeoNote(`your base city was read from this connection's address — ${name}. change it on the map if that is wrong.`);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = +pos.coords.latitude.toFixed(2), lng = +pos.coords.longitude.toFixed(2);
            setLocation({ baseCity: { name: "your area", lat, lng, country: "", region: null, tz: null, detected: true }, confirmedAt: new Date().toISOString() });
            setGeoNote("your base city was read from this device's location (about a kilometre). change it on the map if that is wrong.");
          },
          () => setGeoNote("no location could be read — choose your city on the map and your streets appear here."),
          { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 },
        );
      } else setGeoNote("no location could be read — choose your city on the map and your streets appear here.");
    }).catch(() => {});
  }, []);

  // a key opens its view as a step in the history; ← PASSPORT (or the browser's back) steps back to the card
  function openView(which, replace = false) {
    setView(which);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", VIEW_TABS[which]);
      if (replace) window.history.replaceState({ ppview: which }, "", url.toString());
      else window.history.pushState({ ppview: which }, "", url.toString());
    } catch {}
    try { window.scrollTo({ top: 0 }); } catch {}
  }
  function closeView() {
    if (window.history.state && window.history.state.ppview) { window.history.back(); return; }
    setView(null);
    try { const url = new URL(window.location.href); url.searchParams.delete("tab"); window.history.replaceState(null, "", url.toString()); } catch {}
  }
  useEffect(() => {
    const onPop = () => { const t = new URLSearchParams(window.location.search).get("tab"); setView(TAB_VIEWS[t] || null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function openStudio(on) {
    setTab(on ? "studio" : "");
    try {
      const url = new URL(window.location.href);
      if (on) url.searchParams.set("tab", "studio"); else url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.toString());
    } catch {}
  }

  useEffect(() => {
    try { setPpPhoto(window.localStorage.getItem("asilum-pp-photo") || null); } catch {}
    try {
      const info = getProfileInfo();
      let since = window.localStorage.getItem("asilum-member-since");
      if (!since) {
        const now = new Date();
        since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        window.localStorage.setItem("asilum-member-since", since);
      }
      const locale = navigator.language || "";
      const region = (locale.split("-")[1] || "").toUpperCase();
      setPinfo({ name: info.name, handle: info.handle, since, origin: region || "—", area: new Date().getTimezoneOffset(), idnty: info.idnty || "", dob: info.dob || "" });
    } catch {}
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "studio") setTab("studio");
      else if (TAB_VIEWS[t]) openView(TAB_VIEWS[t], true);
      else if (t === "fullread") openSheet("tasteglobe", { title: "TASTE GLOBE" });
    } catch {}
    const syncLoc = () => setLoc(getLocation());
    syncLoc();
    window.addEventListener("asilum:location", syncLoc);
    return () => window.removeEventListener("asilum:location", syncLoc);
  }, []);

  useEffect(() => {
    const user = getUid();
    setUid(user);
    // V.2 14.11 (slice 10c): on first opening, the Passport asks its five to
    // seven questions in a popup — once per session until they are answered
    // or skipped; LATER keeps the place
    if (user) {
      let asked = false;
      try { asked = !!window.sessionStorage.getItem("asilum-onboarding-asked"); } catch {}
      if (!asked && !new URLSearchParams(window.location.search).get("id")) {
        authorizedFetch("/api/passport/onboarding?user=" + encodeURIComponent(user)).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (d && d.progress && !d.progress.done) { try { window.sessionStorage.setItem("asilum-onboarding-asked", "1"); } catch {} openSheet("onboarding"); }
        }).catch(() => {});
      }
    }
    // someone's board, opened read-only from a share link; the passenger's own boards are the stamps popup's
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      authorizedFetch("/api/boards?id=" + encodeURIComponent(id) + "&viewer=" + encodeURIComponent(user))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && d.board && !d.owned) setShared(d.board); else if (d && d.board) openView("stamps", true); })
        .catch(() => {});
    }
  }, []);

  async function copyShare(board) {
    const url = window.location.origin + "/?board=" + encodeURIComponent(board.id);
    try { await navigator.clipboard.writeText(url); setNotice("share link copied — it seeds the feed of whoever opens it"); } catch {}
  }

  // the brain's reading — the document's TASTE TYPE and the network's tags
  function loadViz(user = uid || getUid()) {
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setViz({ state: vizState(d.profile), profile: d.profile }); })
      .catch(() => {});
  }
  useEffect(() => { if (uid) loadViz(uid); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  function convictions() { return viz ? convictionsOf(viz.state.weights) : []; }
  async function toggleFollow(board) {
    const next = !following;
    setFollowing(next);
    try {
      await postJSON("/api/follow", { user: uid, boardId: board.id, follow: next });
      setNotice(next ? "following — this board now shapes your feed" : "unfollowed — its influence fades from your feed");
    } catch { setFollowing(!next); }
  }


  function onPassportPhoto(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { setPpPhoto(rd.result); try { window.localStorage.setItem("asilum-pp-photo", rd.result); } catch {} };
    rd.readAsDataURL(f);
    e.target.value = "";
  }

  // THE PASSENGER'S OWN WORDS ON THE DOCUMENT: IDNTY (owner, 2 Nov 2026:
  // "replace SEX/ with IDNTY/ so people can feel free to type in whatever
  // they want") and DATE OF BIRTH are typed on the page and kept with the
  // display name (lib/social.js, a preference on this device) — the birth
  // date an account asserted at signup is never served to the shell
  // (app/api/account/age/route.js), so the document prints only what the
  // passenger writes on it.
  function writeField(k, v) {
    setPinfo((p) => ({ ...p, [k]: v }));
    try { saveProfileInfo({ ...getProfileInfo(), [k]: v }); } catch {}
  }

  // the data page's fields, once, for the page and the machine zone alike
  const taste = tasteClass(convictions());
  const lang = passportLanguage(uid);
  const mrz = mrzZone({ uid, name: pinfo.name, dob: pinfo.dob, nationality: pinfo.origin, idnty: pinfo.idnty, taste, since: pinfo.since });
  // someone's board, read-only, with FOLLOW
  const sharedBody = shared && (
    <>
      <div className="controls">
        <div style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase" }}>{shared.name}</div>
        <button className={"btn" + (following ? "" : " ghost")} onClick={() => toggleFollow(shared)}>{following ? "Following ✓" : "Follow this taste"}</button>
        <button className="btn" onClick={() => copyShare(shared)}>Copy share link</button>
        <a className="btn ghost" href={"/?board=" + encodeURIComponent(shared.id)}>explore this taste →</a>
      </div>
      {shared.items.length === 0 ? (
        <div className="empty">no pieces on this board yet.</div>
      ) : (
        <div className="grid">
          {shared.items.map((it) => (
            <div className="card" key={it.id}>
              <div className="imgwrap" style={{ aspectRatio: aspectFor(it.id) }}>
                <OriginSticker item={it} />
                <img src={it.img || thumbFor(it)} alt={it.alt || it.title} loading="lazy" />
              </div>
              <div className="body">
                <div className="ttl">{it.title}</div>
                <div className="brand2">{it.brand}</div>
                <ColorEvidenceLine item={it} />
                <OriginLine item={it} />
                <ProductFitLine item={it} fit={fit} />
                <div className="pricerow">
                  {it.price ? <span className="price">{it.currency || "USD"} {it.price}</span> : null}
                  {safeExternalUrl(it.url) ? <a className="buy" href={safeExternalUrl(it.url)} target="_blank" rel="noopener noreferrer">view ↗</a> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="wrap ppage">
      {/* ===== A VIEW: the map or the stamps, the whole screen, ← PASSPORT in the left corner ===== */}
      {view && !shared && (
        <section className={"ppview ppview-" + view} aria-label={view === "map" ? "map" : "stamps"}>
          <div className="ppviewbar">
            <button type="button" className="ppviewback" onClick={closeView}>← PASSPORT</button>
            <h2 className="ppviewttl">{view === "map" ? "MAP" : "STAMPS"}</h2>
          </div>
          {view === "map" ? <PassportMapSheet /> : <StampsView />}
        </section>
      )}

      {!view && (
      <header className="cthead">
        <PageMast word="PASSPORT" sub={shared ? "SOMEONE'S TASTE" : "YOUR ARCHIVE · YOUR TASTE · YOUR PLANS"} />
      </header>
      )}

      {!shared && !view && (
        <>
          <div className="ppdoc lg" ref={ppRef} aria-label="passport document — tap or Enter lifts it to spin" lang="en" tabIndex={0} onClick={liftPassport} onKeyDown={liftByKey}>
            {ppGlass}
            {/* THE TASTE PASSPORT (the owner's mock-up, 2 Nov 2026, traced: PassportDocument.jsx) over the map
                (PassportSecurity.jsx), in the Liquid Glass pane */}
            <PassportSecurity map={docMap} />
            <PassportDocument uid={uid} info={pinfo} taste={taste} lang={lang} mrz={mrz} photo={ppPhoto} editable
              onPhoto={() => photoRef.current && photoRef.current.click()} onWrite={writeField} />
          </div>
          <input ref={photoRef} type="file" accept="image/*" hidden aria-label="upload a passport photo" onChange={onPassportPhoto} />
          {/* the card's three keys (the mock-up's page carries none) */}
          <div className="ppdocacts">
            <button className="ppbtn" onClick={(e) => { blinkLamp(e, { quiet: true }); openView("map"); }}><Lamp />OPEN MAP</button>
            <button className="ppbtn primary" onClick={(e) => { blinkLamp(e); openView("stamps"); }}><Lamp />STAMP PASSPORT</button>
          </div>
          <div className="ppglobekey"><button className="txtbtn" onClick={() => openSheet("tasteglobe", { title: "TASTE GLOBE" })}>VIEW TASTE GLOBE →</button></div>
        </>
      )}
      {spin && !shared && <PassportSpin uid={uid} info={pinfo} taste={taste} lang={lang} mrz={mrz} photo={ppPhoto} map={docMap} onClose={() => setSpin(false)} />}
      {geoNote && !shared && !view && <p className="ppgeonote">{geoNote} <button className="txtbtn" onClick={() => { setGeoNote(""); openView("map"); }}>CHANGE →</button></p>}

      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      {sharedBody}

      {/* the Studio, only when a link asks for it */}
      {!shared && tab === "studio" && (
        <Leaf tab={STUDIO} lang={lang} sub="one account, more possibilities.">
          <div className="ppback"><button className="txtbtn" onClick={() => openStudio(false)}>← PASSPORT</button></div>
          <Studio uid={uid} />
        </Leaf>
      )}
    </div>
  );
}
