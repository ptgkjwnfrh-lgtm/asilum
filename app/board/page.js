"use client";

// app/board/page.js
// Moodboard viewer/manager. Your own boards: rename, remove pieces, create
// new boards, copy the share link. Opened with ?id=<boardId> it shows anyone's
// board read-only with FOLLOW (a standing influence on your feed) and an
// "explore this taste" hand-off.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Notice from "../components/Notice.jsx";
import { getUid, postJSON, sendJSON, authorizedFetch, thumbFor, safeExternalUrl } from "../../lib/client.js";
import { analyzePalette, mergePalettes } from "../../lib/vision/palette.js";
import { vizState } from "../../lib/brain/memory.js";
import PassportSecurity from "../components/PassportSecurity.jsx";
import { getProfileInfo } from "../../lib/social.js";
import { tasteClass } from "../../lib/brain/taste-class.js";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";

export default function BoardPage() {
  const fit = useFitBrain();
  const [uid, setUid] = useState(null);
  const [boards, setBoards] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [shared, setShared] = useState(null); // read-only board from ?id=
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState("");
  const [following, setFollowing] = useState(false);
  const [trainText, setTrainText] = useState("");
  const [viz, setViz] = useState(null);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const [ppPhoto, setPpPhoto] = useState(null);
  const [pinfo, setPinfo] = useState({ name: "", handle: "", since: "", origin: "" });
  const [ticketCount, setTicketCount] = useState(0);
  const router = useRouter();
  const warpRef = useRef(null);

  // UPLOAD TO MOODBOARD: the hologram lifts out of the document and
  // grows to fill the page — the clone starts as an exact overlay of the
  // document's own map (same box, same scale), then the frame expands to
  // the viewport while a veil fades in, landing pixel-identical to
  // /upload's background (map at 0.5 under the same gradient).
  function warpToUpload() {
    const doc = document.querySelector(".ppdoc");
    const svg = document.querySelector(".ppholo-b svg");
    const overlay = warpRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc || !svg || !overlay || reduced) { router.push("/upload"); return; }
    const r = doc.getBoundingClientRect();
    overlay.innerHTML = "";
    const base = document.createElement("div");
    base.className = "ppwarpbase";
    const inner = document.createElement("div");
    inner.className = "ppwarpin";
    inner.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;`;
    inner.appendChild(svg.cloneNode(true));
    const grad = document.createElement("div");
    grad.className = "ppwarpgrad";
    overlay.appendChild(base);
    overlay.appendChild(inner);
    overlay.appendChild(grad);
    overlay.style.display = "block";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add("on"));
    });
    setTimeout(() => router.push("/upload"), 1000);
  }

  useEffect(() => {
    try { setPpPhoto(window.localStorage.getItem("asilum-pp-photo") || null); } catch {}
    // Passport data page: username from the bearer's own profile, MEMBER
    // SINCE stamped once on first passport view (device-real, never faked),
    // COUNTRY OF ORIGIN from the device locale region.
    try {
      const info = getProfileInfo();
      let since = window.localStorage.getItem("asilum-member-since");
      if (!since) {
        const now = new Date();
        since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        window.localStorage.setItem("asilum-member-since", since);
      }
      const locale = navigator.language || "";
      const region = (locale.split("-")[1] || "").toUpperCase();
      setPinfo({ name: info.name, handle: info.handle, since, origin: region || "—",
        area: new Date().getTimezoneOffset() });
    } catch {}
    // B-count on the machine zone: real purchase tickets raised in the app.
    authorizedFetch("/api/tickets?user=" + encodeURIComponent(getUid() || ""))
      .then((r) => r.json())
      .then((d) => setTicketCount(Array.isArray(d.tickets) ? d.tickets.length : 0))
      .catch(() => {});
  }, []);

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

  function convictions() {
    if (!viz) return [];
    return Object.entries(viz.state.weights)
      .filter(([, w]) => Math.abs(w) > 0.01)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);
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

  // Bearer photo: device-local only (localStorage), like the profile banner.
  function onPassportPhoto(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      setPpPhoto(rd.result);
      try { window.localStorage.setItem("asilum-pp-photo", rd.result); } catch {}
    };
    rd.readAsDataURL(f);
    e.target.value = "";
  }

  // Data page — every field is real state, U.S.-data-page labelling:
  // the username comes from the profile the bearer wrote, MEMBER SINCE is
  // stamped once on this device's first passport view, COUNTRY OF ORIGIN is
  // the device locale region, SEX is X until the product ever collects one
  // (it doesn't today — never invent it), and the machine zone encodes the
  // bearer's REAL database account number (the uid) in the document-number
  // and personal-number fields, TD3-style.
  const mrzId = (uid || "UNISSUED").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const mrzName = (pinfo.name || "UNNAMED READER").replace(/[^a-z0-9 ]/gi, "")
    .trim().toUpperCase().replace(/ +/g, "<");
  // Date-only strings parse as UTC midnight — anchor to local time so the
  // stamped day never shifts back a day in western timezones.
  const sinceDate = pinfo.since ? new Date(pinfo.since + "T00:00:00") : null;
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const sinceDisplay = sinceDate
    ? `${String(sinceDate.getDate()).padStart(2, "0")} ${MONTHS[sinceDate.getMonth()]} ${sinceDate.getFullYear()}`
    : "—";
  const sinceMrz = sinceDate
    ? `${String(sinceDate.getFullYear()).slice(2)}${String(sinceDate.getMonth() + 1).padStart(2, "0")}${String(sinceDate.getDate()).padStart(2, "0")}`
    : "000000";
  // Machine-zone counters, all real: P = pins linked (items across the
  // bearer's boards), B = purchases raised through the app (tickets),
  // A = the device's area code in time (UTC offset, minutes).
  const pinCount = boards.reduce((s, b) => s + ((b.items && b.items.length) || 0), 0);
  const pad3 = (n) => String(Math.min(999, Math.abs(n))).padStart(3, "0");
  const areaCode = pinfo.area || 0;
  const mrzTop = ("P<ASM" + mrzName + "<<FASHION<MEMBER").padEnd(52, "<").slice(0, 52);
  const mrzBot = (mrzId.slice(0, 9).padEnd(9, "<") + "0ASM" + sinceMrz + "0X<" +
    "P" + pad3(pinCount) + "B" + pad3(ticketCount) + "A" + pad3(areaCode) + "<<" +
    mrzId.slice(9, 21)).padEnd(52, "<").slice(0, 52);
  // UV tinting: data runs glow green, chevron filler reads as the red thread.
  const mrzTint = (line) => line.split(/(<+)/).map((seg, i) =>
    seg.startsWith("<") ? <i key={i}>{seg}</i> : seg && <b key={i}>{seg}</b>);

  return (
    <div className="wrap">
      <div className="ppwarp" ref={warpRef} aria-hidden="true" />
      <h1 className="headline"><span className="red">*</span>YOUR PASSPORT</h1>
      <p className="deck">
        {shared
          ? "someone's taste passport. follow it and its route joins your own."
          : "your moodboard is your Passport: every save, word, and image teaches Asterisk where to take you."}
      </p>
      <hr className="rule" />

      {!shared && (
        <div className="ppdoc" aria-label="passport document">
          <div className="ppsec"><span className="ppnum">№ AS·{String(boards.length).padStart(2, "0")}·{String(convictions().length).padStart(2, "0")}</span></div>
          <div className="ppnation">ASILUM MAGAZINE <b>*</b> FASHION PASSPORT</div>
          <div className="ppbody">
            <div className="ppphotocol">
              <span className="ppquad">
                <b>PASSPORT</b>
                <span>パスポート</span>
                <span>REISEPASS</span>
                <span>PASSEPORT</span>
              </span>
              <button
                className="ppphoto"
                title="add a bearer photo (stays on this device)"
                onClick={() => photoRef.current && photoRef.current.click()}
              >
                {ppPhoto
                  ? <img src={ppPhoto} alt="bearer" />
                  : <span className="ppphotoempty">◉<em>⇪ ADD PHOTO</em></span>}
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPassportPhoto} />
            <dl className="ppid">
              <div><dt>TYPE<em>/ Type</em></dt><dd>P</dd></div>
              <div><dt>CODE<em>/ Code</em></dt><dd>ASM</dd></div>
              <div><dt>ACCOUNT NO<em>/ № de compte</em></dt><dd className="ppmono">{uid || "—"}</dd></div>
              <div className="sp3"><dt>USERNAME<em>/ Nom</em></dt><dd>{(pinfo.name || "UNNAMED READER").toUpperCase()} <span className="ppmono">{pinfo.handle}</span></dd></div>
              <div className="sp3"><dt>CLASS<em>/ Classe</em></dt><dd>{uid && uid.startsWith("sb-") ? "AUTHENTICATED ACCOUNT" : "DEVICE IDENT"}</dd></div>
              <div><dt>MEMBER SINCE<em>/ Membre depuis</em></dt><dd>{sinceDisplay}</dd></div>
              <div><dt>SEX<em>/ Sexe</em></dt><dd>X</dd></div>
              <div><dt>COUNTRY OF ORIGIN<em>/ Pays</em></dt><dd>{pinfo.origin}</dd></div>
              <div><dt>TASTE CLASS<em>/ Classe de goût</em></dt><dd><span className="red">*</span> {tasteClass(convictions())}</dd></div>
              <div className="sp2"><dt>AUTHORITY<em>/ Autorité</em></dt><dd><span className="red">*</span>ASTERISK — FASHION INTELLIGENCE OS</dd></div>
              <div><dt>BOARDS</dt><dd>{boards.length}</dd></div>
              <div className="sp2"><dt>CONVICTIONS</dt><dd>{convictions().length} ACTIVE</dd></div>
            </dl>
          </div>
          <div className="ppmrz">{mrzTint(mrzTop)}<br />{mrzTint(mrzBot)}</div>
          <PassportSecurity
            topTag={convictions()[0]?.[0]}
            topWeight={convictions()[0]?.[1] || 0}
          />
          <button className="ppupload" onClick={warpToUpload}>
            ⇪ UPLOAD TO MOODBOARD →
          </button>
        </div>
      )}

      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      {!shared && (
        <>
          <h3 className="statshead">STAMP THE PASSPORT</h3>
          <div className="controls">
            <input
              type="text"
              placeholder="words, moods, colors, cities, fabrics, music, brands — berlin, leather, quiet, rick owens, goretex…"
              value={trainText}
              onChange={(e) => setTrainText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && train()}
            />
            <button className="btn" onClick={train}>ADD TO PASSPORT</button>
            <button className="btn ghost soon" onClick={connectPinterest}>CONNECT PINTEREST</button>
            <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>
              UPLOAD IMAGES
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onUpload} />
          </div>
          <p className="deck" style={{ marginTop: 4 }}>clothing or anything that&apos;s your vibe.</p>
          <div className="gxplugs" aria-label="future imports">
            {["PINTEREST", "SPOTIFY", "APPLE MUSIC", "LETTERBOXD"].map((n, i) => (
              <button key={n} className={"gxplug p" + (i + 1) + " soon"} style={{ animationDelay: `${i * 0.7}s` }}
                onClick={() => setNotice(`${n.toLowerCase()} import needs real OAuth — coming soon, never simulated`)}>
                ✳ {n}
              </button>
            ))}
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
                    <ColorEvidenceLine item={it} />
                    <ProductFitLine item={it} fit={fit} />
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

    </div>
  );
}
