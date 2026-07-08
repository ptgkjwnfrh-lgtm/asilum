"use client";

// app/orders/page.js — ORDERS & TICKETS.
// ASILUM purchase history plus purchases imported from connected partner
// sites, each with its ticket: tracking number, carrier, fulfillment status,
// and ETA. Carrier data is mocked deterministically until the partner
// fulfillment APIs are wired.

import { useEffect, useState } from "react";
import { getUid, thumbFor } from "../../lib/client.js";
import { sourceFor, trackingFor } from "../../lib/social.js";

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    fetch("/api/orders?user=" + encodeURIComponent(getUid() || "guest"))
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>ORDERS & TICKETS</h1>
      <p className="deck">
        everything you bagged — here and from connected accounts. every order
        carries a ticket.
      </p>
      <hr className="rule" />

      {!orders && <div className="empty">pulling tickets…</div>}
      {orders && orders.length === 0 && (
        <div className="empty">no tickets yet — the feed is waiting.</div>
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
                ticket <b>{t.ticket}</b> · {t.carrier} · <b className={t.status === "delivered" ? "" : "red"}>{t.status}</b>
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
