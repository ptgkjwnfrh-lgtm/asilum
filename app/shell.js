"use client";

// app/shell.js
// The magazine shell around every page: *ASILUM magazine wordmark (always a
// way home) + the eight page buttons in the left sidebar, multi-search + bag
// pinned upper right, account pinned lower right, and the always-moving
// ticker across the top. Grailed-white, Helvetica-black, red stars only.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getUid, postJSON, thumbFor, bagList, bagRemove,
  loadFitProfile, saveFitProfile, EMPTY_FIT,
} from "../lib/client.js";
import {
  searchUsers, sourceFor, followedBrands, followedUsers,
  setFollowBrand, setFollowUser,
} from "../lib/social.js";
import { Avatar, FollowButton } from "./components/UserBits.jsx";

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

const SERVICE_FEE = 0.05;   // ASILUM service fee
const SHIP_PER_SOURCE = 12; // flat shipping estimate per marketplace source

const PLATFORMS = ["grailed", "depop", "ssense", "ebay", "pinterest"];

export default function Shell({ children }) {
  const pathname = usePathname();
  const [uid, setUid] = useState("");
  const [bag, setBag] = useState([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [fit, setFit] = useState(EMPTY_FIT);
  const [connecting, setConnecting] = useState("");
  const [connected, setConnected] = useState("");
  const [connectMsg, setConnectMsg] = useState("");
  const [follows, setFollows] = useState({ brands: [], users: [] });
  const debounceRef = useRef(null);

  useEffect(() => {
    setUid(getUid() || "");
    setFit(loadFitProfile());
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

  function updateFit(k, v) {
    setFit((prev) => { const n = { ...prev, [k]: v }; saveFitProfile(n); return n; });
  }

  // ---- Multi-search: brands / pieces / aesthetics / users ----
  function onSearchInput(text) {
    setQ(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const d = await fetch("/api/search?q=" + encodeURIComponent(text.trim())).then((r) => r.json());
        setResults({ ...d, users: searchUsers(text).slice(0, 4) });
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

  async function connect(platform) {
    if (connecting) return;
    setConnecting(platform);
    try {
      const res = await postJSON("/api/connect", { user: getUid(), platform });
      const d = await res.json().catch(() => null);
      if (d && d.imported) {
        try {
          window.localStorage.setItem("asilum-connected", platform);
          window.localStorage.setItem("asilum-onboarded", "1");
        } catch {}
        setConnected(platform);
        window.location.href = "/";
      } else {
        setConnectMsg((d && d.message) || platform + " linking is coming soon — real account setup required");
      }
    } catch {
      setConnectMsg(platform + " linking is coming soon — real account setup required");
    }
    setConnecting("");
  }

  // ---- Bag math: subtotal, service fee, shipping estimate, total ----
  const subtotal = bag.reduce((s, x) => s + (x.price || 0), 0);
  const fee = Math.round(subtotal * SERVICE_FEE);
  const nSources = new Set(bag.map((x) => sourceFor(x))).size;
  const shipping = nSources * SHIP_PER_SOURCE;
  const total = subtotal + fee + shipping;

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
          <button
            className={"snav acct" + (acctOpen ? " cur" : "")}
            onClick={() => { setAcctOpen((o) => !o); setBagOpen(false); }}
          >
            ACCOUNT
          </button>
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
        <button className="tbtn" onClick={() => { setBagOpen((o) => !o); setAcctOpen(false); }}>
          BAG ({bag.length})
        </button>
      </div>

      {searchOpen && results && (
        <div className="searchpanel">
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
                  </div>
                  <button className="bagx" onClick={() => bagRemove(x.id)}>×</button>
                </div>
              ))}
              <div className="bagfees">
                <div><span>SUBTOTAL</span><b>USD {Math.round(subtotal)}</b></div>
                <div><span>ASILUM SERVICE FEE</span><b>USD {fee}</b></div>
                <div><span>SHIPPING EST. ({nSources} {nSources === 1 ? "SOURCE" : "SOURCES"})</span><b>USD {shipping}</b></div>
                <div className="bagfinal"><span>TOTAL</span><b>USD {Math.round(total)}</b></div>
              </div>
              <button
                className="btn wide soon"
                onClick={() => alert("cross-site checkout arrives with partner commerce APIs — nothing was charged")}
              >
                CHECKOUT ACROSS SITES
              </button>
            </>
          )}
          <a className="btn ghost wide" href="/orders" style={{ display: "block", textAlign: "center" }}>
            VIEW ORDERS & TICKETS
          </a>
        </div>
      )}

      {acctOpen && (
        <div className="panel acctpanel">
          <div className="phead">ACCOUNT</div>
          <div className="acctid">{uid ? uid.slice(0, 14) + "…" : ""}</div>
          <a className="shit" href="/profile">→ your profile</a>
          <a className="shit" href="/settings">→ settings & partnered accounts</a>

          <div className="psub">FOLLOWING — BRANDS</div>
          {follows.brands.length === 0 ? (
            <div className="pempty">no brands yet — follow them from a piece or your profile.</div>
          ) : (
            <div className="tagfilter">
              {follows.brands.map((b) => (
                <span className="chip clickable cur" key={b} onClick={() => setFollowBrand(b, false)}>
                  {b} ×
                </span>
              ))}
            </div>
          )}
          <div className="psub">FOLLOWING — PEOPLE</div>
          {follows.users.length === 0 ? (
            <div className="pempty">no one yet — WHO TO FOLLOW lives on home.</div>
          ) : (
            <div className="tagfilter">
              {follows.users.map((h) => (
                <span className="chip clickable cur" key={h} onClick={() => setFollowUser(h, false)}>
                  {h} ×
                </span>
              ))}
            </div>
          )}

          <div className="psub">CONNECTED ACCOUNT</div>
          {connected ? (
            <div className="acctline">{connected} — account linked</div>
          ) : (
            <div className="platformrow">
              {PLATFORMS.map((p) => (
                <button key={p} className="platform soon" disabled={!!connecting} onClick={() => connect(p)}>
                  {connecting === p ? "checking…" : p}
                </button>
              ))}
            </div>
          )}
          {connectMsg && <div className="acctline">{connectMsg}</div>}

          <div className="psub">SIZING — stored only on this device</div>
          <div className="fitform">
            <label>
              usual size
              <select value={fit.usualSize} onChange={(e) => updateFit("usualSize", e.target.value)}>
                <option value="">—</option>
                {["XXS","XS","S","M","L","XL","XXL","XXXL"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              chest (in)
              <input type="number" inputMode="decimal" value={fit.chest}
                onChange={(e) => updateFit("chest", e.target.value)} placeholder="40" />
            </label>
            <label>
              waist (in)
              <input type="number" inputMode="decimal" value={fit.waist}
                onChange={(e) => updateFit("waist", e.target.value)} placeholder="32" />
            </label>
          </div>
        </div>
      )}

      <main className="main">{children}</main>
    </div>
  );
}
