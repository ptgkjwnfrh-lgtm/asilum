"use client";

// app/upload/page.js — UPLOAD // TEACH ASTERISK (redesign/upload-station).
// A Pinterest-style moodboard station over the warped-in Paris map:
// drop pieces, fit pics, anything that matches the vibe — tiles persist
// on-device and every batch trains through the honest palette-v0
// pipeline. Favorites (celebrities / cities / movies / singers), favorite
// designers (real brand-dominant-tag training, same path as DISCOVER
// follows), and lean-toward styles feed the same brain. Floating plug-in
// pills (Pinterest / Spotify / Apple Music / Letterboxd) are honest
// coming-soon controls — no fake OAuth, ever.
//
// Honesty per mapping: singers hit the curated music map (descriptors →
// lexicon) and say what Asterisk read; unknown names are RECORDED to the
// bearer's file (real mood_board_uploads rows) and said to be unmapped —
// nothing pretends. Design: Gen X Soft Club (curves, haze, milky glass).

import { useEffect, useRef, useState } from "react";
import { getUid, postJSON, authorizedFetch } from "../../lib/client.js";
import { analyzePalette, mergePalettes } from "../../lib/vision/palette.js";
import { vizState } from "../../lib/brain/memory.js";
import { TAGS } from "../../lib/brain/tags.js";
import { mapArtist } from "../../lib/music-mapping/index.js";
import { setFollowBrand, followedBrands } from "../../lib/social.js";
import AsteriskDock from "../components/AsteriskDock.jsx";
import ParisMap, { useParisRoads } from "../components/ParisMap.jsx";
import BrainViz from "../components/BrainViz.jsx";
import Notice from "../components/Notice.jsx";
import { useEscape } from "../components/dismiss.js";

const DOCK_WORDS = ["LISTENING", "LEARNING", "READING", "WEIGHING", "REMEMBERING"];
const BOARD_KEY = "asilum-upload-board";
const FAVS_KEY = "asilum-favorites";
const EMPTY_FAVS = { celebrities: [], cities: [], movies: [], singers: [], styles: [] };

