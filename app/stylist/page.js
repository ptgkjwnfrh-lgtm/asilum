"use client";

// app/stylist/page.js — THE STYLIST.
// Full generations: 5 base genres × 5 looks = 25 LOOKs, cut across sources,
// match floor 75%, with a 30-day repeat memory (a look you've seen has a 10%
// chance of coming back). Each LOOK: pieces with source labels + prices,
// total, curated/taste stats, source count, match %, PASS / SAVE OUTFIT /
// BAG ALL / SET YOUR SIZE / REGENERATE.

import { useEffect, useState, useCallback } from "react";
import {
  getUid, postJSON, thumbFor, bagAdd,
  loadFitProfile,
} from "../../lib/client.js";
import { sourceFor } from "../../lib/social.js";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";

export default function StylistPage() {
  const [groups, setGroups] = useState(null);
  const [anchorId, setAnchorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [passed, setPassed] = useState(() => new Set());
  const [aiConsent, setAiConsent] = useState(false);
  const fit = useFitBrain();

  const load = useCallback(async (anchor, allowAi = false) => {
    setLoading(true);
    setPassed(new Set());
    try {
      const f = loadFitProfile();
      const res = await postJSON("/api/outfits", {
        kind: "generate", user: getUid() || "guest",
        anchor: anchor || null, full: !anchor, n: anchor ? 5 : undefined,
        fit: f,
        // Explicit opt-in controls external model use. Measurements remain in
        // the local fit engine even when this is on and are never sent onward.
        aiConsent: allowAi && !anchor,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "stylist unavailable");
      setGroups(anchor
        ? [{ genre: "ANCHORED", looks: d.outfits || [] }]
        : d.groups || []);
      if (allowAi && !anchor && d.ai?.source !== "model") {
        setNotice("external AI is unavailable — the local trend + taste engine stayed in control");
      }
    } catch { setGroups([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let storedAiConsent = false;
    try { storedAiConsent = window.localStorage.getItem("asilum-ai-stylist-consent") === "1"; } catch {}
    setAiConsent(storedAiConsent);
    const sp = new URLSearchParams(window.location.search);
    const anchor = sp.get("anchor") || "";
    setAnchorId(anchor);
    load(anchor, storedAiConsent);
  }, [load]);

  function toggleAiConsent() {
    const next = !aiConsent;
    setAiConsent(next);
    try {
      if (next) window.localStorage.setItem("asilum-ai-stylist-consent", "1");
      else window.localStorage.removeItem("asilum-ai-stylist-consent");
    } catch {}
    load(anchorId, next);
  }

  function lookKey(look) { return look.items.map((it) => it.id).join("|"); }

  function bagAll(look) {
    for (const it of look.items) {
      bagAdd(it);
      postJSON("/api/interaction", {
        user: getUid(), item: { id: it.id, tags: it.tags }, action: "bag",
      }).catch(() => {});
    }
    setNotice(`the whole look is in your bag — ${look.items.length} pieces, USD ${Math.round(look.total)} added`);
  }

  async function saveOutfit(look) {
    for (const it of look.items) {
      await postJSON("/api/boards", { user: getUid(), item: it }).catch(() => {});
    }
    // Persist the look itself (stylist_outfits) — the stylist's memory of hits.
    postJSON("/api/outfits", { user: getUid(), look }).catch(() => {});
    setNotice("look saved to your moodboard — every piece teaches the brain");
  }

  function pass(look) {
    setPassed((p) => new Set(p).add(lookKey(look)));
    for (const it of look.items.slice(0, 2)) {
      postJSON("/api/interaction", {
        user: getUid(), item: { id: it.id, tags: it.tags }, action: "skip", dwellMs: 900,
      }).catch(() => {});
    }
  }

  let lookNo = 0;
  const visibleGroups = (groups || []).map((g) => ({
    ...g,
    looks: g.looks.filter((l) => !passed.has(lookKey(l))),
  }));

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>THE STYLIST</h1>
      <p className="deck">
        whole looks cut across sources — 5 per base genre, floor 75% match,
        {" "}fit-gated when your size is set.
        {anchorId ? " styled around the piece you picked." : ""}
      </p>
      <div className="controls">
        <button className="btn" onClick={() => load(anchorId, aiConsent)}>REGENERATE</button>
        <a className="btn ghost" href="/profile#measurements">SET YOUR MEASUREMENTS</a>
        <button className="btn ghost" aria-pressed={aiConsent} onClick={toggleAiConsent}>
          AI TREND LENS {aiConsent ? "ON" : "OFF"}
        </button>
        {anchorId ? (
          <button className="btn ghost" onClick={() => { setAnchorId(""); load("", aiConsent); }}>
            drop the anchor piece
          </button>
        ) : null}
      </div>
      <hr className="rule" />

      {notice && <div className="autonote" onClick={() => setNotice("")}>{notice}</div>}
      {loading && <div className="empty">cutting twenty-five looks…</div>}
      {!loading && visibleGroups.every((g) => g.looks.length === 0) && groups && (
        <div className="empty">you passed on everything — REGENERATE for a fresh cut.</div>
      )}

      {!loading && visibleGroups.map((g) => (
        g.looks.length > 0 && (
          <section key={g.genre}>
            <h3 className="statshead">{g.genre === "ANCHORED" ? "AROUND YOUR PIECE" : "BASE GENRE — " + g.genre}</h3>
            {g.looks.map((o) => {
              lookNo += 1;
              const nSources = new Set(o.items.map((it) => sourceFor(it))).size;
              return (
                <div className="otf" key={lookKey(o)}>
                  <div className="otfhead">
                    <span className="otfnum">LOOK no.{lookNo}</span>
                    <span className="otfdom">{o.dominantTag}</span>
                    <span className="otfconf">{o.conf}<i>match</i></span>
                  </div>
                  <div className="otfrow">
                    {o.items.map((it) => (
                      <a className="otfitem" key={it.id} href={"/?item=" + encodeURIComponent(it.id)}>
                        <img src={it.img || thumbFor(it)} alt={it.title} />
                        <span className="otfttl">{it.title}</span>
                        <span className="otfprice">
                          {sourceFor(it)}{it.price ? ` · ${it.currency || "USD"} ${it.price}` : ""}
                        </span>
                        <ColorEvidenceLine item={it} />
                        <ProductFitLine item={it} fit={fit} />
                      </a>
                    ))}
                  </div>
                  <div className="lookstats">
                    <span>TOTAL <b>USD {Math.round(o.total || 0)}</b></span>
                    <span>CURATED <b>{o.curated}%</b></span>
                    <span>TASTE <b>{o.tasteStat}%</b></span>
                    <span><b>{nSources}</b> {nSources === 1 ? "SOURCE" : "SOURCES"}</span>
                    <span>MATCH <b className="red">{o.conf}%</b></span>
                  </div>
                  {o.fitNotes && o.fitNotes.length ? (
                    <div className="otffit">{o.fitNotes.join(" · ")}</div>
                  ) : null}
                  <div className="otfacts">
                    <button className="btn ghost" onClick={() => pass(o)}>PASS</button>
                    <button className="btn ghost" onClick={() => saveOutfit(o)}>SAVE OUTFIT</button>
                    <button className="btn" onClick={() => bagAll(o)}>BAG ALL</button>
                    <span className="otfwhy">{o.why}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )
      ))}

      <p className="deck" style={{ marginTop: 22 }}>
        match is a relative ranking signal that sharpens as the brain learns
        you — a look you were already shown has a one-in-ten chance of
        returning inside thirty days.
      </p>

    </div>
  );
}
