"use client";

// app/components/SearchSheet.jsx — GLOBAL SEARCH's answer (V.2 brief,
// owner, 1 Oct 2026, §1 + §9–10). The dock's field holds the query; this
// sheet opens over the root with the results: a sourced ENTITY OVERVIEW
// preview when the query names one (lib/people/overviews.js — eligible
// regardless of the content toggles), then PIECES (the existing
// /api/discover, which reads the sentence and keeps every constraint) and
// WIRE posts (the editorial endpoint, matched on text and tags), each
// behind its toggle. ASTERISK on asks the discover endpoint for the
// Passport-guided order (brain=1); off is plain relevance, never random.
// "Search all ASiLUM" leads to the full /discover page with the same query.
//
// The overview preview keeps the primary reference's shape: portrait over
// the ASiLUM OVERVIEW lettering, the title and summary beside it, the
// source link visible, Read more → the detail inside this sheet (Back
// returns here with the query intact).

import { useEffect, useState } from "react";
import { useDock, pushSheet } from "../../lib/dockstate.js";
import { authorizedFetch, getUid, thumbFor } from "../../lib/client.js";
import { fetchWire } from "../../lib/social.js";
import { findOverview } from "../../lib/people/overviews.js";
import { isDemoItem, DEMO_LABEL } from "../../lib/social.js";
import SaveButton from "./SaveButton.jsx";
import ModelTag from "./ModelTag.jsx";
import OverviewPreview from "./OverviewPreview.jsx";

const PIECES = 12, POSTS = 8;

export default function SearchSheet() {
  const dock = useDock();
  const q = String(dock.q || "").trim();
  const { pieces: wantPieces, wire: wantWire, asterisk } = dock.toggles;
  const [res, setRes] = useState({ q: "", items: [], total: 0, posts: [], note: null, loading: false, error: "" });

  useEffect(() => {
    if (!q) { setRes({ q: "", items: [], total: 0, posts: [], note: null, loading: false, error: "" }); return undefined; }
    let live = true;
    setRes((r) => ({ ...r, q, loading: true, error: "" }));
    (async () => {
      const out = { q, items: [], total: 0, posts: [], note: null, loading: false, error: "" };
      try {
        if (wantPieces) {
          const qs = new URLSearchParams({ q, limit: String(PIECES) });
          if (asterisk) { qs.set("brain", "1"); const uid = getUid(); if (uid) qs.set("user", uid); }
          const r = await authorizedFetch("/api/discover?" + qs.toString());
          if (r.ok) { const d = await r.json(); out.items = d.items || []; out.total = d.total || out.items.length; out.note = d.note || d.engineNote || null; }
          else out.error = "the index did not answer";
        }
        if (wantWire) {
          const w = await fetchWire("user", 60);
          const needle = q.toLowerCase();
          out.posts = (w.posts || []).filter((p) => [p.title, p.text, p.name, p.handle, ...(p.tags || [])].join(" ").toLowerCase().includes(needle)).slice(0, POSTS);
        }
      } catch { out.error = "search is unavailable right now"; }
      if (live) setRes(out);
    })();
    return () => { live = false; };
  }, [q, wantPieces, wantWire, asterisk]);

  const overview = q ? findOverview(q) : null;

  if (!q) {
    return (
      <div className="srch">
        <p className="deck">Type above. Handles, pieces, places, eras, a feeling.</p>
        <p className="fine">Pieces and Wire are the content toggles; ASTERISK orders by your Passport when it is on. Nothing is searched until you type.</p>
      </div>
    );
  }

  return (
    <div className="srch">
      <div className="srchrow">
        <span className="cclbl">RESULTS FOR “{q}”</span>
        <a className="txtbtn" href={"/discover?q=" + encodeURIComponent(q)}>SEARCH ALL ASILUM →</a>
      </div>
      {overview && (
        <OverviewPreview person={overview} onOpen={() => pushSheet("overview", { person: overview, title: overview.name.toUpperCase() })} />
      )}
      {res.loading && <p className="pempty" role="status">reading…</p>}
      {res.error && <p className="pempty" role="status">{res.error}</p>}
      {res.note && typeof res.note === "string" && <p className="fine">{res.note}</p>}

      {wantPieces && !res.loading && (
        <section className="srchsec" aria-label="pieces">
          <div className="cclbl">PIECES {res.total ? `· ${res.total}` : ""}</div>
          {res.items.length ? (
            <ul className="srchgrid">
              {res.items.map((it) => (
                <li key={it.id} className="srchcard" data-id={it.id}>
                  <a className="srchimg" href={"/?item=" + encodeURIComponent(it.id)} aria-label={it.title}>
                    <img src={it.img || thumbFor(it)} alt="" loading="lazy" />
                  </a>
                  <div className="srchbody">
                    <span className="brand2">{it.brand}</span>
                    <a className="ttl" href={"/?item=" + encodeURIComponent(it.id)}>{it.title}</a>
                    <span className="likemeta">{isDemoItem(it) ? DEMO_LABEL : it.src}{it.price ? ` · ${it.currency || "USD"} ${it.price}` : ""}</span>
                    <SaveButton kind="piece" id={it.id} title={it.title} image={it.img || thumbFor(it)} href={"/?item=" + encodeURIComponent(it.id)} meta={it.brand} tags={Object.keys(it.tags || {})} item={it} className="savew" />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="pempty" role="status">no pieces read that way.</p>}
        </section>
      )}

      {wantWire && !res.loading && (
        <section className="srchsec" aria-label="wire">
          <div className="cclbl">WIRE</div>
          {res.posts.length ? (
            <ul className="likelist">
              {res.posts.map((p) => (
                <li key={p.id} className="likerow" data-id={p.id}>
                  {p.imageUrl ? <img className="likeimg" src={p.imageUrl} alt="" loading="lazy" /> : <span className="likeimg blank" aria-hidden="true" />}
                  <div className="likebody">
                    <a className="liketitle" href={p.serverId != null ? "/?post=" + encodeURIComponent(p.serverId) : "/"}>{p.title || (p.text || "").slice(0, 80)}</a>
                    <span className="likemeta">{p.name || p.handle}{p.sample ? " · SAMPLE" : ""}</span>
                  </div>
                  {p.sample ? <ModelTag kind="sample">SAMPLE</ModelTag> : null}
                </li>
              ))}
            </ul>
          ) : <p className="pempty" role="status">no Wire posts match that.</p>}
        </section>
      )}
    </div>
  );
}
