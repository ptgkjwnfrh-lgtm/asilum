"use client";
// Profile → WARDROBE tab (Feature C, Phase 3a). Pieces you actually own:
// manual adds here, catalog pieces marked owned, and "bought" ticket
// promotions from /orders. Private in this version — no sharing surface exists
// (owner decision #4 pending). The stylist builds looks around these.

import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch, postJSON, sendJSON, getUid } from "../../lib/client.js";
import { dominantPalette } from "../../lib/vision/palette.js";
import { PHOTO_MAX_BYTES } from "../../lib/wardrobe/photo-contract.js";

const CATEGORIES = ["", "outerwear", "tops", "knitwear", "tailoring", "bottoms", "footwear", "accessories", "dresses"];

// Client-side photo prep (Phase 3b): canvas re-encode to JPEG ≤1024px —
// EXIF/GPS metadata never leaves the browser — plus the same 48px palette-v0
// color walk the moodboard uses. No face or biometric analysis exists.
async function decodePhoto(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image could not be decoded"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encodeJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function prepPhoto(file) {
  const bmp = await decodePhoto(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const small = document.createElement("canvas");
  small.width = 48; small.height = 48;
  const smallContext = small.getContext("2d");
  if (!smallContext) throw new Error("canvas unavailable");
  smallContext.drawImage(bmp, 0, 0, 48, 48);
  if (bmp.close) bmp.close();
  const swatches = (dominantPalette(smallContext.getImageData(0, 0, 48, 48).data) || [])
    .map((s) => ({ hex: s.hex, weight: s.weight }));
  let blob = null;
  for (const quality of [0.85, 0.72, 0.6]) {
    blob = await encodeJpeg(canvas, quality);
    if (blob && blob.size <= PHOTO_MAX_BYTES) break;
  }
  if (!blob || blob.size > PHOTO_MAX_BYTES) throw new Error("photo could not fit the private-storage limit");
  return { blob, swatches };
}

/** The reader's own wardrobe: what they own, add and retire.
 *  Photos are PRIVATE — processed down to the storage limit on-device before
 *  upload, and never part of the public catalog. */
export function WardrobeTab() {
  const [items, setItems] = useState(null);
  const [showRetired, setShowRetired] = useState(false);
  const [form, setForm] = useState({ title: "", brand: "", category: "", sizeLabel: "" });
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [uploads, setUploads] = useState({ available: false });
  const [photoConsent, setPhotoConsent] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(null);
  const fileInputs = useRef({});

  const refresh = useCallback(async (includeRetired = showRetired) => {
    try {
      const res = await authorizedFetch(
        `/api/wardrobe?user=${encodeURIComponent(getUid() || "")}&status=${includeRetired ? "all" : "active"}`);
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || "wardrobe unavailable"); setItems([]); return; }
      setItems(data.items || []);
      setUploads(data.uploads || { available: false });
    } catch { setNotice("wardrobe unavailable"); setItems([]); }
  }, [showRetired]);
  useEffect(() => {
    refresh();
    const identityChanged = () => { setPendingDelete(null); setPhotoConsent(false); refresh(); };
    window.addEventListener("asilum:identity", identityChanged);
    return () => window.removeEventListener("asilum:identity", identityChanged);
  }, [refresh]);

  async function addManual(e) {
    e.preventDefault();
    if (!form.title.trim()) { setNotice("give the piece a name"); return; }
    const res = await postJSON("/api/wardrobe", {
      user: getUid(), source: "manual",
      title: form.title, brand: form.brand || undefined,
      category: form.category || undefined, sizeLabel: form.sizeLabel || undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setNotice(data.error || "could not add the piece"); return; }
    setForm({ title: "", brand: "", category: "", sizeLabel: "" });
    setNotice("added — the stylist can build looks around it now");
    refresh();
  }

  async function setStatus(piece, status) {
    const res = await sendJSON("PATCH", "/api/wardrobe", { user: getUid(), id: piece.id, status }).catch(() => null);
    if (res?.ok) refresh();
    else setNotice("could not update the piece");
  }
  async function remove(piece) {
    const res = await sendJSON("DELETE", "/api/wardrobe", { user: getUid(), id: piece.id }).catch(() => null);
    if (res?.ok) { setPendingDelete(null); setNotice("record removed"); refresh(); }
    else setNotice("could not remove the piece");
  }

  async function uploadPhoto(piece, file) {
    if (!file || !photoConsent || !uploads.available) return;
    setBusyPhoto(piece.id);
    setNotice("");
    try {
      const { blob, swatches } = await prepPhoto(file);
      if (!blob) throw new Error("could not encode the photo");
      const form = new FormData();
      form.set("user", getUid() || "");
      form.set("id", piece.id);
      form.set("consent", uploads.consentVersion);
      if (swatches.length) form.set("palette", JSON.stringify(swatches));
      form.set("photo", blob, "wardrobe.jpg");
      const res = await authorizedFetch("/api/wardrobe/photo", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || "photo upload failed"); return; }
      setPhotoConsent(false);
      setNotice(data.item.colorsSet
        ? "photo stored privately — its colors now describe the piece"
        : "photo stored privately");
      refresh();
    } catch {
      setNotice("photo upload failed");
    } finally { setBusyPhoto(null); }
  }

  async function removePhoto(piece) {
    setBusyPhoto(piece.id);
    try {
      const res = await sendJSON("DELETE", "/api/wardrobe/photo", { user: getUid(), id: piece.id }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok) { setNotice("photo erased"); refresh(); }
      else setNotice(data.error || "could not erase the photo");
    } finally {
      setBusyPhoto(null);
    }
  }

  const visible = (items || []).filter((piece) => showRetired || piece.status === "active");

  return (
    <div className="wtab">
      <div className="amemnote">
        Only what you tell us you own lives here — bag and favorites never do.
        Private in this version. Garment photos use private storage and can be
        erased independently or with the piece.
      </div>
      <form className="wadd" onSubmit={addManual}>
        <input aria-label="the piece"
          placeholder="the piece — e.g. black double-rider leather jacket"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={200}
        />
        <input aria-label="brand (optional)"
          placeholder="brand (optional)"
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
          maxLength={120}
          style={{ maxWidth: 160 }}
        />
        <select aria-label="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "category?"}</option>)}
        </select>
        <input aria-label="size"
          placeholder="size"
          value={form.sizeLabel}
          onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })}
          maxLength={40}
          style={{ maxWidth: 70 }}
        />
        <button className="btn" type="submit">I OWN THIS</button>
      </form>
      {uploads.available && (
        <label className="wconsent">
          <input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} />
          <span>
            I consent to storing garment photos in ASILUM's private storage
            (color statistics only — never face or biometric analysis; erased
            with the piece or my data). Version {uploads.consentVersion}.
          </span>
        </label>
      )}
      {notice && <div className="amemnote">{notice}</div>}
      {items === null && <div className="pempty">reading your wardrobe…</div>}
      {items !== null && visible.length === 0 && (
        <div className="pempty">
          nothing here yet — add a piece above, or report a purchase ticket as
          {" "}<b>bought</b> on ORDERS &amp; TICKETS and promote it.
        </div>
      )}
      {visible.map((piece) => (
        <div className="wrow" key={piece.id}>
          {piece.photoUrl ? <img className="wthumb" src={piece.photoUrl} alt={piece.title} /> : null}
          <div className="winfo">
            <div className="wttl">{piece.title}{piece.status === "retired" ? <em> · retired</em> : null}</div>
            <div className="wmeta">
              {[piece.brand, piece.category, piece.sizeLabel,
                piece.source === "ticket" ? "from a purchase" : piece.source === "catalog" ? "from the catalog" : "added by you",
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <a className="amemgo" href={`/stylist?anchor=wardrobe:${piece.id}`}>STYLE IT</a>
          {uploads.available ? (
            <>
              <input aria-label="upload a photo of this piece"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                ref={(el) => { fileInputs.current[piece.id] = el; }}
                onChange={(e) => { uploadPhoto(piece, e.target.files?.[0]); e.target.value = ""; }}
              />
              <button
                className="wact"
                disabled={!photoConsent || busyPhoto !== null}
                title={photoConsent ? "" : "tick the consent box first"}
                onClick={() => fileInputs.current[piece.id]?.click()}
              >
                {busyPhoto === piece.id ? "STORING…" : piece.photoPath ? "REPLACE PHOTO" : "ADD PHOTO"}
              </button>
            </>
          ) : null}
          {piece.photoPath ? (
            <button className="wact" disabled={busyPhoto !== null} onClick={() => removePhoto(piece)}>
              {busyPhoto === piece.id ? "ERASING…" : "ERASE PHOTO"}
            </button>
          ) : null}
          {piece.status === "active"
            ? <button className="wact" onClick={() => setStatus(piece, "retired")}>RETIRE</button>
            : <button className="wact" onClick={() => setStatus(piece, "active")}>RESTORE</button>}
          {pendingDelete === piece.id ? (
            <>
              <button className="wact" onClick={() => setPendingDelete(null)}>CANCEL</button>
              <button className="wact" onClick={() => remove(piece)}>CONFIRM REMOVE</button>
            </>
          ) : (
            <button className="wact" aria-label={`Remove ${piece.title}`} onClick={() => setPendingDelete(piece.id)}>REMOVE</button>
          )}
        </div>
      ))}
      <button className="wact wtoggle" onClick={() => { setShowRetired(!showRetired); refresh(!showRetired); }}>
        {showRetired ? "HIDE RETIRED" : "SHOW RETIRED"}
      </button>
    </div>
  );
}
