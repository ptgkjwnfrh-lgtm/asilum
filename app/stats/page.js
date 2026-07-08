"use client";

// app/stats/page.js
// Brain health dashboard: the living brain visualization (your taste as a
// rotating word-sphere — white pulses when it learns, red when it forgets),
// interaction volume by action, graph/board/user counts, and the
// most-engaged pieces.

import { useEffect, useState } from "react";
import BrainViz from "../components/BrainViz.jsx";
import { vizState } from "../../lib/brain/memory.js";
import { getUid } from "../../lib/client.js";

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [viz, setViz] = useState(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    fetch("/api/profile?user=" + encodeURIComponent(getUid() || "guest"))
      .then((r) => r.json())
      .then((d) => setViz(vizState(d.profile)))
      .catch(() => {});
  }, []);

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>STATS</h1>
      <p className="deck">what the brain has learned so far.</p>
      <hr className="rule" />

      {viz && (
        <>
          <h3 className="statshead">your brain — drag to rotate</h3>
          <div style={{ border: "1px solid var(--line)", marginBottom: 10 }}>
            <BrainViz {...viz} />
          </div>
        </>
      )}

      {!stats ? (
        <div className="empty">loading…</div>
      ) : (
        <>
          <div className="splitbar">
            <span className="chip">users <b>{stats.users}</b></span>
            <span className="chip">interactions <b>{stats.interactions}</b></span>
            <span className="chip">boards <b>{stats.boards}</b></span>
            <span className="chip">graph edges <b>{stats.edges}</b></span>
            <span className="chip">
              storage <b>{stats.persistent ? "postgres" : "memory (resets on restart)"}</b>
            </span>
          </div>

          <h3 className="statshead">interactions by action</h3>
          <table className="stats">
            <tbody>
              {Object.entries(stats.actions).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
              {Object.keys(stats.actions).length === 0 && (
                <tr><td colSpan={2}>none yet</td></tr>
              )}
            </tbody>
          </table>

          <h3 className="statshead">most engaged pieces</h3>
          <table className="stats">
            <thead>
              <tr><th>piece</th><th>brand</th><th>engagements</th><th>impressions</th><th>rate</th></tr>
            </thead>
            <tbody>
              {stats.topItems.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td><td>{t.brand}</td>
                  <td>{Math.round(t.eng * 10) / 10}</td><td>{Math.round(t.imp)}</td>
                  <td>{t.rate != null ? t.rate : "—"}</td>
                </tr>
              ))}
              {stats.topItems.length === 0 && <tr><td colSpan={5}>none yet</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
