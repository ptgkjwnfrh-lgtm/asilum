"use client";

// app/upload/page.js — UPLOAD // TEACH ASTERISK (redesign/upload-station).
// The passport's training annex: the warp expands the Paris hologram out
// of the document, and this page KEEPS that map as its background — one
// continuous surface. ASTERISK's living form sits in the side rail,
// watching; the three feed channels run down the main column so the path
// is obvious: 01 drop, 02 say, 03 tap — the readback answers instantly.
//
// Design: Gen X Soft Club (design law: "curves, haze, milky glass —
// atmosphere over nostalgia"). Everything trains the REAL brain through
// the same endpoints the moodboard station uses; nothing is simulated.

import { useEffect, useRef, useState } from "react";
import { getUid, postJSON, authorizedFetch } from "../../lib/client.js";
import { analyzePalette, mergePalettes } from "../../lib/vision/palette.js";
import { vizState } from "../../lib/brain/memory.js";
import { TAGS } from "../../lib/brain/tags.js";
import AsteriskDock from "../components/AsteriskDock.jsx";
import ParisMap, { useParisRoads } from "../components/ParisMap.jsx";
import Notice from "../components/Notice.jsx";

const DOCK_WORDS = ["LISTENING", "LEARNING", "READING", "WEIGHING", "REMEMBERING"];

export default function UploadPage() {
  const [uid, setUid] = useState("");
  const [viz, setViz] = useState(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState([]); // this session's transmissions
  const fileRef = useRef(null);
  const map = useParisRoads();

  useEffect(() => {
    const user = getUid();
    setUid(user || "");
    if (user) loadViz(user);
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
  function hear(line) {
    setHeard((h) => [line, ...h].slice(0, 5));
  }

  // ---- words ----
  async function trainWords() {
    const prompt = text.trim();
    if (!prompt || !uid) return;
    await postJSON("/api/train", { user: uid, prompt }).catch(() => {});
    postJSON("/api/moodboard", { user: uid, kind: "text", prompt }).catch(() => {});
    hear(`“${prompt.slice(0, 60)}”`);
    setNotice("asterisk read it — convictions updated");
    setText("");
    loadViz();
  }

  // ---- instinct taps (the ten canonical aesthetics — real training) ----
  async function trainTag(tag) {
    if (!uid) return;
    const word = tag.toLowerCase();
    await postJSON("/api/train", { user: uid, prompt: word }).catch(() => {});
    hear(word);
    setNotice(`leaned into ${word}`);
    loadViz();
  }

  // ---- images: palette v0 + filename words (same pipeline as the board) ----
  async function pixelsFrom(file) {
    const bmp = await createImageBitmap(file);
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, size, size);
    if (bmp.close) bmp.close();
    return ctx.getImageData(0, 0, size, size).data;
  }
  async function ingestFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => /^image\//.test(f.type || ""));
    if (!files.length || !uid || busy) return;
    setBusy(true);
    const words = files.map((f) => f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ")).join(" ");
    const analyses = [];
    for (const f of files.slice(0, 6)) {
      try { const a = analyzePalette(await pixelsFrom(f)); if (a) analyses.push(a); } catch {}
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
    const seen = [...new Set(merged.palette.map((s) => s.name))].slice(0, 3).join(", ");
    hear(`${files.length} image${files.length > 1 ? "s" : ""}${seen ? " — " + seen : ""}`);
    setNotice(analyses.length
      ? `palette v0 saw ${seen} — trained on colors + filename words`
      : "pixels unreadable — trained on the words the files carried");
    setBusy(false);
    loadViz();
  }

  return (
    <div className="wrap gx">
      {/* the warped map settles here — the page's background surface */}
      {map && (
        <div className="gxmap" aria-hidden="true"><ParisMap map={map} hot /></div>
      )}
      <div className="gxblob gxb1" aria-hidden="true" />
      <div className="gxblob gxb2" aria-hidden="true" />

      <header className="gxhero">
        <h1 className="headline"><span className="red">*</span>UPLOAD</h1>
        <p className="deck">three ways in — drop it, say it, or tap it. asterisk answers on the right.</p>
      </header>
      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      <div className="gxlayout">
        <main className="gxmain">
          <section className="gxcard">
            <div className="gxlabel">01 · IMAGES — DROP THE MOOD</div>
            <div
              className={"gxdrop" + (dragOver ? " over" : "") + (busy ? " busy" : "")}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); ingestFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current && fileRef.current.click()}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
            >
              <span className="gxdropmark">⇪</span>
              <b>{busy ? "reading the pixels…" : "drop images, or tap to choose"}</b>
              <em>palette v0 reads the colors; filename words teach too. full vision comes later — nothing is pretended.</em>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { ingestFiles(e.target.files); e.target.value = ""; }} />
          </section>

          <section className="gxcard">
            <div className="gxlabel">02 · WORDS — SAY IT PLAIN</div>
            <textarea
              className="gxtext"
              rows={3}
              placeholder="silver hardware, washed black, clothes that look found not bought…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) trainWords(); }}
            />
            <div className="gxrow">
              <button className="gxbtn" onClick={trainWords} disabled={!text.trim()}>TRANSMIT ✓</button>
              <span className="gxhint">⌘↵ sends</span>
            </div>
          </section>

          <section className="gxcard">
            <div className="gxlabel">03 · INSTINCTS — TAP WHAT PULLS YOU</div>
            <div className="gxchips">
              {TAGS.map((t) => (
                <button key={t} className="gxchip" onClick={() => trainTag(t)}>{t.toLowerCase()}</button>
              ))}
            </div>
            <em className="gxfoot">each tap is a real training signal — repeat taps lean harder.</em>
          </section>
        </main>

        {/* ASTERISK lives here: the engine watches, the record answers */}
        <aside className="gxside">
          <section className="gxcard gxasterisk">
            <AsteriskDock words={DOCK_WORDS} className="os-dock gxdock" />
            <div className="gxlabel" style={{ margin: "14px 0" }}>WHAT ASTERISK HOLDS</div>
            {convictions().length === 0 ? (
              <em className="gxfoot">nothing yet — the record starts with your first upload.</em>
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
            <div className="gxrow gxlinks">
              <a className="gxbtn ghost" href="/board">PASSPORT →</a>
              <a className="gxbtn ghost" href="/stats">FULL READ →</a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
