"use client";

// app/board/page.js
// Moodboard viewer/manager. Your own boards: rename, remove pieces, create
// new boards, copy the share link. Opened with ?id=<boardId> it shows anyone's
// board read-only with FOLLOW (a standing influence on your feed) and an
// "explore this taste" hand-off.

import { useEffect, useRef, useState } from "react";
import { getUid, postJSON, sendJSON, authorizedFetch, thumbFor, brainEnabled, setBrainEnabled, safeExternalUrl } from "../../lib/client.js";
import { analyzePalette, mergePalettes } from "../../lib/vision/palette.js";
import { vizState } from "../../lib/brain/memory.js";
import BrainViz from "../components/BrainViz.jsx";

export default function BoardPage() {
  const [uid, setUid] = useState(null);
  const [boards, setBoards] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [shared, setShared] = useState(null); // read-only board from ?id=
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState("");
  const [following, setFollowing] = useState(false);
  const [trainText, setTrainText] = useState("");
  const [brainOn, setBrainOn] = useState(true);
  const [viz, setViz] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetChecked, setResetChecked] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const user = getUid();
    setUid(user);
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("id");
    if (id) {
      authorizedFetch("/api/boards?id=" + encodeURIComponent(id) + "&viewer=" + encodeURIComponent(user))
        .then((r) => r.json())
        .then((d) => {
          if (d.board && !d.owned) { setShared(d.board); return; }
          loadMine(user, d.board ? d.board.id : null);
        })
        .catch(() => loadMine(user));
    } else {
      loadMine(user);
    }
  }, []);

  function loadMine(user, focusId = null) {
    authorizedFetch("/api/boards?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .then((d) => {
        const bs = d.boards || [];
        setBoards(bs);
        setActiveId(focusId || (bs[0] && bs[0].id) || null);
      })
      .catch(() => {});
  }

  const active = boards.find((b) => b.id === activeId) || null;

  async function removeItem(itemId) {
    if (!active) return;
    const res = await sendJSON("DELETE", "/api/boards", {
      user: uid, boardId: active.id, itemId,
    });
    const d = await res.json();
    if (d.board) setBoards((prev) => prev.map((b) => (b.id === d.board.id ? d.board : b)));
  }

  async function rename(name) {
    if (!active || !name.trim()) return;
    const res = await sendJSON("PATCH", "/api/boards", {
      user: uid, boardId: active.id, name: name.trim(),
    });
    const d = await res.json();
    if (d.board) setBoards((prev) => prev.map((b) => (b.id === d.board.id ? d.board : b)));
  }

  async function createNew() {
    const name = newName.trim() || "moodboard";
    const res = await postJSON("/api/boards", { user: uid, name });
    const d = await res.json();
    if (d.board) {
      setBoards((prev) => [...prev, d.board]);
      setActiveId(d.board.id);
      setNewName("");
    }
  }

  async function copyShare(board) {
    const url = window.location.origin + "/?board=" + encodeURIComponent(board.id);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("share link copied — it seeds the feed of whoever opens it");
    } catch {}
  }

  // ---- The training station ----
  function loadViz(user = uid || getUid()) {
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => r.json())
      .then((d) => setViz({ state: vizState(d.profile), profile: d.profile }))
      .catch(() => {});
  }
  useEffect(() => { if (uid) loadViz(uid); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBrainOn(brainEnabled()); }, []);

  async function train() {
    if (!trainText.trim()) return;
    await postJSON("/api/train", { user: uid, prompt: trainText.trim() }).catch(() => {});
    // Manual tag entry becomes a real mood_board_uploads record (analyzed_by: manual).
    postJSON("/api/moodboard", { user: uid, kind: "text", prompt: trainText.trim() }).catch(() => {});
    setNotice(`the brain read “${trainText.trim()}” — convictions updated`);
    setTrainText("");
    loadViz();
  }

  async function connectPinterest() {
    const res = await postJSON("/api/connect", { user: uid, platform: "pinterest" }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setNotice((d && d.message) || "pinterest import is coming soon — it requires real OAuth setup");
  }

  // Downsampled pixels for palette v0 — 48px is plenty for color statistics.
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

  async function onUpload(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    const words = files.map((f) => f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ")).join(" ");
    // Palette v0: the brain's first real look at the pixels — dominant colors,
    // brightness, mood. Colors only; object/texture recognition still needs a
    // vision model. Files that fail to decode fall back to filename words.
    const analyses = [];
    for (const f of files.slice(0, 6)) {
      try { const a = analyzePalette(await pixelsFrom(f)); if (a) analyses.push(a); } catch {}
    }
    const merged = mergePalettes(analyses);
    const paletteWords = [...new Set(analyses.flatMap((a) => [...a.words, ...a.moods]))].slice(0, 14);
    const prompt = [words, paletteWords.join(" ")].filter(Boolean).join(" ").trim();
    if (prompt) await postJSON("/api/train", { user: uid, prompt }).catch(() => {});
    // Real database record per upload batch — analyzed_by "palette-v0" when
    // pixels were read, "filename" when they couldn't be. Only raw hex+weight
    // swatches cross the wire; the server derives names and tag weights
    // itself (client-supplied labels are never trusted). uploadId makes
    // retries idempotent: a lost response can't double-record the batch.
    postJSON("/api/moodboard", {
      user: uid, kind: "upload",
      filenames: files.map((f) => f.name.slice(0, 200)),
      palette: merged.palette.map((s) => ({ hex: s.hex, weight: s.weight })),
      uploadId: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10),
    }).catch(() => {});
    const seen = [...new Set(merged.palette.map((s) => s.name))].slice(0, 3).join(", ");
    setNotice(analyses.length
      ? `${files.length} image${files.length > 1 ? "s" : ""} read — palette v0 saw ${seen}; trained on colors + filename words`
      : `${files.length} image${files.length > 1 ? "s" : ""} queued — pixels unreadable, trained on the words they carried`);
    e.target.value = "";
    loadViz();
  }

  async function resetBrain() {
    await postJSON("/api/reset", { user: uid }).catch(() => {});
    setResetOpen(false);
    setResetChecked(false);
    setNotice("recommendation model reset — boards, event history, tickets, and aggregate graph signals remain");
    loadViz();
  }

  function convictions() {
    if (!viz) return [];
    return Object.entries(viz.state.weights)
      .filter(([, w]) => Math.abs(w) > 0.01)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);
  }
  function forgotten() {
    if (!viz || !viz.profile || !viz.profile._meta) return [];
    return (viz.profile._meta.forgotten || []).slice(0, 6);
  }

  async function toggleFollow(board) {
    const next = !following;
    setFollowing(next);
    try {
      await postJSON("/api/follow", { user: uid, boardId: board.id, follow: next });
      setNotice(next
        ? "following — this board now shapes your feed"
        : "unfollowed — its influence fades from your feed");
    } catch { setFollowing(!next); }
  }

  const view = shared || active;

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>MOODBOARD</h1>
      <p className="deck">
        {shared
          ? "someone's taste, pinned down. follow it and it shapes your feed."
          : "what you've saved — every save teaches the brain and builds the taste graph."}
      </p>
      <hr className="rule" />

      {notice && <div className="autonote" onClick={() => setNotice("")}>{notice}</div>}

      {!shared && (
        <>
          <h3 className="statshead">TRAIN THE BRAIN</h3>
          <div className="controls">
            <input
              type="text"
              placeholder="words, moods, colors, cities, fabrics, music, brands — berlin, leather, quiet, rick owens, goretex…"
              value={trainText}
              onChange={(e) => setTrainText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && train()}
            />
            <button className="btn" onClick={train}>TRAIN</button>
            <button className="btn ghost soon" onClick={connectPinterest}>CONNECT PINTEREST</button>
            <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>
              UPLOAD IMAGES
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onUpload} />
          </div>
          <p className="deck" style={{ marginTop: 4 }}>clothing or anything that&apos;s your vibe.</p>

          <div className="setrow">
            <div className="setinfo">
              <div className="setname">Use Mood Board Brain</div>
              <div className="uhandle" style={{ maxWidth: 520, whiteSpace: "normal" }}>
                on: search results lean slightly toward what this board has
                taught. off: search stays general — nothing personalized.
              </div>
            </div>
            <button
              className={"fitbtn" + (brainOn ? " active" : "")}
              onClick={() => { const on = !brainOn; setBrainEnabled(on); setBrainOn(on); setNotice(on ? "mood board brain on — search now leans your way" : "mood board brain off — search is general"); }}
            >
              {brainOn ? "ON" : "OFF"}
            </button>
          </div>

          <div className="brainband">
            <div className="brainbox">
              {viz ? <BrainViz {...viz.state} height={320} /> : <div className="empty">waking the brain…</div>}
            </div>
            <div className="convictions">
              <div className="modhead">TOP 10 CONVICTIONS</div>
              {convictions().length === 0 && (
                <div className="pempty">no convictions yet — train it with words, saves, or a connected account.</div>
              )}
              {convictions().map(([tag, w], i) => (
                <div className="convrow" key={tag}>
                  <span className="convn">{i + 1}.</span>
                  <span className="convtag">{tag.charAt(0) + tag.slice(1).toLowerCase()}</span>
                  <span className="convbar"><i style={{ width: Math.min(100, Math.abs(w) * 100) + "%" }} /></span>
                </div>
              ))}
              <div className="modhead" style={{ marginTop: 16 }}>RECENTLY FORGOTTEN</div>
              {forgotten().length === 0 ? (
                <div className="pempty">nothing forgotten yet — convictions fade after six idle days.</div>
              ) : (
                forgotten().map((f, i) => (
                  <div className="convrow faded" key={i}>
                    <span className="convtag">{f.tag.charAt(0) + f.tag.slice(1).toLowerCase()}</span>
                    <span className="convgone">let go</span>
                  </div>
                ))
              )}
              <button className="resetlink" onClick={() => setResetOpen(true)}>
                Reset Brain <b>[Full Amnesia]</b>
              </button>
            </div>
          </div>
          <hr className="rule" />
        </>
      )}

      {!shared && (
        <div className="controls">
          {boards.map((b) => (
            <button
              key={b.id}
              className={"fitbtn" + (b.id === activeId ? " active" : "")}
              onClick={() => setActiveId(b.id)}
            >
              {b.name} ({b.items.length})
            </button>
          ))}
          <input
            type="text"
            placeholder="new board name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createNew()}
            style={{ maxWidth: 200 }}
          />
          <button className="btn ghost" onClick={createNew}>+ board</button>
        </div>
      )}

      {view ? (
        <>
          <div className="controls">
            {!shared ? (
              <input
                type="text"
                key={view.id}
                defaultValue={view.name}
                onBlur={(e) => rename(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                style={{ maxWidth: 260 }}
                aria-label="board name"
              />
            ) : (
              <div style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase" }}>{view.name}</div>
            )}
            {shared ? (
              <button className={"btn" + (following ? "" : " ghost")} onClick={() => toggleFollow(view)}>
                {following ? "Following ✓" : "Follow this taste"}
              </button>
            ) : null}
            <button className="btn" onClick={() => copyShare(view)}>Copy share link</button>
            <a className="btn ghost" href={"/?board=" + encodeURIComponent(view.id)}>
              explore this taste →
            </a>
          </div>

          {view.items.length === 0 ? (
            <div className="empty">No pieces yet — save some from the feed.</div>
          ) : (
            <div className="grid">
              {view.items.map((it) => (
                <div className="card" key={it.id}>
                  <div className="imgwrap">
                    <img src={it.img || thumbFor(it)} alt={it.alt || it.title} loading="lazy" />
                  </div>
                  <div className="body">
                    <div className="ttl">{it.title}</div>
                    <div className="brand2">{it.brand}</div>
                    <div className="pricerow">
                      {it.price ? <span className="price">{it.currency || "USD"} {it.price}</span> : null}
                      {safeExternalUrl(it.url) ? (
                        <a className="buy" href={safeExternalUrl(it.url)} target="_blank" rel="noopener noreferrer">view ↗</a>
                      ) : null}
                    </div>
                    {!shared && (
                      <div className="actions">
                        <button onClick={() => removeItem(it.id)}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="empty">No boards yet — save a piece from the feed to start one.</div>
      )}

      {resetOpen && (
        <div className="overlay" onClick={() => { setResetOpen(false); setResetChecked(false); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2>Full amnesia<span style={{ color: "var(--red)" }}>.</span></h2>
            <p className="deck">
              this permanently deletes your taste profile — every conviction,
              streak, and forgetting log. your moodboards, orders, and the
              shared taste graph survive. there is no undo.
            </p>
            <label className="toggle" style={{ margin: "10px 0 18px" }}>
              <input
                type="checkbox"
                checked={resetChecked}
                onChange={(e) => setResetChecked(e.target.checked)}
              />
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
