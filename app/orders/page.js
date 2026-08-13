"use client";

// app/orders/page.js — ORDERS & TICKETS.
// PURCHASE TICKETS are real database records from the third-party purchase
// assistant (/api/tickets): the source platform fulfills, ships, and tracks —
// ASILUM never does. Below them, the bag history deck is explicitly intent,
// never represented as an order, shipment, or completed purchase.

import { useEffect, useState } from "react";
import Notice from "../components/Notice.jsx";
import { getUid, authorizedFetch, thumbFor, sendJSON, postJSON } from "../../lib/client.js";
import { sourceFor } from "../../lib/social.js";

export default function OrdersPage() {
  const [bagHistory, setBagHistory] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const user = encodeURIComponent(getUid() || "guest");
    authorizedFetch("/api/orders?user=" + user)
      .then((r) => r.json())
      .then((d) => setBagHistory(d.bagHistory || []))
      .catch(() => setBagHistory([]));
    authorizedFetch("/api/tickets?user=" + user)
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .catch(() => setTickets([]));
  }, []);

  async function addToWardrobe(ticket) {
    const response = await postJSON("/api/wardrobe", {
      user: getUid(), source: "ticket", ticketId: ticket.id,
    }).catch(() => null);
    if (!response) { setNotice("could not add to wardrobe"); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotice(data.error || "could not add to wardrobe"); return; }
    setNotice(data.duplicate
      ? "already in your wardrobe — the stylist can style it from /stylist"
      : `added to your wardrobe — the stylist can now build looks around it`);
  }

  async function reportOutcome(ticket, outcome) {
    const response = await sendJSON("PATCH", "/api/tickets", {
      user: getUid(), id: ticket.id, action: "outcome", outcome,
    }).catch(() => null);
    if (!response) { setNotice("outcome could not be saved"); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ticket) { setNotice(data.error || "outcome could not be saved"); return; }
    setTickets((current) => current.map((item) => item.id === ticket.id ? data.ticket : item));
    setNotice(`reported ${outcome} — this improves future recommendations`);
  }

  return (
    <div className="wrap">
      <div className="locline"><a href="/profile">← PROFILE</a><span>/ ORDERS &amp; TICKETS</span></div>
      <h1 className="headline"><span className="red">*</span>ORDERS & TICKETS</h1>
      <p className="deck">
        purchase tickets are handled with the original marketplace — they
        confirm, ship, track, and take returns. bag history rides below.
      </p>
      <hr className="rule" />
      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      <h3 className="statshead">PURCHASE TICKETS</h3>
      {!tickets && <div className="empty">pulling tickets…</div>}
      {tickets && tickets.length === 0 && (
        <div className="empty">no purchase tickets yet — hit BUY on any piece to open one.</div>
      )}
      {tickets && tickets.map((t, i) => (
        <div className="hlrow static" key={"t" + t.id}>
          <div className="hlnum">{String(i + 1).padStart(2, "0")}</div>
          <div className="hlinfo">
            <a href={"/?item=" + encodeURIComponent(t.productId)}><div className="hlttl">ticket #{t.id} — {t.productId}</div></a>
            <div className="hlbrand">
              via {t.sourceName || "source"} · {new Date(t.createdAt).toLocaleDateString()}
              {t.consented ? " · consent on file" : ""}
            </div>
            <div className="ticketline">
              <b className={["completed", "checkout_completed_on_source"].includes(t.status) ? "" : "red"}>
                {t.status.replaceAll("_", " ")}
              </b>
              {" · "}{t.availabilityStatus}
              {t.currentPriceChecked != null ? <> · checked USD {t.currentPriceChecked}</> : null}
              {t.userReportedOutcome ? <> · you reported <b>{t.userReportedOutcome}</b></> : null}
            </div>
            {["checkout_started", "checkout_completed_on_source", "completed"].includes(t.status) && (
              <div className="outcomes" aria-label="Tell Asilum what happened after checkout">
                {["bought", "kept", "returned", "not-bought"].map((outcome) => (
                  <button
                    key={outcome}
                    className={t.userReportedOutcome === outcome ? "on" : ""}
                    onClick={() => reportOutcome(t, outcome)}
                  >{outcome}</button>
                ))}
              </div>
            )}
            {t.userReportedOutcome === "bought" && (
              <button className="btn ghost wbtn" onClick={() => addToWardrobe(t)}>
                <b className="red">*</b> ADD TO WARDROBE
              </button>
            )}
          </div>
          <div className="hlstat">
            {t.itemPriceAtRequest != null ? `USD ${t.itemPriceAtRequest}` : "—"}
          </div>
        </div>
      ))}

      <hr className="rule" />
      <h3 className="statshead">BAG HISTORY</h3>
      {!bagHistory && <div className="empty">pulling the bag…</div>}
      {bagHistory && bagHistory.length === 0 && (
        <div className="empty">nothing bagged yet — the feed is waiting.</div>
      )}

      {bagHistory && bagHistory.map((o, i) => (
          <a className="hlrow" key={o.id + ":" + i} href={"/?item=" + encodeURIComponent(o.id)}>
            <div className="hlnum">{String(i + 1).padStart(2, "0")}</div>
            <img src={o.img || thumbFor(o)} alt="" />
            <div className="hlinfo">
              <div className="hlttl">{o.title}</div>
              <div className="hlbrand">
                {o.brand} — {sourceFor(o)}
                {o.at ? " — " + new Date(o.at).toLocaleDateString() : ""}
              </div>
              <div className="ticketline">added to bag · not purchased or shipped</div>
            </div>
            <div className="hlstat">{o.price ? `${o.currency || "USD"} ${o.price}` : "—"}</div>
          </a>
      ))}
    </div>
  );
}
