"use client";

// app/shell.js
// The magazine shell around every page: one fixed top header — wordmark at
// full size, the always-moving ticker, big search/bag/sign-in — with the
// seven destinations in a row directly under it (owner order, Aug 12: the
// left sidebar is gone). Account controls live on PROFILE so identity has
// one obvious home.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  thumbFor, bagList, bagRemove, clearFitProfile, getUid, setUid, brainEnabled,
  authorizedFetch, SIGN_OUT_NOTICE,
} from "../lib/client.js";
import {
  searchUsers, sourceFor, followedBrands, followedUsers,
} from "../lib/social.js";
import { getSupabase } from "../lib/supabase.js";
import { Avatar, FollowButton } from "./components/UserBits.jsx";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "./components/ProductSignals.jsx";
import { AsteriskDrawer, AsteriskGuidanceToggle } from "./components/AsteriskMemory.jsx";
import { useClickAway, useEscape } from "./components/dismiss.js";
import AccountSignup from "./components/AccountSignup.jsx";
import AsteriskDock from "./components/AsteriskDock.jsx";
import DesignConsole from "./components/DesignConsole.jsx";
import Notice from "./components/Notice.jsx";

// Seven destinations — the complete mental model of the OS. Every legacy
// route stays reachable: STYLIST rides under DISCOVER, ORDERS under PROFILE,
// STATS/UPLOAD under PASSPORT, and the brain/control-room pages highlight
// their parent subsystem.
const NAV = [
  { href: "/cover", icon: "▣", label: "FRONT COVER", meta: "LIVE EDITION",
    match: (p) => p.startsWith("/cover") },
  { href: "/", icon: "✦", label: "CATALOG", meta: "YOUR EDIT // CURATED",
    match: (p) => p === "/" },
  { href: "/hotlist", icon: "✎", label: "THE WIRE", meta: "POSTS + THE HOTLIST",
    match: (p) => p.startsWith("/hotlist") },
  { href: "/board", icon: "✚", label: "PASSPORT", meta: "IDENT // MOODBOARD",
    match: (p) => p.startsWith("/board") || p.startsWith("/stats") || p.startsWith("/asterisk") || p.startsWith("/upload"),
    sub: [{ href: "/upload", label: "UPLOAD ⇪" }, { href: "/stats", label: "STATS →" }] },
  { href: "/discover", icon: "◎", label: "DISCOVER", meta: "OPEN INDEX",
    match: (p) => p.startsWith("/discover") || p.startsWith("/stylist"),
    sub: [{ href: "/stylist", label: "STYLIST ✂" }] },
  { href: "/profile", icon: "◉", label: "PROFILE", meta: "PUBLIC RECORD",
    match: (p) => p.startsWith("/profile") || p.startsWith("/orders") || p.startsWith("/u/"),
    sub: [{ href: "/orders", label: "ORDERS →" }] },
  { href: "/settings", icon: "⚙", label: "SETTINGS", meta: "CONTROL PANEL",
    match: (p) => p.startsWith("/settings") || p.startsWith("/privacy") || p.startsWith("/terms") || p.startsWith("/accessibility") },
];

// What the ticker carries when the account follows nothing yet (owner order,
// 17 Aug). It used to advertise the machinery — "THE TASTE ENGINE IS LIVE —
// SIX BRIDGES, ONE FEED" — which is both a product claim and a public mention
// of the learning bridges. These are the house lines instead. The spacing in
// "A S I L U M" is the owner's and is deliberate; do not close it up.
const TICKER_PLACEHOLDERS = [
  "ARE YOU SEEKING A S I L U M",
  "DISCOVERY - COMMERCE - COMMUNITY",
  "DISCOVER FROM ARCHIVES ACROSS THE WORLD",
];
const TICKER = TICKER_PLACEHOLDERS.join(" — ") + " — ";

