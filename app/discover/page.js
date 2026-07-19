"use client";

// app/discover/page.js — DISCOVER.
// The full site inventory across every source. Asterisk may route search and
// exploration through the user's Passport, but the user can pause that layer.

import { useEffect, useState, useCallback, useRef } from "react";
import { getUid, postJSON, authorizedFetch, thumbFor, hashStr, bagAdd, brainEnabled, claimRequest } from "../../lib/client.js";
import { followedBrands, setFollowBrand } from "../../lib/social.js";
import TicketFlow from "../components/TicketFlow.jsx";
import { DiscoverRails } from "../components/DiscoverRails.jsx";
import { AsteriskGuidanceToggle } from "../components/AsteriskMemory.jsx";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";

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
  const [reading, setReading] = useState(null);      // Asterisk's cultural read of the query
  const [guideOn, setGuideOn] = useState(true);
  const fit = useFitBrain();
  const [activeInterp, setActiveInterp] = useState("");
  const interpRef = useRef(null);                     // active interpretation's tags
  const offsetRef = useRef(0);
  const bootedRef = useRef(false);
  const sugRef = useRef(null);
  const loadGenRef = useRef(0);
  const sugGenRef = useRef(0);

  const load = useCallback(async (reset = true, qOverride = null) => {
    // Every load claims a new generation: a slower older response — most
    // importantly a pending Asterisk-ON rack after guidance was paused —
    // must never overwrite the rack a newer request owns.
    const isCurrent = claimRequest(loadGenRef);
    setLoading(true);
    if (reset) offsetRef.current = 0;
    try {
      const qval = qOverride != null ? qOverride : q;
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offsetRef.current) });
      if (interpRef.current && interpRef.current.length) {
        // An Asterisk interpretation is active: browse by its tag signals.
        qs.set("tags", interpRef.current.join("|"));
      } else if (qval.trim()) {
        qs.set("q", qval.trim());
        // The server also checks the saved preference; this query flag lets the
        // client request a general rack immediately after guidance is paused.
        qs.set("user", getUid());
        qs.set("brain", guideOn ? "1" : "0");
      }
      if (source) qs.set("source", source);
      if (tag) qs.set("tag", tag);
      if (sort) qs.set("sort", sort);
      const d = await authorizedFetch("/api/discover?" + qs.toString()).then((r) => r.json());
      if (!isCurrent()) return;
      setTotal(d.total || 0);
      setSources(d.sources || []);
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]));
      offsetRef.current += (d.items || []).length;
      if (reset) setSearched(qval.trim());
    } catch {}
    if (isCurrent()) setLoading(false);
  }, [q, source, tag, sort, guideOn]);

  useEffect(() => { setFollowed(followedBrands()); }, []);
  useEffect(() => {
    const sync = () => setGuideOn(brainEnabled());
    sync();
    window.addEventListener("asilum:brain", sync);
    return () => window.removeEventListener("asilum:brain", sync);
  }, []);

  // Ask Asterisk to READ the query (film / music / city / decade). Misses are
  // honest: entity null → no strip, standard search stands.
  useEffect(() => {
    if (!searched) { setReading(null); setActiveInterp(""); interpRef.current = null; return; }
    let alive = true;
    const user = guideOn ? "&user=" + encodeURIComponent(getUid() || "") : "";
    authorizedFetch("/api/interpret?q=" + encodeURIComponent(searched) + user)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const keep = d && (d.entity || (d.interpretation &&
          (["ambiguous", "composed"].includes(d.interpretation.method) || d.interpretation.flaggedForResearch)));
        if (alive) { setReading(keep ? d : null); setActiveInterp(""); interpRef.current = null; }
      })
      .catch(() => { if (alive) setReading(null); });
    return () => { alive = false; };
  }, [searched, guideOn]);

  function pickInterp(i) {
    interpRef.current = i.tags || [];
    setActiveInterp(i.id);
    load(true);
  }
  function clearInterp() {
    interpRef.current = null;
    setActiveInterp("");
    load(true);
  }
  function submitSearch(qOverride = null) {
    // A new query must never inherit the prior query's interpretation tags.
    // Refs update synchronously, avoiding the state/effect race here.
    interpRef.current = null;
    setActiveInterp("");
    setReading(null);
    load(true, qOverride);
  }

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
  }, [source, tag, sort, guideOn]); // eslint-disable-line react-hooks/exhaustive-deps

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
        explore the full archive. {guideOn
          ? "Asterisk is using your Passport to route every search toward your style."
          : "Asterisk guidance is paused, so results stay general."}
        {" "}{total ? total + " pieces" : "counting"} across the racks.
      </p>
      <div className={"searchguide " + (guideOn ? "on" : "off")}>
        <b className="red">*</b> ASTERISK {guideOn ? "GUIDING" : "PAUSED"}
        <span>{guideOn ? "Passport-aware ranking is active" : "Your Passport is saved but not influencing results"}</span>
        <AsteriskGuidanceToggle compact className="fitbtn asearchtoggle" />
      </div>

      <div className="filters">
        <div className="sugwrap">
          <input
            type="text"
            placeholder="search a piece, feeling, place, film, era…"
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (sugRef.current) clearTimeout(sugRef.current);
              if (v.trim().length < 2) { setSug([]); return; }
              sugRef.current = setTimeout(async () => {
                const isCurrent = claimRequest(sugGenRef);
                try {
                  const d = await fetch("/api/suggest?q=" + encodeURIComponent(v.trim())).then((r) => r.json());
                  if (isCurrent()) setSug(d.suggestions || []);
                } catch { if (isCurrent()) setSug([]); }
              }, 180);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { setSug([]); submitSearch(); } }}
            onBlur={() => setTimeout(() => setSug([]), 180)}
            style={{ maxWidth: 280, textTransform: "none", fontWeight: 400 }}
          />
          {sug.length > 0 && (
            <div className="sugbox">
              {sug.map((s) => (
                <button
                  key={s.label}
                  className="sugopt"
                  onMouseDown={() => { setQ(s.label); setSug([]); submitSearch(s.label); }}
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
      {reading && reading.entity && (
        <div className="aread">
          <div className="areadhead">
            <b className="red">*</b> ASTERISK READS: {reading.entity.name.toUpperCase()}
            <em> {reading.entity.kind}</em>
            {reading.interpretation && reading.interpretation.method !== "exact" ? (
              <em> · {reading.interpretation.method === "recovered" ? "recovered reading" : reading.interpretation.method}</em>
            ) : null}
            {reading.personalized ? <em> · ordered by your taste</em> : null}
          </div>
          <div className="areadpills">
            {reading.interpretations.map((i) => (
              <button key={i.id} className={"apill" + (activeInterp === i.id ? " cur" : "")}
                title={i.summary} onClick={() => pickInterp(i)}>
                {i.label}
              </button>
            ))}
            {activeInterp ? (
              <button className="apill clearpill" onClick={clearInterp}>× full results</button>
            ) : null}
          </div>
          {activeInterp ? (
            <div className="areadsum">
              {(reading.interpretations.find((i) => i.id === activeInterp) || {}).summary}
            </div>
          ) : null}
          {reading.interpretation && reading.interpretation.confidence.interpretation != null ? (
            <div className="areadnote">
              interpretation confidence: <b>{Math.round(reading.interpretation.confidence.interpretation * 100)}%</b>
              {reading.interpretation.assumptions[0] ? ` — ${reading.interpretation.assumptions[0]}` : ""}
            </div>
          ) : null}
          {reading.entity.trend ? (
            <div className="areadnote">
              trend: <b>{reading.entity.trend.phase}</b> — {reading.entity.trend.note}
              {reading.entity.trend.lastReviewed ? ` (reviewed ${reading.entity.trend.lastReviewed})` : ""}
            </div>
          ) : null}
          {reading.entity.note ? <div className="areadnote">{reading.entity.note}</div> : null}
        </div>
      )}
      {reading && !reading.entity && reading.interpretation &&
        (["ambiguous", "composed", "lexical"].includes(reading.interpretation.method)) && (
        <div className="aread">
          <div className="areadhead">
            <b className="red">*</b> ASTERISK {reading.interpretation.method === "ambiguous" ? "ASKS: WHICH ONE?"
              : reading.interpretation.method === "composed" ? "READS: A COMPOSITION"
              : "READS: STYLE ATTRIBUTES"}
          </div>
          <div className="areadpills">
            {Object.keys(reading.interpretation.attributes?.tags || {}).length ? (
              <button
                className={"apill" + (activeInterp === "attribute-read" ? " cur" : "")}
                onClick={() => pickInterp({
                  id: "attribute-read",
                  tags: Object.keys(reading.interpretation.attributes.tags),
                })}
              >
                use best read
              </button>
            ) : null}
            {reading.interpretation.alternatives.map((a) => (
              <button key={a.feedbackId} className="apill"
                onClick={() => { setQ(a.name); submitSearch(a.name); }}>
                {a.name} <em>{a.kind}</em>
              </button>
            ))}
            {activeInterp === "attribute-read" ? (
              <button className="apill clearpill" onClick={clearInterp}>× full results</button>
            ) : null}
          </div>
          {reading.interpretation.assumptions[0] ? (
            <div className="areadnote">{reading.interpretation.assumptions[0]}</div>
          ) : null}
        </div>
      )}
      {reading && reading.interpretation && reading.interpretation.flaggedForResearch ? (
        <div className="areadnote">
          <b className="red">*</b> asterisk flagged this for research — answering with its best current reading
        </div>
      ) : null}
      {!searched && !activeInterp && <DiscoverRails onPickTags={pickInterp} />}
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
              <ColorEvidenceLine item={it} />
              <ProductFitLine item={it} fit={fit} />
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
