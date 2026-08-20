"use client";

// app/stylist/page.js — THE STYLIST.
// Full generations: 5 base genres × 5 looks = 25 LOOKs, cut across sources,
// match floor 75 (of 99 — not a percentage), with a 30-day repeat memory
// (a look you've seen has a 10%
// chance of coming back). Each LOOK: pieces with source labels + prices,
// total, curated/taste stats, source count, match %, PASS / SAVE OUTFIT /
// BAG ALL / SET YOUR SIZE / REGENERATE.

import { useEffect, useState, useCallback, useRef } from "react";
import Notice from "../components/Notice.jsx";
import {
  getUid, postJSON, thumbFor, bagAdd,
  loadFitProfile, authorizedFetch, brainEnabled, claimRequest,
} from "../../lib/client.js";
import { sourceFor } from "../../lib/social.js";
import { purchasableLookItems } from "../../lib/wardrobe/purchase.js";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";
import { AsteriskGuidanceToggle } from "../components/AsteriskMemory.jsx";

export default function StylistPage() {
  const [groups, setGroups] = useState(null);
  const [anchorId, setAnchorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [passed, setPassed] = useState(() => new Set());
  const [aiConsent, setAiConsent] = useState(false);
  const [wardrobe, setWardrobe] = useState([]);
  const [guideOn, setGuideOn] = useState(true);
  const guideBooted = useRef(false);
  const loadGenRef = useRef(0);
  const fit = useFitBrain();

  // Owned pieces become anchors: FROM YOUR WARDROBE strip (Feature C).
  const loadWardrobe = useCallback(() => {
    return authorizedFetch("/api/wardrobe?user=" + encodeURIComponent(getUid() || ""))
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setWardrobe(d.items || []))
      .catch(() => setWardrobe([]));
  }, []);
  useEffect(() => {
    loadWardrobe();
    window.addEventListener("asilum:identity", loadWardrobe);
    return () => window.removeEventListener("asilum:identity", loadWardrobe);
  }, [loadWardrobe]);

  const load = useCallback(async (anchor, allowAi = false) => {
    // A new generation claim: an anchor click while a full generate is still
    // in flight must not let the slower response overwrite the newer looks.
    const isCurrent = claimRequest(loadGenRef);
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
      if (!isCurrent()) return;
      setGroups(anchor
        ? [{ genre: "ANCHORED", looks: d.outfits || [] }]
        : d.groups || []);
      if (allowAi && !anchor && d.ai?.source !== "model") {
        setNotice("external AI is unavailable — the local trend + taste engine stayed in control");
      }
    } catch { if (isCurrent()) setGroups([]); }
    finally { if (isCurrent()) setLoading(false); }
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

  useEffect(() => {
    const sync = () => setGuideOn(brainEnabled());
    sync();
    window.addEventListener("asilum:brain", sync);
    return () => window.removeEventListener("asilum:brain", sync);
  }, []);

  useEffect(() => {
    if (!guideBooted.current) {
      guideBooted.current = true;
      return;
    }
    load(anchorId, aiConsent);
  }, [guideOn]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const purchasable = purchasableLookItems(look.items);
    for (const it of purchasable) {
      bagAdd(it);
      postJSON("/api/interaction", {
        user: getUid(), item: { id: it.id, tags: it.tags }, action: "bag",
      }).catch(() => {});
    }
    const total = purchasable.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    setNotice(`the purchasable look is in your bag — ${purchasable.length} pieces, USD ${Math.round(total)} added; your wardrobe piece stayed yours`);
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
      <div className="locline"><a href="/discover">← DISCOVER</a><span>/ THE STYLIST</span></div>
      <h1 className="headline"><span className="red">*</span>THE STYLIST</h1>
      {/* The stylist cuts its looks from the same synthetic catalog, so it
          carries the same disclosure. It has no Buy control to strip — bagging
          a look is a taste signal, which is exactly what a demo catalog is
          for — but the pieces in every look are sample records. */}
      <p className="demobanner" role="note">
        <b>DEMO CATALOG.</b> these looks are cut from synthetic sample records
        with placeholder imagery — the styling logic is real, the garments are
        not, and none of them can be bought.
      </p>
      <p className="deck">
        whole looks cut across sources. {guideOn
          ? "The Asterisk system is styling through your Passport,"
          : "The Asterisk system is paused, so this is a general edit,"}
        {" "}fit-gated when your size is set.
        {anchorId ? " styled around the piece you picked." : ""}
      </p>
      <div className={"searchguide " + (guideOn ? "on" : "off")}>
        <b className="red">*</b> ASTERISK {guideOn ? "GUIDING" : "PAUSED"}
        <span>{guideOn ? "Passport taste + fit + wardrobe are working together" : "Fit and wardrobe still work; saved taste is not used"}</span>
        <AsteriskGuidanceToggle compact className="fitbtn asearchtoggle" />
        <a href="/asterisk">CONTROL →</a>
      </div>
      {wardrobe.length > 0 && (
        <div className="wstrip">
          <span className="wstriplbl"><b className="red">*</b> FROM YOUR WARDROBE</span>
          {wardrobe.slice(0, 8).map((piece) => (
            <button
              key={piece.id}
              className={"wchip" + (anchorId === "wardrobe:" + piece.id ? " cur" : "")}
              onClick={() => { setAnchorId("wardrobe:" + piece.id); load("wardrobe:" + piece.id, aiConsent); }}
            >
              {piece.title}{piece.brand ? " · " + piece.brand : ""}
            </button>
          ))}
        </div>
      )}
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

      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {loading && <div className="empty">cutting twenty-five looks…</div>}
      {!loading && visibleGroups.every((g) => g.looks.length === 0) && groups && (
        <div className="empty">
          {passed.size > 0
            ? "you passed on everything — REGENERATE for a fresh cut."
            : "the catalog is too small to cut looks from right now — the racks refill as designers land."}
        </div>
      )}

      {!loading && visibleGroups.map((g) => (
        g.looks.length > 0 && (
          <section key={g.genre}>
            <h3 className="statshead">{g.genre === "ANCHORED" ? "AROUND YOUR PIECE" : "BASE GENRE — " + g.genre}</h3>
            {g.looks.map((o) => {
              lookNo += 1;
              const nSources = new Set(o.items.filter((it) => !it.owned).map((it) => sourceFor(it))).size;
              return (
                <div className="otf" key={lookKey(o)}>
                  <div className="otfhead">
                    <span className="otfnum">LOOK no.{lookNo}</span>
                    <span className="otfdom">{o.dominantTag}</span>
                    <span className="otfconf">{o.conf}<i>match</i></span>
                  </div>
                  <div className="otfrow">
                    {o.items.map((it, itIdx) => {
                      // The thick floating frame (owner order, Aug 13) marks
                      // TRUE highlights only: the piece a look was styled
                      // around (the engine puts the anchor first) and pieces
                      // the bearer already owns.
                      const hl = it.owned || (g.genre === "ANCHORED" && itIdx === 0);
                      return (
                      <a
                        className={"otfitem" + (hl ? " otfhl" : "")}
                        key={it.id}
                        href={it.owned ? "/profile" : "/?item=" + encodeURIComponent(it.id)}
                      >
                        {hl && <i className="tdrf tdrfs" aria-hidden="true" />}
                        <img src={it.img || thumbFor(it)} alt={it.title} />
                        <span className="otfttl">{it.title}</span>
                        <span className="otfprice">
                          {it.owned ? "YOUR WARDROBE" : sourceFor(it)}{it.price ? ` · ${it.currency || "USD"} ${it.price}` : ""}
                        </span>
                        <ColorEvidenceLine item={it} />
                        <ProductFitLine item={it} fit={fit} />
                      </a>
                      );
                    })}
                  </div>
                  {/* CURATED and TASTE are genuine percentages (mean coherence
                      and mean taste similarity, both 0–1 × 100) and keep the %.
                      MATCH does not: `conf` is the look's composite quality on
                      a 0–99 scale, which lib/brain/stylist.js documents as "not
                      a probability of anything" — so the % is gone and the scale
                      is stated. Anything under 75 never reaches this page: the
                      match floor is a real gate since ruling 8.
                      It also matched the .otfconf chip above, which never had
                      one; the same number now reads the same way twice.
                      A null stat is OMITTED, not printed as "null%": the AI
                      TREND EDIT group has no coherence/taste decomposition. */}
                  <div className="lookstats">
                    <span>TOTAL <b>USD {Math.round(o.total || 0)}</b></span>
                    {Number.isFinite(o.curated) ? <span>CURATED <b>{o.curated}%</b></span> : null}
                    {Number.isFinite(o.tasteStat) ? <span>TASTE <b>{o.tasteStat}%</b></span> : null}
                    <span><b>{nSources}</b> {nSources === 1 ? "SOURCE" : "SOURCES"}</span>
                    <span>MATCH <b className="red">{o.conf}</b> <i className="lsscale">of 99</i></span>
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
        match is a relative ranking signal that sharpens while the Asterisk system
        guidance is active. A look you were already shown has a one-in-ten
        chance of returning inside thirty days.
      </p>

    </div>
  );
}
