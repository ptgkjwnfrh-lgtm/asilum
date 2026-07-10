"use client";

// app/orders/page.js — ORDERS & TICKETS.
// PURCHASE TICKETS are real database records from the third-party purchase
// assistant (/api/tickets): the source platform fulfills, ships, and tracks —
// ASILUM never does. Below them, the bag history deck; its carrier line stays
// deterministic simulation until partner fulfillment APIs exist (and says so).

import { useEffect, useState } from "react";
import { getUid, authorizedFetch, thumbFor } from "../../lib/client.js";
import { sourceFor, trackingFor } from "../../lib/social.js";

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);
  const [tickets, setTickets] = useState(null);

  useEffect(() => {
    const user = encodeURIComponent(getUid() || "guest");
    authorizedFetch("/api/orders?user=" + user)
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]));
    authorizedFetch("/api/tickets?user=" + user)
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .catch(() => setTickets([]));
  }, []);

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>ORDERS & TICKETS</h1>
      <p className="deck">
        purchase tickets are handled with the original marketplace — they
        confirm, ship, track, and take returns. bag history rides below.
      </p>
      <hr className="rule" />

      <h3 className="statshead">PURCHASE TICKETS</h3>
      {!tickets && <div className="empty">pulling tickets…</div>}
      {tickets && tickets.length === 0 && (
        <div className="empty">no purchase tickets yet — hit BUY on any piece to open one.</div>
      )}
      {tickets && tickets.map((t, i) => (
        <a className="hlrow" key={"t" + t.id} href={"/?item=" + encodeURIComponent(t.productId)}>
          <div className="hlnum">{String(i + 1).padStart(2, "0")}</div>
          <div className="hlinfo">
            <div className="hlttl">ticket #{t.id} — {t.productId}</div>
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
            </div>
          </div>
          <div className="hlstat">
            {t.itemPriceAtRequest != null ? `USD ${t.itemPriceAtRequest}` : "—"}
          </div>
        </a>
      ))}

      <hr className="rule" />
      <h3 className="statshead">BAG HISTORY</h3>
      {!orders && <div className="empty">pulling the bag…</div>}
      {orders && orders.length === 0 && (
        <div className="empty">nothing bagged yet — the feed is waiting.</div>
      )}

      {orders && orders.map((o, i) => {
        const t = trackingFor(o.id, o.at);
        return (
          <a className="hlrow" key={o.id + ":" + i} href={"/?item=" + encodeURIComponent(o.id)}>
            <div className="hlnum">{String(i + 1).padStart(2, "0")}</div>
            <img src={o.img || thumbFor(o)} alt="" />
            <div className="hlinfo">
              <div className="hlttl">{o.title}</div>
              <div className="hlbrand">
                {o.brand} — {sourceFor(o)}
                {o.at ? " — " + new Date(o.at).toLocaleDateString() : ""}
              </div>
              <div className="ticketline">
                ticket <b>{t.ticket}</b> · {t.carrier} (simulated) · <b className={t.status === "delivered" ? "" : "red"}>{t.status}</b>
                {t.status !== "delivered" ? <> · ETA {t.eta}</> : null}
              </div>
            </div>
            <div className="hlstat">{o.price ? `${o.currency || "USD"} ${o.price}` : "—"}</div>
          </a>
        );
      })}
    </div>
  );
}