export default function Shell({ children }) {
  const fit = useFitBrain();
  const pathname = usePathname();
  const [bag, setBag] = useState([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [bagHow, setBagHow] = useState(false);
  const bagPanelRef = useRef(null);
  const bagToggleRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [guideOn, setGuideOn] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [follows, setFollows] = useState({ brands: [], users: [] });
  const [authUser, setAuthUser] = useState(null);
  const debounceRef = useRef(null);
  const searchRequestRef = useRef({ id: 0, controller: null });
  const pendingAdoptionRef = useRef(null);
  const deviceIdentityRef = useRef(null);

  useEffect(() => {
    // Clear the stale "connected" flag from the old simulated import — no
    // real connection exists until a real OAuth adapter ships.
    try { window.localStorage.removeItem("asilum-connected"); } catch {}
    const sync = () => setBag(bagList());
    const syncFollows = () => setFollows({ brands: followedBrands(), users: followedUsers() });
    sync();
    syncFollows();
    window.addEventListener("asilum:bag", sync);
    window.addEventListener("asilum:follow", syncFollows);
    // Follows changed in another tab or before a stale render: re-sync.
    window.addEventListener("storage", syncFollows);
    window.addEventListener("focus", syncFollows);
    return () => {
      window.removeEventListener("asilum:bag", sync);
      window.removeEventListener("asilum:follow", syncFollows);
      window.removeEventListener("storage", syncFollows);
      window.removeEventListener("focus", syncFollows);
    };
  }, []);

  useEffect(() => {
    const syncGuide = () => setGuideOn(brainEnabled());
    syncGuide();
    window.addEventListener("asilum:brain", syncGuide);
    return () => window.removeEventListener("asilum:brain", syncGuide);
  }, []);

  // Theme follows the device unless the owner picked one in SETTINGS.
  // The pre-paint script (app/layout.js) resolves the first frame; this
  // listener keeps an un-pinned session in step with a live OS switch.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const followDevice = () => {
      let stored = null;
      try { stored = window.localStorage.getItem("asilum-theme"); } catch {}
      if (stored !== "dark" && stored !== "light") {
        document.documentElement.dataset.theme = mq.matches ? "light" : "dark";
      }
    };
    mq.addEventListener("change", followDevice);
    return () => mq.removeEventListener("change", followDevice);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchRequestRef.current.id++;
    searchRequestRef.current.controller?.abort();
  }, []);

  // One dismissal contract (synergy phase 1): Escape and click-away both
  // close the bag panel; the toggle button still toggles.
  useEscape(() => setBagOpen(false), bagOpen);
  useClickAway(bagPanelRef, () => setBagOpen(false), { active: bagOpen, excludeRef: bagToggleRef });

  // A search that is already open must be re-ranked immediately when the
  // switch changes; stale personalized results must never sit under OFF.
  useEffect(() => {
    if (searchOpen && q.trim()) onSearchInput(q);
  }, [guideOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Server-issued device identity + Supabase magic-link auth. ----
  async function ensureDeviceIdentity() {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) throw new Error("device identity unavailable");
    const data = await response.json();
    if (!data || !/^u-[0-9a-f-]{36}$/.test(data.uid || "")) {
      throw new Error("invalid device identity");
    }
    return data.uid;
  }

  useEffect(() => {
    let active = true;
    let sub = null;
    const deviceIdentity = ensureDeviceIdentity().catch(() => null);
    deviceIdentityRef.current = deviceIdentity;
    const activateDevice = () => deviceIdentity.then((uid) => {
      if (active && uid) setUid(uid);
    });
    getSupabase().then((sb) => {
      if (!active) return;
      if (!sb) { activateDevice(); return; }
      const r = sb.auth.onAuthStateChange((event, session) => {
        if (active) setAuthUser(session?.user || null);
        if (event === "INITIAL_SESSION") {
          if (session) onSignedIn(session);
          else activateDevice();
        }
        if (event === "SIGNED_IN" && session) onSignedIn(session);
        if (event === "SIGNED_OUT") {
          pendingAdoptionRef.current = null;
          clearFitProfile();
          // WHAT WAS WRONG (Aug 7, Round A): this said "device taste remains".
          // It does not. Adoption MOVES taste — it deletes the device's profile
          // row, reassigns its boards, interactions, follows and wardrobe to the
          // account, and leaves the device identity at {} / [] / []. Measured
          // directly against the db layer. Signing out then resumes that same,
          // now-empty device id, so the old notice told the user their taste was
          // still here while the feed they got back was a cold start.
          //
          // The move itself is correct — copying instead would double-count the
          // same taste in aggregates and leave account-derived taste sitting on
          // a possibly shared device. So the message changes, not the behaviour.
          //
          // (Aug 8) The wording now lives in ONE place. app/profile/page.js has
          // its own SIGN OUT handler that publishes the same notice, and it
          // still carried the old false string — this fix landed in shell.js
          // only and never grepped for a second emitter. Both fire, so they
          // raced. Import the constant; do not retype it.
          setAuthNotice(SIGN_OUT_NOTICE);
          activateDevice();
        }
      });
      sub = r && r.data ? r.data.subscription : null;
    });
    return () => {
      active = false;
      pendingAdoptionRef.current = null;
      if (sub) sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adoption uses the HttpOnly device cookie as source proof. Keep subsequent
  // activity on the device identity until the one-time copy succeeds, so a
  // transient database failure cannot strand taste or corrections.
  async function onSignedIn(session) {
    const user = session.user;
    const account = "sb-" + user.id;
    const currentIdentity = getUid();
    if (currentIdentity === account) return;
    if (pendingAdoptionRef.current?.account === account) {
      return pendingAdoptionRef.current.promise;
    }
    if (currentIdentity?.startsWith("sb-")) clearFitProfile();

    const pending = { account, promise: null };
    pendingAdoptionRef.current = pending;
    pending.promise = (async () => {
      let adopted = false;
      try {
        const device = await (deviceIdentityRef.current || ensureDeviceIdentity());
        if (!device) throw new Error("device identity unavailable");
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({ user: account }),
        });
        if (!response.ok) throw new Error("identity adoption failed");
        const adoption = await response.json();
        if (adoption.correctionProfileUpdated === false) {
          setAuthNotice("signed in — corrections moved; stylist profile refresh is pending");
        }
        adopted = true;
      } catch {
        if (pendingAdoptionRef.current === pending) {
          setAuthNotice("signed in, but this device's taste could not be adopted");
        }
      }
      if (adopted && pendingAdoptionRef.current === pending) {
        setUid(account);
        setAuthNotice(`signed in as ${user.email || user.id}`);
      }
    })();
    try { await pending.promise; } finally {
      if (pendingAdoptionRef.current === pending) pendingAdoptionRef.current = null;
    }
  }

  function setAuthNotice(message) {
    try {
      window.localStorage.setItem("asilum-auth-notice", message);
      window.dispatchEvent(new CustomEvent("asilum:auth-notice", { detail: message }));
    } catch {}
  }

  // ---- Multi-search: brands / pieces / aesthetics / users ----
  function onSearchInput(text) {
    setQ(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchRequestRef.current.id++;
    searchRequestRef.current.controller?.abort();
    searchRequestRef.current.controller = null;
    if (!text.trim()) { setResults(null); return; }
    const requestId = searchRequestRef.current.id;
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchRequestRef.current.controller = controller;
      try {
        const query = new URLSearchParams({
          q: text.trim(),
          user: getUid() || "",
          brain: guideOn ? "1" : "0",
        });
        const [searchResponse, suggestResponse] = await Promise.all([
          authorizedFetch("/api/search?" + query.toString(), { signal: controller.signal }),
          fetch("/api/suggest?q=" + encodeURIComponent(text.trim()), { signal: controller.signal }),
        ]);
        if (!searchResponse.ok) throw new Error("search unavailable");
        const [d, s] = await Promise.all([
          searchResponse.json(),
          suggestResponse.ok ? suggestResponse.json() : Promise.resolve({ suggestions: [] }),
        ]);
        if (requestId !== searchRequestRef.current.id) return;
        setResults({
          brands: Array.isArray(d.brands) ? d.brands : [],
          items: Array.isArray(d.items) ? d.items : [],
          aesthetics: Array.isArray(d.aesthetics) ? d.aesthetics : [],
          users: searchUsers(text).slice(0, 4),
          suggestions: Array.isArray(s.suggestions) ? s.suggestions : [],
          note: typeof d.note === "string" ? d.note : null,
        });
      } catch (error) {
        if (requestId === searchRequestRef.current.id && error?.name !== "AbortError") {
          setResults(null);
        }
      } finally {
        if (requestId === searchRequestRef.current.id) {
          searchRequestRef.current.controller = null;
        }
      }
    }, 220);
  }
  function submitSearch(e) {
    if (e.key !== "Enter" || !q.trim()) return;
    window.location.href = "/discover?q=" + encodeURIComponent(q.trim());
  }
  function closeSearch() {
    // Delayed so option mousedown handlers win over blur.
    setTimeout(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchRequestRef.current.id++;
      searchRequestRef.current.controller?.abort();
      searchRequestRef.current.controller = null;
      setSearchOpen(false);
      setResults(null);
      setQ("");
    }, 180);
  }

  // Bag is intent only; checkout, fees, and shipping belong to source sites.
  const subtotal = bag.reduce((s, x) => s + (x.price || 0), 0);
  const nSources = new Set(bag.map((x) => sourceFor(x))).size;

  // Ticker: the brands and people you follow, clickable — brands land on
  // DISCOVER pre-searched, people land on their page. Default copy until you
  // follow something.
  const tickerItems = [];
  for (const b of follows.brands) tickerItems.push({ label: b.toUpperCase(), href: "/discover?q=" + encodeURIComponent(b) });
  for (const h of follows.users) tickerItems.push({ label: h.toUpperCase(), href: "/u/" + encodeURIComponent(h) });
  const tickerRun = tickerItems.length ? (
    <>
      <a className="mqhome" href="/">*ASILUM MAGAZINE</a>
      {tickerItems.map((t, i) => (
        <a className="mqlink" key={t.label + i} href={t.href}> — {t.label}</a>
      ))}
      <span> — </span>
    </>
  ) : (
    <span>{TICKER}</span>
  );

  return (
    <div className="shell">
      {/* Keyboard/screen-reader users jump past the header.
          Visually hidden until focused — no visual-identity change. */}
      <a className="skiplink" href="#main">skip to content</a>
      <div className="os-blob b1" aria-hidden="true" />
      <div className="os-blob b2" aria-hidden="true" />
      <div className="os-blob b3" aria-hidden="true" />
      <div className="os-blob b4" aria-hidden="true" />
      {/* thin non-uniform hairlines + small outline squares slightly
          bordering the page (owner reference language, Aug 12) */}
      <div className="os-frame" aria-hidden="true"><i /><i /><i /><i /></div>

      <header className="tophead">
        <div className="thbar">
          {/* MAGAZINE is justified to the exact width of ASILUM above it (owner
              order, 17 Aug) — one letter per span, spread by flex, so the line
              is flush at both ends at EVERY size instead of guessing at a
              letter-spacing that only lands at one font-size. See .wordmark em.
              aria-label pins the accessible name so splitting the word cannot
              make a screen reader spell it out. */}
          <a className="wordmark" href="/" title="back to the catalog"
             aria-label="*ASILUM magazine — back to the catalog">
            <i>*</i>ASILUM
            <em aria-hidden="true">
              {"MAGAZINE".split("").map((ch, i) => <span key={i}>{ch}</span>)}
            </em>
            {/* Split per CHARACTER, not per word. With three words and
                space-between you get two enormous gaps and tightly-set words —
                which is exactly what looked wrong. Spread every glyph instead
                and the letter gaps come out even, while the space character
                still carries its own width plus a gap either side, so the two
                words stay two words. NBSP because a plain space collapses. */}
            <small aria-hidden="true">
              {"FASHION TERMINAL".split("").map((ch, i) => (
                <span key={i}>{ch === " " ? "\u00A0" : ch}</span>
              ))}
            </small>
          </a>
          <div className="marquee">
            <div className="mq">
              {tickerRun}
              {tickerRun}
            </div>
          </div>
          <div className="topright">
            {searchOpen ? (
              <>
                <input aria-label="ask for a piece, feeling, place, film or era"
                  autoFocus
                  className="search"
                  placeholder="ask for a piece, feeling, place, film, era…"
                  value={q}
                  onChange={(e) => onSearchInput(e.target.value)}
                  onKeyDown={submitSearch}
                  onBlur={closeSearch}
                />
                <AsteriskGuidanceToggle className="fitbtn asearchtoggle" />
              </>
            ) : (
              <button className="tbtn" onClick={() => setSearchOpen(true)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.7" cy="6.7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="10.2" y1="10.2" x2="14.4" y2="14.4" stroke="currentColor" strokeWidth="1.6" /></svg>
                SEARCH
              </button>
            )}
            <button ref={bagToggleRef} className="tbtn" onClick={() => setBagOpen((o) => !o)}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 5h10.8l-.9 9H3.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5.4 5V4a2.6 2.6 0 0 1 5.2 0v1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              BAG ({bag.length})
            </button>
            {authUser ? (
              // Signed in: the corner button becomes the profile circle
              // (owner order, Aug 13) — initial from the account email.
              <a className="tbtn tbav" href="/profile" title={authUser.email || authUser.id} aria-label="your profile — signed in">
                <span className="tbavatar">{String(authUser.email || "•").slice(0, 1).toUpperCase()}</span>
              </a>
            ) : (
              <button
                className="tbtn"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("asilum:signup-open", { detail: { mode: "signin" } }))
                }
              >
                SIGN IN
              </button>
            )}
          </div>
        </div>
        <nav className="topnav">
          <AsteriskDrawer />
          <div className="snavs">
            {NAV.map((n) => {
              const cur = n.match(pathname || "/");
              return (
                <span className="snavwrap" key={n.href}>
                  <a className={"snav" + (cur ? " cur" : "")} href={n.href}>
                    <span className="nic" aria-hidden="true">{n.icon}</span>
                    {n.label}
                    <span className="nled" aria-hidden="true" />
                    <span className="nmeta">{n.meta}</span>
                  </a>
                  {cur && n.sub && (
                    <span className="snavsub">
                      {n.sub.map((s) => (
                        <a key={s.href} className={pathname?.startsWith(s.href) ? "cur" : ""} href={s.href}>{s.label}</a>
                      ))}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <AsteriskDock size={38} className="os-dock navdock" />
        </nav>
      </header>

      <AccountSignup />
      <DesignConsole />

      {searchOpen && results && (
        <div className="searchpanel">
          <div className={"searchguide " + (guideOn ? "on" : "off")}>
            <b className="red">*</b> ASTERISK {guideOn ? "IS GUIDING" : "IS PAUSED"}
            <span>{guideOn ? " · ordered through your Passport" : " · general results"}</span>
          </div>
          {results.note && (
            <div className="searchnote">
              <b className="red">*</b> {results.note}
            </div>
          )}
          {(results.suggestions || []).length > 0 && (
            <>
              <div className="psub">SUGGESTIONS</div>
              {results.suggestions.slice(0, 6).map((s) => (
                <a className="shit" key={s.label} href={"/discover?q=" + encodeURIComponent(s.label)}>
                  {s.label}
                  <em style={{ marginLeft: 8 }}>{s.why === "did you mean" ? "did you mean" : s.kind}</em>
                </a>
              ))}
            </>
          )}
          {results.brands.length > 0 && (
            <>
              <div className="psub">BRANDS</div>
              {results.brands.map((b) => (
                <a className="shit" key={b} href={"/discover?q=" + encodeURIComponent(b)}>{b}</a>
              ))}
            </>
          )}
          {results.items.length > 0 && (
            <>
              <div className="psub">PIECES</div>
              {results.items.map((it) => (
                <a className="shit item" key={it.id} href={"/?item=" + encodeURIComponent(it.id)}>
                  <img src={it.img || thumbFor(it)} alt="" />
                  <span>{it.title}</span>
                  <em>{it.src}{it.price ? ` · ${it.currency || "USD"} ${it.price}` : ""}</em>
                  <ColorEvidenceLine item={it} />
                  <ProductFitLine item={it} fit={fit} />
                </a>
              ))}
            </>
          )}
          {results.aesthetics.length > 0 && (
            <>
              <div className="psub">AESTHETICS</div>
              {results.aesthetics.map((t) => (
                <a className="shit" key={t} href={"/discover?q=" + encodeURIComponent(t.toLowerCase())}>{t}</a>
              ))}
            </>
          )}
          {results.users.length > 0 && (
            <>
              <div className="psub">USERS</div>
              {results.users.map((u) => (
                <div className="urow" key={u.handle}>
                  <Avatar name={u.name} />
                  <div className="uinfo">
                    <div className="uname">{u.name}</div>
                    <div className="uhandle">{u.handle}</div>
                  </div>
                  <FollowButton handle={u.handle} />
                </div>
              ))}
            </>
          )}
          {!results.brands.length && !results.items.length && !results.aesthetics.length && !results.users.length && (
            <div className="pempty">nothing in the archive for that — press enter to search the full racks on DISCOVER.</div>
          )}
        </div>
      )}

      {bagOpen && (
        <div ref={bagPanelRef} className="panel bagpanel">
          <div className="phead">BAG</div>
          {bag.length === 0 ? (
            <div className="pempty">
              Bag empty<br />
              <span style={{ fontSize: 12 }}>The brain notices what you carry.</span>
            </div>
          ) : (
            <>
              {bag.map((x) => (
                <div className="bagrow" key={x.id}>
                  <img src={x.img || thumbFor(x)} alt="" />
                  <div className="baginfo">
                    <div className="bagttl">{x.title}</div>
                    <div className="bagprice">{sourceFor(x)} · {x.currency || "USD"} {x.price}</div>
                    <ColorEvidenceLine item={x} />
                    <ProductFitLine item={x} fit={fit} />
                  </div>
                  <button className="bagx" onClick={() => bagRemove(x.id)}>×</button>
                </div>
              ))}
              <div className="bagfees">
                <div><span>SUBTOTAL</span><b>USD {Math.round(subtotal)}</b></div>
                <div><span>SOURCES</span><b>{nSources}</b></div>
                <div className="bagfinal"><span>CHECKOUT</span><b>ON SOURCE SITES</b></div>
              </div>
              <button className="btn ghost wide" onClick={() => setBagHow((v) => !v)}>
                HOW PURCHASES WORK
              </button>
              {bagHow && (
                <Notice onDismiss={() => setBagHow(false)}>
                  ASILUM does not charge or ship. Open a piece to view its
                  source or create a purchase request.
                </Notice>
              )}
            </>
          )}
          <a className="btn ghost wide" href="/orders" style={{ display: "block", textAlign: "center" }}>
            VIEW ORDERS & TICKETS →
          </a>
        </div>
      )}

      <main id="main" className="main">{children}</main>

      <OsStatus bagCount={bag.length} guideOn={guideOn} pathname={pathname || "/"} />
      <div className="os-crt" aria-hidden="true"><div className="os-roll" /></div>
    </div>
  );
}

/* ---- OS chrome components (redesign/os-shell) ---- */

// Live clock + honest readouts. Everything shown is real client state:
// the route, the bag count, whether ASTERISK guidance is on.
function OsStatus({ bagCount, guideOn, pathname }) {
  const [now, setNow] = useState("");
  useEffect(() => {
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setNow(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <footer className="os-status" aria-label="system status">
      <div className="st">
        <span className={"os-rec" + (guideOn ? "" : " off")} />
        <b>{guideOn ? "ASTERISK GUIDING" : "ASTERISK PAUSED"}</b>
      </div>
      <div className="st">ROUTE <b>{pathname}</b></div>
      <div className="st">BAG <b>{bagCount}</b></div>
      <div className="st"><span className="os-clock" suppressHydrationWarning>{now}</span></div>
    </footer>
  );
}

