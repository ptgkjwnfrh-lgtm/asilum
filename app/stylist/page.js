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
  loadFitProfile, saveFitProfile,
} from "../../lib/client.js";
import { sourceFor } from "../../lib/social.js";

export default function StylistPage() {
  const [groups, setGroups] = useState(null);
  const [anchorId, setAnchorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [passed, setPassed] = useState(() => new Set());
  const [sizeOpen, setSizeOpen] = useState(false);
  const [fit, setFit] = useState({ usualSize: "", chest: "", waist: "" });

  const load = useCallback(async (anchor) => {
    setLoading(true);
    setPassed(new Set());
    try {
      const f = loadFitProfile();
      const qs = new URLSearchParams({ user: getUid() || "guest" });
      if (anchor) { qs.set("anchor", anchor); qs.set("n", "5"); }
      else qs.set("full", "1");
      if (f.usualSize) qs.set("fit", f.usualSize);
      if (f.chest) qs.set("chest", f.chest);
      if (f.waist) qs.set("waist", f.waist);
      const d = await fetch("/api/outfits?" + qs.toString()).then((r) => r.json());
      setGroups(anchor
        ? [{ genre: "ANCHORED", looks: d.outfits || [] }]
        : d.groups || []);
    } catch { setGroups([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setFit(loadFitProfile());
    const sp = new URLSearchParams(window.location.search);
    const anchor = sp.get("anchor") || "";
    setAnchorId(anchor);
    load(anchor);
  }, [load]);

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

  function updateFit(k, v) {
    setFit((prev) => { const n = { ...prev, [k]: v }; saveFitProfile(n); return n; });
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
        <button className="btn" onClick={() => load(anchorId)}>REGENERATE</button>
        <button className="btn ghost" onClick={() => setSizeOpen(true)}>SET YOUR SIZE</button>
        {anchorId ? (
          <button className="btn ghost" onClick={() => { setAnchorId(""); load(""); }}>
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

      {sizeOpen && (
        <div className="overlay" onClick={() => setSizeOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2>Your size<span style={{ color: "var(--red)" }}>.</span></h2>
            <p className="deck">saved on this device — every look is fit-gated through it.</p>
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
            <div className="controls">
              <button className="btn" onClick={() => { setSizeOpen(false); load(anchorId); }}>
                SAVE & RECUT LOOKS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
