"use client";

// app/components/BagSheet.jsx — THE BAG, as a sheet (V.2 Blueprint, owner,
// 17 Oct 2026: the bag opens from the Info Dock, not from a header panel).
// The content is the shell's former bag panel, moved whole: what is in the
// bag, where each piece comes from, the honest line about checkout. Bag is
// intent only until native commerce lands (blueprint chapter 7): adding to
// the Bag reserves nothing, and checkout for sourced pieces belongs to the
// source sites.

import { useEffect, useState } from "react";
import { bagList, bagRemove, thumbFor } from "../../lib/client.js";
import { sourceFor } from "../../lib/social.js";
import Notice from "./Notice.jsx";
import { ColorEvidenceLine, OriginLine, ProductFitLine, useFitBrain } from "./ProductSignals.jsx";

export default function BagSheet() {
  const fit = useFitBrain();
  const [bag, setBag] = useState([]);
  const [how, setHow] = useState(false);
  useEffect(() => {
    const sync = () => setBag(bagList());
    sync();
    window.addEventListener("asilum:bag", sync);
    return () => window.removeEventListener("asilum:bag", sync);
  }, []);
  const subtotal = bag.reduce((s, x) => s + (x.price || 0), 0);
  const nSources = new Set(bag.map((x) => sourceFor(x))).size;

  return (
    <div className="bagsheet">
      {bag.length === 0 ? (
        <div className="pempty">
          Bag empty<br />
          <span style={{ fontSize: 12 }}>The brain notices what you carry.</span>
        </div>
      ) : (
        <>
          {bag.map((x) => (
            <div className="bagrow" key={x.id}>
              <img src={x.img || thumbFor(x)} alt="" />
              <div className="baginfo">
                <div className="bagttl">{x.title}</div>
                <div className="bagprice">{sourceFor(x)} · {x.currency || "USD"} {x.price}</div>
                <ColorEvidenceLine item={x} />
                <OriginLine item={x} />
                <ProductFitLine item={x} fit={fit} />
              </div>
              <button className="bagx" onClick={() => bagRemove(x.id)} aria-label={"remove " + (x.title || "piece")}>×</button>
            </div>
          ))}
          <div className="bagfees">
            <div><span>SUBTOTAL</span><b>USD {Math.round(subtotal)}</b></div>
            <div><span>SOURCES</span><b>{nSources}</b></div>
            <div className="bagfinal"><span>CHECKOUT</span><b>ON SOURCE SITES</b></div>
          </div>
          <button className="btn ghost wide" onClick={() => setHow((v) => !v)}>
            HOW PURCHASES WORK
          </button>
          {how && (
            <Notice onDismiss={() => setHow(false)}>
              ASILUM does not charge or ship. Open a piece to view its
              source or create a purchase request.
            </Notice>
          )}
        </>
      )}
      <a className="btn ghost wide" href="/orders" style={{ display: "block", textAlign: "center" }}>
        VIEW ORDERS & TICKETS →
      </a>
    </div>
  );
}
