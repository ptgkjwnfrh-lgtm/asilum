"use client";

// app/shell.js
// The magazine shell around every page: *ASILUM magazine wordmark (always a
// way home) + the eight page buttons in the left sidebar, multi-search + bag,
// and the always-moving ticker. Account controls live on PROFILE so identity
// has one obvious home.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  thumbFor, bagList, bagRemove,
} from "../lib/client.js";
import {
  searchUsers, sourceFor, followedBrands, followedUsers,
} from "../lib/social.js";
import { getSupabase } from "../lib/supabase.js";
import { Avatar, FollowButton } from "./components/UserBits.jsx";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "./components/ProductSignals.jsx";

const NAV = [
  { href: "/", label: "HOME" },
  { href: "/hotlist", label: "EDITORIAL / HOTLIST" },
  { href: "/stylist", label: "STYLIST" },
  { href: "/board", label: "MOODBOARD" },
  { href: "/discover", label: "DISCOVER" },
  { href: "/orders", label: "ORDERS & TICKETS" },
  { href: "/profile", label: "PROFILE" },
  { href: "/settings", label: "SETTINGS" },
];

const TICKER =
  "*ASILUM MAGAZINE — THE TASTE ENGINE IS LIVE — SIX BRIDGES, ONE FEED — " +
  "HOTLIST UPDATED CONTINUOUSLY — WEAR THE ARCHIVE — SKIPS TEACH TOO — ";

export default function Shell({ children }) {
  const fit = useFitBrain();
  const pathname = usePathname();
  const [bag, setBag] = useState([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [follows, setFollows] = useState({ brands: [], users: [] });
  const debounceRef = useRef(null);

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

  // ---- Server-issued device identity + Supabase magic-link auth. ----
  async function ensureDeviceIdentity() {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) throw new Error("device identity unavailable");
    const data = await response.json();
    if (!data || !/^u-[0-9a-f-]{36}$/.test(data.uid || "")) {
      throw new Error("invalid device identity");
    }
    try { window.localStorage.setItem("asilum-uid", data.uid); } catch {}
    return data.uid;
  }

  useEffect(() => {
    let sub = null;
    ensureDeviceIdentity().catch(() => {});
    getSupabase().then((sb) => {
      if (!sb) return;
      sb.auth.getSession().then(({ data }) => {
        if (data && data.session) onSignedIn(data.session);
      }).catch(() => {});
      const r = sb.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session) onSignedIn(session);
        if (event === "SIGNED_OUT") {
          ensureDeviceIdentity().catch(() => {});
        }
      });
      sub = r && r.data ? r.data.subscription : null;
    });
    return () => { if (sub) sub.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adoption uses the HttpOnly device cookie as source proof. Keep subsequent
  // activity on the device identity until the one-time copy succeeds, so a
  // transient database failure cannot strand taste or corrections.
  async function onSignedIn(session) {
    const user = session.user;
    const account = "sb-" + user.id;
    let adopted = false;
    try {
      await ensureDeviceIdentity();
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
      setAuthNotice("signed in, but this device's taste could not be adopted");
    }
    if (adopted) {
      try { window.localStorage.setItem("asilum-uid", account); } catch {}
      setAuthNotice(`signed in as ${user.email || user.id}`);
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
    if (!text.trim()) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const [d, s] = await Promise.all([
          fetch("/api/search?q=" + encodeURIComponent(text.trim())).then((r) => r.json()),
          fetch("/api/suggest?q=" + encodeURIComponent(text.trim())).then((r) => r.json()).catch(() => ({ suggestions: [] })),
        ]);
        setResults({ ...d, users: searchUsers(text).slice(0, 4), suggestions: s.suggestions || [] });
      } catch { setResults(null); }
    }, 220);
  }
  function submitSearch(e) {
    if (e.key !== "Enter" || !q.trim()) return;
    window.location.href = "/?q=" + encodeURIComponent(q.trim());
  }
  function closeSearch() {
    // Delayed so option mousedown handlers win over blur.
    setTimeout(() => { setSearchOpen(false); setResults(null); setQ(""); }, 180);
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
      <div className="marquee">
        <div className="mq">
          {tickerRun}
          {tickerRun}
        </div>
      </div>

      <aside className="side">
        <a className="wordmark" href="/" title="back to the feed">
          <i>*</i>ASILUM<em>magazine</em>
        </a>
        <nav className="snavs">
          {NAV.map((n) => (
            <a key={n.href} className={"snav" + (pathname === n.href ? " cur" : "")} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="sfoot">a fashion brain that learns your taste across six bridges</div>
      </aside>

      <div className="topright">
        {searchOpen ? (
          <input
            autoFocus
            className="search"
            placeholder="brands, pieces, aesthetics, users…"
            value={q}
            onChange={(e) => onSearchInput(e.target.value)}
            onKeyDown={submitSearch}
            onBlur={closeSearch}
          />
        ) : (
          <button className="tbtn" onClick={() => setSearchOpen(true)}>SEARCH</button>
        )}
        <button className="tbtn" onClick={() => setBagOpen((o) => !o)}>
          BAG ({bag.length})
        </button>
      </div>

      {searchOpen && results && (
        <div className="searchpanel">
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
                <a className="shit" key={b} href={"/?q=" + encodeURIComponent(b)}>{b}</a>
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
                <a className="shit" key={t} href={"/?q=" + encodeURIComponent(t.toLowerCase())}>{t}</a>
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
            <div className="pempty">nothing in the archive for that — press enter to train the feed on it.</div>
          )}
        </div>
      )}

      {bagOpen && (
        <div className="panel bagpanel">
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
              <button
                className="btn wide soon"
                onClick={() => alert("ASILUM does not charge or ship. Open a piece to view its source or create a purchase request.")}
              >
                HOW PURCHASES WORK
              </button>
            </>
          )}
          <a className="btn ghost wide" href="/orders" style={{ display: "block", textAlign: "center" }}>
            VIEW ORDERS & TICKETS
          </a>
        </div>
      )}

      <main className="main">{children}</main>
    </div>
  );
}
