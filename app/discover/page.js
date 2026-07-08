"use client";

// app/discover/page.js — DISCOVER.
// The full site inventory across every source — deliberately untouched by the
// moodboard brain or taste profile. Grailed listings reorganized through a
// Pinterest-style browse: source filters, aesthetic filters, multi-search.

import { useEffect, useState, useCallback, useRef } from "react";
import { getUid, postJSON, thumbFor, hashStr, bagAdd } from "../../lib/client.js";
import { SOURCES } from "../../lib/social.js";

const TAGS = ["AVANT-GARDE", "SEDUCTIVE", "STATEMENT", "TAILORED", "ARCHIVAL",
  "MINIMAL", "UTILITARIAN", "STREETWEAR", "INDEPENDENT", "GORP"];
const ASPECTS = ["3 / 4", "1 / 1", "4 / 5", "2 / 3", "3 / 4", "5 / 6"];
const PAGE = 48;

export default function DiscoverPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("");
  const [loading, setLoading] = useState(false);
  const [baggedIds, setBaggedIds] = useState(() => new Set());
  const [favedIds, setFavedIds] = useState(() => new Set());
  const offsetRef = useRef(0);
  const bootedRef = useRef(false);

  const load = useCallback(async (reset = true, qOverride = null) => {
    setLoading(true);
    if (reset) offsetRef.current = 0;
    try {
      const qval = qOverride != null ? qOverride : q;
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offsetRef.current) });
      if (qval.trim()) qs.set("q", qval.trim());
      if (source) qs.set("source", source);
      if (tag) qs.set("tag", tag);
      if (sort) qs.set("sort", sort);
      const d = await fetch("/api/discover?" + qs.toString()).then((r) => r.json());
      setTotal(d.total || 0);
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]));
      offsetRef.current += (d.items || []).length;
    } catch {}
    setLoading(false);
  }, [q, source, tag, sort]);

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
        <input
          type="text"
          placeholder="search brands, pieces, aesthetics…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(true)}
          style={{ maxWidth: 280, textTransform: "none", fontWeight: 400 }}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">all sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
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
          <div className="card" key={it.id}>
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
              <div className="cardacts">
                <button className={favedIds.has(it.id) ? "on" : ""} onClick={() => fav(it)}>
                  {favedIds.has(it.id) ? "Faved ✓" : "Favorite"}
                </button>
                <button className={baggedIds.has(it.id) ? "on" : ""} onClick={() => bag(it)}>
                  {baggedIds.has(it.id) ? "In bag ✓" : "Add to bag"}
                </button>
                {it.url ? (
                  <a
                    className="buybtn"
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >Buy</a>
                ) : (
                  <button onClick={() => alert("direct buy arrives with partner commerce APIs — bag it for now")}>
                    Buy
                  </button>
                )}
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
    </div>
  );
}
