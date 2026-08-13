"use client";

// app/hotlist/page.js — EDITORIAL.
// One page, a descending visibility ladder (owner order, Aug 12):
//   1. THE HOTLIST — loudest: the live person-deduped ranking. The
//      slots are held for designer accounts and stay VACANT until real
//      people move (owner order, Aug 13) — the caller's own feed never
//      stands in.
//   2. ASILUM MAGAZINE — the house's own dispatches from editorial_posts
//      (kind=asilum); honest empty state until the first one is written,
//      with the submissions intake still marked coming-soon.
//   3. AD SPACE — open placements, clearly labeled; sponsored placements
//      are always disclosed, and no fake advertiser ever fills a slot.
//   4. THE COMMUNITY FLOOR — real wire posts via fetchWire (server-read,
//      no fabricated engagement counters), videos honestly absent.
//   5. EXTERNAL DISPATCHES — quietest: publication links, titles only.

import { useEffect, useState } from "react";
import { thumbFor } from "../../lib/client.js";
import { STORIES, fetchWire, timeAgo } from "../../lib/social.js";
import { ColorEvidenceLine, ProductFitLine, useFitBrain } from "../components/ProductSignals.jsx";

export default function EditorialPage() {
  const fit = useFitBrain();
  const [rows, setRows] = useState(null);
  const [live, setLive] = useState(true);
  const [posts, setPosts] = useState(null);
  const [postsLive, setPostsLive] = useState(true);
  const [house, setHouse] = useState(null);
  const [houseLive, setHouseLive] = useState(true);

  useEffect(() => {
    fetchWire("user")
      .then((w) => { setPosts(w.posts); setPostsLive(w.live); })
      .catch(() => { setPosts([]); setPostsLive(false); });
    fetchWire("asilum")
      .then((w) => { setHouse(w.posts); setHouseLive(w.live); })
      .catch(() => { setHouse([]); setHouseLive(false); });
    fetch("/api/stats")
      .then((r) => r.json())
      .then(async (s) => {
        // A slot fills only when a real person moved (owner order,
        // Aug 13): impression-only entries stay vacant, and nothing
        // stands in for the missing rows.
        const moved = (s.topItems || []).filter((t) => (t.engagers ?? 0) > 0);
        setLive(moved.length > 0);
        setRows(moved.map((t) => ({
          id: t.id, title: t.title, brand: t.brand,
          // People, not events: the ranked quantity and the printed label
          // must agree, or the page keeps publishing a forgeable number.
          stat: (t.engagers ?? 0) + (t.engagers === 1 ? " PERSON" : " PEOPLE"), item: t.item || null,
        })));
      })
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="wrap elr">
      <h1 className="headline"><span className="red">*</span>EDITORIAL</h1>
      <p className="deck">the magazine layer — the hotlist first, then the house, the floor, and the outside world.</p>

      {/* ---- 1. THE HOTLIST — loudest ---- */}
      <section className="elhot" aria-label="the hotlist">
        <div className="elmast">THE HOTLIST</div>
        <p className="elnote">
          <span className="pulse" />
          {live
            ? "ranked live by what everyone is favoriting, bagging, and sharing."
            : "held for designer accounts — the ranking fills as real people favorite, bag, and share. nothing stands in."}
        </p>
        {!rows && <div className="empty">counting…</div>}
        {rows && rows.length === 0 && <div className="empty">the slots are open — no one has moved yet.</div>}
        {rows && rows.map((r, i) => (
          <a className="elrow" key={r.id} href={"/?item=" + encodeURIComponent(r.id)}>
            <div className="elnum" aria-hidden="true">{String(i + 1).padStart(2, "0")}</div>
            {r.item ? <img className="elthumb" src={r.item.img || thumbFor(r.item)} alt="" /> : null}
            <div className="elinfo">
              <div className="elttl">{r.title}</div>
              <div className="elbrand">{r.brand}</div>
              {r.item ? <ColorEvidenceLine item={r.item} /> : null}
              {r.item ? <ProductFitLine item={r.item} fit={fit} /> : null}
            </div>
            <div className="elstat">{r.stat}</div>
          </a>
        ))}
      </section>

      {/* ---- 2. ASILUM MAGAZINE — the house's own dispatches ---- */}
      <section className="elhouse" aria-label="asilum magazine">
        <div className="cvkick">ASILUM MAGAZINE</div>
        {house === null && <div className="empty">opening the house pages…</div>}
        {house && !houseLive && (
          <p className="elhousenote">the house pages could not be reached — try again in a moment.</p>
        )}
        {house && houseLive && house.length === 0 && (
          <p className="elhousenote">
            the first ASILUM dispatch is on the cutting table — the house
            writes here, under its own byline, when there is something worth
            saying.
          </p>
        )}
        {(house || []).map((p) => (
          <article className="elpiece" key={p.id}>
            <div className="elpiecettl">{p.title || p.text.slice(0, 80)}</div>
            <p className="elpiecesum">{p.excerpt || p.text}</p>
            <span className="elpiecedate">{timeAgo(p.at)}</span>
          </article>
        ))}
        <div className="elsubmit">
          <span className="adstar" aria-hidden="true">*</span>
          <span>EDITORIAL SUBMISSIONS — submission intake requires setup. <em>coming soon</em></span>
        </div>
      </section>

      {/* ---- 3. AD SPACE — open placements, always labeled ---- */}
      <section className="elads" aria-label="ad space">
        <div className="cvkick">AD SPACE</div>
        <div className="eladrow">
          <div className="elad">
            <span className="adstar" aria-hidden="true">*</span>
            <b>THIS PLACEMENT IS OPEN</b>
            <em>space for taste.</em>
          </div>
          <div className="elad">
            <span className="adstar" aria-hidden="true">*</span>
            <b>THIS PLACEMENT IS OPEN</b>
            <em>sponsored placements are always disclosed.</em>
          </div>
        </div>
      </section>

      {/* ---- 4. THE COMMUNITY FLOOR ---- */}
      <section className="elfloor" aria-label="the community floor">
        <div className="cvkick">THE COMMUNITY FLOOR</div>
        {posts === null && <div className="empty">pulling the wire…</div>}
        {posts && !postsLive && (
          <div className="empty">
            the shared wire could not be reached — showing this device&apos;s
            posts only.
          </div>
        )}
        {posts && postsLive && posts.length === 0 && (
          <div className="empty">no transmissions yet — yours opens the wire.</div>
        )}
        {(posts || []).map((p) => (
          <div className="fpost" key={p.id}>
            <p className="fposttext">{p.text}</p>
            <span className="fposthandle">
              {p.handle}{p.mine ? <i className="cmine">you</i> : null} · {timeAgo(p.at)}
            </span>
          </div>
        ))}
        <p className="elfloornote">
          post from THE FEED&apos;s POST page — video transmissions arrive with
          the media pipeline.
        </p>
      </section>

      {/* ---- 5. EXTERNAL DISPATCHES — quietest ---- */}
      <section className="elext" aria-label="external dispatches">
        <div className="cvkick">EXTERNAL DISPATCHES</div>
        {STORIES.map((s) => (
          <a className="elextrow" key={s.title} href={s.url} target="_blank" rel="noopener noreferrer">
            <span className="elextpub">{s.pub.toUpperCase()}</span>
            <span className="elextttl">{s.title} ↗</span>
          </a>
        ))}
        <p className="elextnote">dispatches link out — the stories live with the publications.</p>
      </section>
    </div>
  );
}
