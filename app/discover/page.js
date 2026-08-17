"use client";

// app/discover/page.js — DISCOVER.
// The full site inventory across every source. Asterisk may route search and
// exploration through the user's Passport, but the user can pause that layer.

import { useEffect, useState, useCallback, useRef } from "react";
import { getUid, postJSON, authorizedFetch, thumbFor, bagAdd, brainEnabled, aspectFor } from "../../lib/client.js";
import { followedBrands, setFollowBrand, isDemoItem, DEMO_LABEL } from "../../lib/social.js";
import TicketFlow from "../components/TicketFlow.jsx";
import { DiscoverRails } from "../components/DiscoverRails.jsx";
import { AsteriskGuidanceToggle } from "../components/AsteriskMemory.jsx";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";

const TAGS = ["AVANT-GARDE", "SEDUCTIVE", "STATEMENT", "TAILORED", "ARCHIVAL",
  "MINIMAL", "UTILITARIAN", "STREETWEAR", "INDEPENDENT", "GORP"];
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
  const [loadError, setLoadError] = useState("");
  const [baggedIds, setBaggedIds] = useState(() => new Set());
  const [favedIds, setFavedIds] = useState(() => new Set());
  const [searched, setSearched] = useState("");
  const [followed, setFollowed] = useState([]);
  const [sug, setSug] = useState([]);
  const [ticketItem, setTicketItem] = useState(null);
  const [reading, setReading] = useState(null);      // Asterisk's cultural read of the query
  const [assumption, setAssumption] = useState(null); // Passport influenced-assumption (r10)
  const [guideOn, setGuideOn] = useState(true);
  const fit = useFitBrain();
  const [activeInterp, setActiveInterp] = useState("");
  const interpRef = useRef(null);                     // active interpretation's tags
  const offsetRef = useRef(0);
  const bootedRef = useRef(false);
  const sugRef = useRef(null);
  const loadRequestRef = useRef({ id: 0, controller: null });
  const suggestRequestRef = useRef({ id: 0, controller: null });

  const load = useCallback(async (reset = true, qOverride = null) => {
    loadRequestRef.current.id++;
    loadRequestRef.current.controller?.abort();
    const requestId = loadRequestRef.current.id;
    const controller = new AbortController();
    loadRequestRef.current.controller = controller;
    setLoading(true);
    setLoadError("");
    if (reset) offsetRef.current = 0;
    const requestOffset = reset ? 0 : offsetRef.current;
    try {
      const qval = qOverride != null ? qOverride : q;
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(requestOffset) });
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
      const response = await authorizedFetch("/api/discover?" + qs.toString(), {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("discover unavailable");
      const d = await response.json();
      if (requestId !== loadRequestRef.current.id) return;
      const nextItems = Array.isArray(d.items) ? d.items : [];
      setTotal(d.total || 0);
      setSources(Array.isArray(d.sources) ? d.sources : []);
      setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      offsetRef.current = requestOffset + nextItems.length;
      if (reset) {
        setSearched(qval.trim());
        setAssumption(d.assumption && d.assumption.applied ? d.assumption : null);
      }
    } catch (error) {
      if (requestId === loadRequestRef.current.id && error?.name !== "AbortError") {
        setLoadError("the racks could not be opened — retry");
        if (reset) {
          setItems([]);
          setTotal(0);
          setSources([]);
        }
      }
    } finally {
      if (requestId === loadRequestRef.current.id) {
        loadRequestRef.current.controller = null;
        setLoading(false);
      }
    }
  }, [q, source, tag, sort, guideOn]);

  useEffect(() => { setFollowed(followedBrands()); }, []);
  useEffect(() => {
    const sync = () => setGuideOn(brainEnabled());
    sync();
    window.addEventListener("asilum:brain", sync);
    return () => window.removeEventListener("asilum:brain", sync);
  }, []);

  useEffect(() => () => {
    if (sugRef.current) clearTimeout(sugRef.current);
    loadRequestRef.current.id++;
    loadRequestRef.current.controller?.abort();
    suggestRequestRef.current.id++;
    suggestRequestRef.current.controller?.abort();
  }, []);

  // Ask Asterisk to READ the query (film / music / city / decade). Misses are
  // honest: entity null → no strip, standard search stands.
  useEffect(() => {
    if (!searched) { setReading(null); setActiveInterp(""); interpRef.current = null; return; }
    const controller = new AbortController();
    const user = guideOn ? "&user=" + encodeURIComponent(getUid() || "") : "";
    authorizedFetch("/api/interpret?q=" + encodeURIComponent(searched) + user, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const keep = d && (d.entity || (d.interpretation &&
          (["ambiguous", "composed"].includes(d.interpretation.method) || d.interpretation.flaggedForResearch)));
        if (!controller.signal.aborted) {
          setReading(keep ? d : null);
          setActiveInterp("");
          interpRef.current = null;
        }
      })
      .catch(() => { if (!controller.signal.aborted) setReading(null); });
    return () => controller.abort();
  }, [searched, guideOn]);

  function cancelSuggestions() {
    if (sugRef.current) clearTimeout(sugRef.current);
    suggestRequestRef.current.id++;
    suggestRequestRef.current.controller?.abort();
    suggestRequestRef.current.controller = null;
    setSug([]);
  }

  function queueSuggestions(value) {
    setQ(value);
    cancelSuggestions();
    if (value.trim().length < 2) return;
    const requestId = suggestRequestRef.current.id;
    sugRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestRequestRef.current.controller = controller;
      try {
        const response = await fetch(
          "/api/suggest?q=" + encodeURIComponent(value.trim()),
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("suggestions unavailable");
        const d = await response.json();
        if (requestId === suggestRequestRef.current.id) {
          setSug(Array.isArray(d.suggestions) ? d.suggestions : []);
        }
      } catch (error) {
        if (requestId === suggestRequestRef.current.id && error?.name !== "AbortError") {
          setSug([]);
        }
      } finally {
        if (requestId === suggestRequestRef.current.id) {
          suggestRequestRef.current.controller = null;
        }
      }
    }, 180);
  }

  function pickInterp(i) {
    interpRef.current = i.tags || [];
    setActiveInterp(i.id);
    load(true);
    // (r17) an applied reading is "this is what I meant" — tell the brain.
    // Fire-and-forget; the server resolves the reading's tags itself and
    // trains only when guidance is on.
    if (searched && i.id && i.id.includes("/")) {
      authorizedFetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: getUid(), query: searched, interpretationId: i.id, verdict: "meant" }),
      }).catch(() => {});
    }
  }
  function clearInterp() {
    interpRef.current = null;
    setActiveInterp("");
    load(true);
  }
  function submitSearch(qOverride = null) {
    // A new query must never inherit the prior query's interpretation tags.
    // Refs update synchronously, avoiding the state/effect race here.
    cancelSuggestions();
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
      <p className="demobanner" role="note">
        <b>DEMO ARCHIVE.</b> synthetic sample records with placeholder imagery —
        nothing here is real inventory or for sale. the search is real; the
        clothes are not.
      </p>
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

      <div className="dhints">
        <span className="dhintlbl">✳ NATURAL LANGUAGE ACCEPTED —</span>
        {[
          "black wide leg trousers",
          "something like helmut lang but softer",
          "japanese minimalism from the early 2000s",
          "goretex but elegant",
        ].map((h) => (
          <button key={h} className="dhint" onMouseDown={() => { setQ(h); submitSearch(h); }}>
            » {h}
          </button>
        ))}
      </div>

      <div className="filters">
        <div className="sugwrap">
          <input
            type="text"
            placeholder="search a piece, feeling, place, film, era…"
            value={q}
            onChange={(e) => queueSuggestions(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
            onBlur={() => setTimeout(() => setSug([]), 180)}
            style={{ maxWidth: 280, textTransform: "none", fontWeight: 400 }}
          />
          {sug.length > 0 && (
            <div className="sugbox">
              {sug.map((s) => (
                <button
                  key={s.label}
                  className="sugopt"
                  onMouseDown={() => { setQ(s.label); submitSearch(s.label); }}
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
      {assumption && !activeInterp ? (
        <div className="areadnote">
          <b className="red">*</b> passport assumption — narrowed to “{assumption.label || assumption.entity}” ({assumption.tags.join(" · ").toLowerCase()}); pick any reading above to override
        </div>
      ) : null}
      {!searched && !activeInterp && <DiscoverRails onPickTags={pickInterp} />}
      <hr className="rule" />

      {loading && items.length === 0 && <div className="empty">opening the racks…</div>}
      {!loading && loadError && items.length === 0 && (
        <div className="empty">
          {loadError}{" "}
          <button className="fitbtn" onClick={() => load(true)}>RETRY</button>
        </div>
      )}
      {!loading && !loadError && items.length === 0 && (
        <div className="empty">nothing matches — loosen a filter.</div>
      )}

      <div className="grid">
        {items.map((it) => (
          <div
            className="card"
            key={it.id}
            style={{ cursor: "pointer" }}
            onClick={() => { window.location.href = "/?item=" + encodeURIComponent(it.id); }}
          >
            <div className="imgwrap" style={{ aspectRatio: aspectFor(it.id) }}>
              <img src={it.img || thumbFor(it)} alt={it.alt || it.title} loading="lazy" />
            </div>
            <div className="body">
              <div className="brand2">{it.brand}</div>
              <div className="ttl">{it.title}</div>
              <div className="meta">
                {it.category ? <span className="cat">{it.category}</span> : null}
                {/* A demo record carries the demo flag instead of a source
                    label — it has no source to name. */}
                {isDemoItem(it)
                  ? <span className="srclabel demoflag">{DEMO_LABEL}</span>
                  : <span className="srclabel">{it.src}</span>}
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
                {/* DEMO MODE: no Buy on a record /api/tickets answers 409 for.
                    Favorite and bag stay — they are taste signals about a
                    sample, which is exactly what a demo catalog is for. */}
                {!isDemoItem(it) && (
                  <button className="buybtn" onClick={() => setTicketItem(it)}>Buy</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length < total && (
        <div className="controls" style={{ justifyContent: "center" }}>
          <button className="btn ghost" disabled={loading} onClick={() => load(false)}>
            {loading ? "loading…" : loadError ? "RETRY MORE" : `MORE (${total - items.length} left)`}
          </button>
        </div>
      )}

      {ticketItem && <TicketFlow item={ticketItem} onClose={() => setTicketItem(null)} />}
    </div>
  );
}
