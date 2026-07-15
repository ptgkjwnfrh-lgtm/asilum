"use client";
// Profile → WARDROBE tab (Feature C, Phase 3a). Pieces you actually own:
// manual adds here, catalog pieces marked owned, and "bought" ticket
// promotions from /orders. Private, always — no sharing surface exists
// (owner decision #4 pending). The stylist builds looks around these.

import { useEffect, useState } from "react";
import { authorizedFetch, postJSON, sendJSON, getUid } from "../../lib/client.js";

const CATEGORIES = ["", "outerwear", "tops", "knitwear", "tailoring", "bottoms", "footwear", "accessories", "dresses"];

export function WardrobeTab() {
  const [items, setItems] = useState(null);
  const [showRetired, setShowRetired] = useState(false);
  const [form, setForm] = useState({ title: "", brand: "", category: "", sizeLabel: "" });
  const [notice, setNotice] = useState("");

  async function refresh(includeRetired = showRetired) {
    try {
      const res = await authorizedFetch(
        `/api/wardrobe?user=${encodeURIComponent(getUid() || "")}&status=${includeRetired ? "all" : "active"}`);
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || "wardrobe unavailable"); setItems([]); return; }
      setItems(data.items || []);
    } catch { setItems([]); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
    const res = await sendJSON("PATCH", "/api/wardrobe", { user: getUid(), id: piece.id, status });
    if (res.ok) refresh();
  }
  async function remove(piece) {
    const res = await sendJSON("DELETE", "/api/wardrobe", { user: getUid(), id: piece.id });
    if (res.ok) { setNotice("record removed"); refresh(); }
  }

  const visible = (items || []).filter((piece) => showRetired || piece.status === "active");

  return (
    <div className="wtab">
      <div className="amemnote">
        Only what you tell us you own lives here — bag and favorites never do.
        Private, always. Photo uploads arrive with private storage in a later phase.
      </div>
      <form className="wadd" onSubmit={addManual}>
        <input
          placeholder="the piece — e.g. black double-rider leather jacket"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={200}
        />
        <input
          placeholder="brand (optional)"
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
          maxLength={120}
          style={{ maxWidth: 160 }}
        />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "category?"}</option>)}
        </select>
        <input
          placeholder="size"
          value={form.sizeLabel}
          onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })}
          maxLength={40}
          style={{ maxWidth: 70 }}
        />
        <button className="btn" type="submit">I OWN THIS</button>
      </form>
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
          <div className="winfo">
            <div className="wttl">{piece.title}{piece.status === "retired" ? <em> · retired</em> : null}</div>
            <div className="wmeta">
              {[piece.brand, piece.category, piece.sizeLabel,
                piece.source === "ticket" ? "from a purchase" : piece.source === "catalog" ? "from the catalog" : "added by you",
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <a className="amemgo" href={`/stylist?anchor=wardrobe:${piece.id}`}>STYLE IT</a>
          {piece.status === "active"
            ? <button className="wact" onClick={() => setStatus(piece, "retired")}>RETIRE</button>
            : <button className="wact" onClick={() => setStatus(piece, "active")}>RESTORE</button>}
          <button className="wact" onClick={() => remove(piece)}>×</button>
        </div>
      ))}
      <button className="wact wtoggle" onClick={() => { setShowRetired(!showRetired); refresh(!showRetired); }}>
        {showRetired ? "HIDE RETIRED" : "SHOW RETIRED"}
      </button>
    </div>
  );
}