export default function UploadPage() {
  const [uid, setUid] = useState("");
  const [viz, setViz] = useState(null);
  const [notice, setNotice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState([]);
  const [tiles, setTiles] = useState([]);      // device-local moodboard
  const [favs, setFavs] = useState(EMPTY_FAVS);
  const [designers, setDesigners] = useState([]);
  const fileRef = useRef(null);
  const map = useParisRoads();
  // arriving from the passport build: reuse its exact fit so the
  // background IS the animation's last frame (no reframe cut). Read
  // synchronously so the first painted frame already matches; direct
  // visits (or a resized window) fall back to the viewport slice fit.
  const [warpFit] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const f = JSON.parse(window.sessionStorage.getItem("asilum-warp-fit"));
      if (
        f && Number.isFinite(f.s) && f.s > 0 &&
        Math.abs(f.vw - window.innerWidth) < 2 &&
        Math.abs(f.vh - window.innerHeight) < 2
      ) return f;
    } catch {}
    return null;
  });
  const [resetOpen, setResetOpen] = useState(false);
  const [resetChecked, setResetChecked] = useState(false);
  useEscape(() => { setResetOpen(false); setResetChecked(false); }, resetOpen);

  async function resetBrain() {
    await postJSON("/api/reset", { user: uid }).catch(() => {});
    setResetOpen(false);
    setResetChecked(false);
    setNotice("recommendation model reset — boards, event history, tickets, and aggregate graph signals remain");
    loadViz();
  }
  function forgotten() {
    if (!viz || !viz.profile || !viz.profile._meta) return [];
    return (viz.profile._meta.forgotten || []).slice(0, 4);
  }

  useEffect(() => {
    const user = getUid();
    setUid(user || "");
    if (user) loadViz(user);
    try { setTiles(JSON.parse(window.localStorage.getItem(BOARD_KEY)) || []); } catch {}
    try { setFavs({ ...EMPTY_FAVS, ...(JSON.parse(window.localStorage.getItem(FAVS_KEY)) || {}) }); } catch {}
    setDesigners(followedBrands());
  }, []);

  function loadViz(user = uid || getUid()) {
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .then((d) => setViz({ state: vizState(d.profile), profile: d.profile }))
      .catch(() => {});
  }
  function convictions() {
    if (!viz) return [];
    return Object.entries(viz.state.weights)
      .filter(([, w]) => Math.abs(w) > 0.01)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 6);
  }
  const hear = (line) => setHeard((h) => [line, ...h].slice(0, 6));
  function saveTiles(next) {
    setTiles(next);
    try { window.localStorage.setItem(BOARD_KEY, JSON.stringify(next)); } catch {}
  }
  function saveFavs(next) {
    setFavs(next);
    try { window.localStorage.setItem(FAVS_KEY, JSON.stringify(next)); } catch {}
  }

  // ---- moodboard tiles: thumbnail for the wall + palette-v0 training ----
  async function thumbOf(file) {
    const bmp = await createImageBitmap(file);
    const scale = 340 / Math.max(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * Math.min(1, scale)));
    canvas.height = Math.max(1, Math.round(bmp.height * Math.min(1, scale)));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, Math.min(48, canvas.width), Math.min(48, canvas.height)).data;
    const url = canvas.toDataURL("image/jpeg", 0.72);
    if (bmp.close) bmp.close();
    return { url, px };
  }
  async function ingestFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => /^image\//.test(f.type || ""));
    if (!files.length || !uid || busy) return;
    setBusy(true);
    const words = files.map((f) => f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ")).join(" ");
    const analyses = [];
    const newTiles = [];
    for (const f of files.slice(0, 8)) {
      try {
        const { url, px } = await thumbOf(f);
        const a = analyzePalette(px);
        if (a) analyses.push(a);
        newTiles.push({ id: (window.crypto?.randomUUID?.() || String(Date.now()) + Math.random()), src: url, name: f.name.slice(0, 80) });
      } catch {}
    }
    const merged = mergePalettes(analyses);
    const paletteWords = [...new Set(analyses.flatMap((a) => [...a.words, ...a.moods]))].slice(0, 14);
    const prompt = [words, paletteWords.join(" ")].filter(Boolean).join(" ").trim();
    if (prompt) await postJSON("/api/train", { user: uid, prompt }).catch(() => {});
    postJSON("/api/moodboard", {
      user: uid, kind: "upload",
      filenames: files.map((f) => f.name.slice(0, 200)),
      palette: merged.palette.map((s) => ({ hex: s.hex, weight: s.weight })),
      uploadId: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10),
    }).catch(() => {});
    saveTiles([...newTiles, ...tiles].slice(0, 40));
    const seen = [...new Set(merged.palette.map((s) => s.name))].slice(0, 3).join(", ");
    hear(`${files.length} image${files.length > 1 ? "s" : ""}${seen ? " — " + seen : ""}`);
    setNotice(analyses.length
      ? `pinned — palette v0 saw ${seen}; trained on colors + filename words`
      : "pinned — pixels unreadable, trained on the words the files carried");
    setBusy(false);
    loadViz();
  }
  function removeTile(id) {
    saveTiles(tiles.filter((t) => t.id !== id));
  }

  // ---- favorites: recorded always, trained where a real mapping exists ----
  async function addFav(kind, raw) {
    const name = raw.trim();
    if (!name || !uid) return;
    if ((favs[kind] || []).some((x) => x.toLowerCase() === name.toLowerCase())) return;
    saveFavs({ ...favs, [kind]: [...(favs[kind] || []), name] });
    // Every favorite is a REAL record on the bearer's file.
    postJSON("/api/moodboard", { user: uid, kind: "text", prompt: `favorite ${kind.replace(/s$/, "")}: ${name}` }).catch(() => {});
    if (kind === "singers") {
      // mapArtist returns the ai-contract envelope: {ok, data:{tags, descriptors}}.
      const hit = mapArtist(name);
      const descriptors = hit?.ok ? hit.data?.descriptors || [] : [];
      if (descriptors.length) {
        await postJSON("/api/train", { user: uid, prompt: descriptors.join(" ") }).catch(() => {});
        hear(`${name} → ${descriptors.slice(0, 3).join(" · ")}`);
        setNotice(`asterisk knows ${name} — trained on ${descriptors.slice(0, 4).join(", ")}`);
        loadViz();
        return;
      }
    }
    if (kind === "styles") {
      await postJSON("/api/train", { user: uid, prompt: name.toLowerCase() }).catch(() => {});
      hear(name.toLowerCase());
      setNotice(`leaned into ${name.toLowerCase()}`);
      loadViz();
      return;
    }
    // No curated mapping yet (celebrities / cities / movies / unknown
    // singers): try the words through the lexicon anyway, and say the truth.
    postJSON("/api/train", { user: uid, prompt: name.toLowerCase() }).catch(() => {});
    hear(`${name} (on file)`);
    setNotice(`${name} is on your record — the culture catalog maps it as coverage grows`);
    loadViz();
  }
  function removeFav(kind, name) {
    saveFavs({ ...favs, [kind]: (favs[kind] || []).filter((x) => x !== name) });
  }

  // ---- designers: the real brand path — follow + dominant-tag training ----
  async function addDesigner(raw) {
    const name = raw.trim();
    if (!name || !uid) return;
    const res = await authorizedFetch("/api/search?q=" + encodeURIComponent(name) + "&brain=0").catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    const brand = (d?.brands || []).find((b) => b.toLowerCase() === name.toLowerCase()) || (d?.brands || [])[0];
    if (!brand) {
      setNotice(`${name} isn't in the archive yet — nothing trained, nothing pretended`);
      return;
    }
    setDesigners(setFollowBrand(brand, true));
    const w = {};
    for (const it of d.items || []) {
      if (it.brand !== brand) continue;
      for (const [t, v] of Object.entries(it.tags || {})) w[t] = (w[t] || 0) + v;
    }
    const topTags = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t.toLowerCase());
    if (topTags.length) await postJSON("/api/train", { user: uid, prompt: topTags.join(" ") }).catch(() => {});
    hear(`${brand} → ${topTags.slice(0, 3).join(" · ") || "followed"}`);
    setNotice(`following ${brand}${topTags.length ? ` — trained on ${topTags.join(", ")}` : ""}`);
    loadViz();
  }
  function removeDesigner(brand) {
    setDesigners(setFollowBrand(brand, false));
  }

  return (
    <div className="wrap gx">
      {map && (
        <div className="gxmap" aria-hidden="true">
          {warpFit ? (
            <div
              className="gxmapfit"
              style={{
                left: warpFit.tx, top: warpFit.ty,
                width: map.w * warpFit.s, height: map.h * warpFit.s,
              }}
            >
              <ParisMap map={map} hot />
            </div>
          ) : (
            <ParisMap map={map} hot />
          )}
        </div>
      )}
      <div className="gxblob gxb1" aria-hidden="true" />
      <div className="gxblob gxb2" aria-hidden="true" />

      <header className="gxhero">
        <h1 className="headline"><span className="red">*</span>UPLOAD</h1>
        <p className="deck">pin the vibe, name your people, follow your designers — asterisk answers on the right.</p>
      </header>
      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      <div className="gxlayout">
        <main className="gxmain">
          <section className="gxcard">
            <div className="gxlabel">01 · THE WALL — PIN ANYTHING THAT FEELS LIKE YOU</div>
            <div
              className={"gxdrop slim" + (dragOver ? " over" : "") + (busy ? " busy" : "")}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); ingestFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current && fileRef.current.click()}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
            >
              <span className="gxdropmark">⇪</span>
              <b>{busy ? "reading the pixels…" : "drop pieces, fit pics, anything with the vibe"}</b>
              <em>palette v0 reads the colors; filename words teach too. pins stay on this device.</em>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { ingestFiles(e.target.files); e.target.value = ""; }} />
            {tiles.length > 0 && (
              <div className="gxwall">
                {tiles.map((t) => (
                  <figure className="gxtile" key={t.id}>
                    <img src={t.src} alt={t.name} />
                    <button className="gxtilex" title="unpin" onClick={() => removeTile(t.id)}>×</button>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section className="gxcard">
            <div className="gxlabel">02 · YOUR PEOPLE & PLACES — NAME WHAT SHAPES YOU</div>
            <div className="gxfavgrid">
              <FavField kind="celebrities" label="FAVORITE CELEBRITIES" placeholder="whose style pulls you…" favs={favs} onAdd={addFav} onRemove={removeFav} />
              <FavField kind="singers" label="FAVORITE SINGERS" placeholder="the sound you dress like…" favs={favs} onAdd={addFav} onRemove={removeFav} />
              <FavField kind="cities" label="FAVORITE CITIES" placeholder="where you feel dressed right…" favs={favs} onAdd={addFav} onRemove={removeFav} />
              <FavField kind="movies" label="FAVORITE MOVIES" placeholder="films that look like your closet…" favs={favs} onAdd={addFav} onRemove={removeFav} />
            </div>
            <em className="gxfoot">every name lands on your record. where the culture catalog knows them, asterisk trains — and tells you what it read.</em>
          </section>

          <section className="gxcard">
            <div className="gxlabel">03 · DESIGNERS & LEANINGS</div>
            <FavInput label="FAVORITE DESIGNERS" placeholder="type a designer — asterisk learns their dominant tags…" onAdd={addDesigner} />
            {designers.length > 0 && (
              <div className="gxchips" style={{ marginBottom: 14 }}>
                {designers.map((b) => (
                  <span className="gxchip on" key={b}>{b} <i onClick={() => removeDesigner(b)}>×</i></span>
                ))}
              </div>
            )}
            <FavInput label="STYLES YOU LEAN TOWARD" placeholder="washed black, y2k, gorpcore, quiet tailoring…" onAdd={(v) => addFav("styles", v)} />
            {favs.styles.length > 0 && (
              <div className="gxchips" style={{ marginBottom: 14 }}>
                {favs.styles.map((s) => (
                  <span className="gxchip on" key={s}>{s} <i onClick={() => removeFav("styles", s)}>×</i></span>
                ))}
              </div>
            )}
            <div className="gxchips">
              {TAGS.map((t) => (
                <button key={t} className="gxchip" onClick={() => addFav("styles", t.toLowerCase())}>{t.toLowerCase()}</button>
              ))}
            </div>
          </section>
        </main>

        <aside className="gxside">
          <section className="gxcard gxasterisk">
            <AsteriskDock words={DOCK_WORDS} className="os-dock gxdock" />
            <div className="gxviz">
              {viz && <BrainViz {...viz.state} height={190} />}
            </div>
            <div className="gxlabel" style={{ margin: "14px 0" }}>WHAT ASTERISK HOLDS</div>
            {convictions().length === 0 ? (
              <em className="gxfoot">nothing yet — the record starts with your first pin.</em>
            ) : (
              <div className="gxread">
                {convictions().map(([tag, w]) => (
                  <div className="gxconv" key={tag}>
                    <span>{tag.toLowerCase()}</span>
                    <div className="gxbar"><i style={{ width: Math.min(100, Math.abs(w) * 100) + "%" }} /></div>
                    <b>{Math.round(Math.abs(w) * 100)}</b>
                  </div>
                ))}
              </div>
            )}
            {heard.length > 0 && (
              <div className="gxheard">
                <span className="gxlabel">HEARD THIS SESSION</span>
                {heard.map((h, i) => <em key={i}>· {h}</em>)}
              </div>
            )}
            {forgotten().length > 0 && (
              <div className="gxheard">
                <span className="gxlabel">RECENTLY FORGOTTEN</span>
                {forgotten().map((f, i) => <em key={i}>· {f.tag.toLowerCase()} — let go</em>)}
              </div>
            )}
            <div className="gxrow gxlinks">
              <a className="gxbtn ghost" href="/board">PASSPORT →</a>
              <a className="gxbtn ghost" href="/stats">FULL READ →</a>
            </div>
            <button className="resetlink" onClick={() => setResetOpen(true)}>
              Reset Brain <b>[Full Amnesia]</b>
            </button>
          </section>
        </aside>
      </div>

      {resetOpen && (
        <div className="overlay" onClick={() => { setResetOpen(false); setResetChecked(false); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <button className="mclose" aria-label="close" onClick={() => { setResetOpen(false); setResetChecked(false); }}>×</button>
            <h2>Full amnesia<span style={{ color: "var(--red)" }}>.</span></h2>
            <p className="deck">
              this permanently deletes your taste profile — every conviction,
              streak, and forgetting log. your moodboards, orders, and the
              shared taste graph survive. there is no undo.
            </p>
            <label className="toggle" style={{ margin: "10px 0 18px" }}>
              <input type="checkbox" checked={resetChecked} onChange={(e) => setResetChecked(e.target.checked)} />
              I understand this deletes my taste profile
            </label>
            <div className="controls">
              <button className="btn" disabled={!resetChecked} onClick={resetBrain}>
                ERASE EVERYTHING THE BRAIN KNOWS
              </button>
              <button className="btn ghost" onClick={() => { setResetOpen(false); setResetChecked(false); }}>
                keep my taste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A labelled add-input with its chip list — favorites fields share one form.
function FavField({ kind, label, placeholder, favs, onAdd, onRemove }) {
  return (
    <div className="gxfav">
      <FavInput label={label} placeholder={placeholder} onAdd={(v) => onAdd(kind, v)} />
      {(favs[kind] || []).length > 0 && (
        <div className="gxchips">
          {favs[kind].map((n) => (
            <span className="gxchip on" key={n}>{n} <i onClick={() => onRemove(kind, n)}>×</i></span>
          ))}
        </div>
      )}
    </div>
  );
}

function FavInput({ label, placeholder, onAdd }) {
  const [value, setValue] = useState("");
  const submit = () => { if (value.trim()) { onAdd(value); setValue(""); } };
  return (
    <div className="gxfavinput">
      <span className="gxlabel">{label}</span>
      <div className="gxrow" style={{ margin: 0 }}>
        <input
          className="gxin"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button className="gxbtn" onClick={submit} disabled={!value.trim()}>ADD ✓</button>
      </div>
    </div>
  );
}
