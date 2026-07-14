"use client";

// app/discover/page.js — DISCOVER.
// The full site inventory across every source — deliberately untouched by the
// moodboard brain or taste profile unless explicitly enabled during search.

import { useEffect, useState, useCallback, useRef } from "react";
import { getUid, postJSON, authorizedFetch, thumbFor, hashStr, bagAdd, brainEnabled } from "../../lib/client.js";
import { followedBrands, setFollowBrand } from "../../lib/social.js";
import TicketFlow from "../components/TicketFlow.jsx";

const TAGS = ["AVANT-GARDE", "SEDUCTIVE", "STATEMENT", "TAILORED", "ARCHIVAL",
  "MINIMAL", "UTILITARIAN", "STREETWEAR", "INDEPENDENT", "GORP"];
const ASPECTS = ["3 / 4", "1 / 1", "4 / 5", "2 / 3", "3 / 4", "5 / 6"];
const PAGE = 48;

export default function DiscoverPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [sources, setSources] = useState([]);
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("");
  const [loading, setLoading] = useState(false);
  const [baggedIds, setBaggedIds] = useState(() => new Set());
  const [favedIds, setFavedIds] = useState(() => new Set());
  const [searched, setSearched] = useState("");
  const [followed, setFollowed] = useState([]);
  const [sug, setSug] = useState([]);
  const [ticketItem, setTicketItem] = useState(null);
  const offsetRef = useRef(0);
  const bootedRef = useRef(false);
  const sugRef = useRef(null);

  const load = useCallback(async (reset = true, qOverride = null) => {
    setLoading(true);
    if (reset) offsetRef.current = 0;
    try {
      const qval = qOverride != null ? qOverride : q;
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offsetRef.current) });
      if (qval.trim()) {
        qs.set("q", qval.trim());
        // Search ranking may use the Mood Board Brain (toggle on the moodboard
        // page); plain browsing stays untouched by taste, as the deck says.
        qs.set("user", getUid());
        qs.set("brain", brainEnabled() ? "1" : "0");
      }
      if (source) qs.set("source", source);
      if (tag) qs.set("tag", tag);
      if (sort) qs.set("sort", sort);
      const d = await authorizedFetch("/api/discover?" + qs.toString()).then((r) => r.json());
      setTotal(d.total || 0);
      setSources(d.sources || []);
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]));
      offsetRef.current += (d.items || []).length;
      if (reset) setSearched(qval.trim());
    } catch {}
    setLoading(false);
  }, [q, source, tag, sort]);

  useEffect(() => { setFollowed(followedBrands()); }, []);

  // The designer whose rack you're looking at: the last-searched query,
  // matched against the brands actually returned. Exact match wins; a
  // partial match counts only when every result is that one brand.
  const matchedBrand = (() => {
    const qn = searched.toLowerCase();
    if (!qn) return "";
    const exact = items.find((it) => (it.brand || "").toLowerCase() === qn);
    if (exact) return exact.brand;
    const brands = [...new Set(items.map((it) => it.brand).filter(Boolean))];
    if (brands.length === 1 && brands[0].toLowerCase().includes(qn)) return brands[0];
    return "";
  })();

  function toggleFollowBrand() {
    const on = !followed.includes(matchedBrand);
    setFollowed(setFollowBrand(matchedBrand, on));
    if (on) {
      // Feed the follow into the moodboard brain. The lexicon doesn't map
      // designer names, so train on the designer's dominant tags — the same
      // path as typing words into the moodboard training station.
      const w = {};
      for (const it of items) {
        if (it.brand !== matchedBrand) continue;
        for (const [t, v] of Object.entries(it.tags || {})) w[t] = (w[t] || 0) + v;
      }
      const topTags = Object.entries(w)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([t]) => t.toLowerCase());
      if (topTags.length) {
        postJSON("/api/train", { user: getUid(), prompt: topTags.join(" ") }).catch(() => {});
      }
    }
  }

  // Boot: honor ?q= from ticker/search links (brand lands pre-searched).
  useEffect(() => {
    const qq = new URLSearchParams(window.location.search).get("q") || "";
    if (qq) setQ(qq);
    load(true, qq);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter changes refetch — skip the mount run so it can't race the boot fetch.
  useEffect(() => {
    if (bootedRef.current) load(true);
    else bootedRef.current = true;
  }, [source, tag, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  function fav(it) {
    setFavedIds((p) => new Set(p).add(it.id));
    postJSON("/api/interaction", {
      user: getUid(), item: { id: it.id, tags: it.tags }, action: "favorite",
    }).catch(() => {});
  }
  function bag(it) {
    bagAdd(it);
    setBaggedIds((p) => new Set(p).add(it.id));
    postJSON("/api/interaction", {
      user: getUid(), item: { id: it.id, tags: it.tags }, action: "bag",
    }).catch(() => {});
  }

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>DISCOVER</h1>
      <p className="deck">
        the entire rack, every source, untouched by your taste profile —
        {" "}{total ? total + " pieces" : "counting"} across the archive.
      </p>

      <div className="filters">
        <div className="sugwrap">
          <input
            type="text"
            placeholder="search brands, pieces, aesthetics…"
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (sugRef.current) clearTimeout(sugRef.current);
              if (v.trim().length < 2) { setSug([]); return; }
              sugRef.current = setTimeout(async () => {
                try {
                  const d = await fetch("/api/suggest?q=" + encodeURIComponent(v.trim())).then((r) => r.json());
                  setSug(d.suggestions || []);
                } catch { setSug([]); }
              }, 180);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { setSug([]); load(true); } }}
            onBlur={() => setTimeout(() => setSug([]), 180)}
            style={{ maxWidth: 280, textTransform: "none", fontWeight: 400 }}
          />
          {sug.length > 0 && (
            <div className="sugbox">
              {sug.map((s) => (
                <button
                  key={s.label}
                  className="sugopt"
                  onMouseDown={() => { setQ(s.label); setSug([]); load(true, s.label); }}
                >
                  <span className="red">*</span> {s.label}
                  <em>{s.why === "did you mean" ? "did you mean" : s.kind}</em>
                </button>
              ))}
            </div>
          )}
        </div>
        {matchedBrand && (
          <button
            className={"fitbtn" + (followed.includes(matchedBrand) ? " active" : "")}
            onClick={toggleFollowBrand}
          >
            {followed.includes(matchedBrand)
              ? `FOLLOWING ${matchedBrand} ✓`
              : `FOLLOW ${matchedBrand}`}
          </button>
        )}
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">all sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="">default order</option>
          <option value="new">newest</option>
          <option value="price-asc">price ↑</option>
          <option value="price-desc">price ↓</option>
        </select>
      </div>
      <div className="tagfilter">
        {TAGS.map((t) => (
          <button
            key={t}
            className={"chip clickable" + (tag === t ? " cur" : "")}
            onClick={() => setTag(tag === t ? "" : t)}
          >
            {t}
          </button>
        ))}
      </div>
      <hr className="rule" />

      {loading && items.length === 0 && <div className="empty">opening the racks…</div>}
      {!loading && items.length === 0 && <div className="empty">nothing matches — loosen a filter.</div>}

      <div className="grid">
        {items.map((it) => (
          <div
            className="card"
            key={it.id}
            style={{ cursor: "pointer" }}
            onClick={() => { window.location.href = "/?item=" + encodeURIComponent(it.id); }}
          >
            <div className="imgwrap" style={{ aspectRatio: ASPECTS[hashStr(it.id) % ASPECTS.length] }}>
              <img src={it.img || thumbFor(it)} alt={it.alt || it.title} loading="lazy" />
            </div>
            <div className="body">
              <div className="brand2">{it.brand}</div>
              <div className="ttl">{it.title}</div>
              <div className="meta">
                {it.category ? <span className="cat">{it.category}</span> : null}
                <span className="srclabel">{it.src}</span>
              </div>
              <div className="tags">
                {Object.keys(it.tags || {}).slice(0, 3).map((t) => (
                  <span className="t" key={t}>{t}</span>
                ))}
              </div>
              {it.price ? <div className="price">{it.currency || "USD"} {it.price}</div> : null}
              <div className="cardacts" onClick={(e) => e.stopPropagation()}>
                <button className={favedIds.has(it.id) ? "on" : ""} onClick={() => fav(it)}>
                  {favedIds.has(it.id) ? "Faved ✓" : "Favorite"}
                </button>
                <button className={baggedIds.has(it.id) ? "on" : ""} onClick={() => bag(it)}>
                  {baggedIds.has(it.id) ? "In bag ✓" : "Add to bag"}
                </button>
                <button className="buybtn" onClick={() => setTicketItem(it)}>Buy</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length < total && (
        <div className="controls" style={{ justifyContent: "center" }}>
          <button className="btn ghost" disabled={loading} onClick={() => load(false)}>
            {loading ? "loading…" : `MORE (${total - items.length} left)`}
          </button>
        </div>
      )}

      {ticketItem && <TicketFlow item={ticketItem} onClose={() => setTicketItem(null)} />}
    </div>
  );
}
