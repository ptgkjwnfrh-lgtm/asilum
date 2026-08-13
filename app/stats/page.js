"use client";

// app/stats/page.js
// Brain health dashboard: the ASTERISK hologram entity at reading size,
// interaction volume by action, graph/board/user counts, and the
// most-engaged pieces. Rides under PASSPORT.

import { useEffect, useState } from "react";
import AsteriskDock from "../components/AsteriskDock.jsx";
import { vizState } from "../../lib/brain/memory.js";
import { getUid, authorizedFetch } from "../../lib/client.js";

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [viz, setViz] = useState(null);
  const [mix, setMix] = useState(null); // (r16) bridge mix, plain words

  useEffect(() => {
    // WHAT WAS WRONG (Aug 8, codebase audit). This never checked r.ok, so an
    // ERROR BODY was stored as `stats`. The render below treats any truthy
    // `stats` as the dashboard and reaches `Object.entries(stats.actions)` —
    // undefined on an error body — which THROWS and takes the whole page down.
    // /api/stats really does return 401 "identity required" and 429, and the
    // 401 is reachable from the identity bug fixed alongside this in
    // lib/client.js: no device cookie, so no identity, so 401, so a crash.
    fetch("/api/stats")
      .then(async (r) => {
        if (!r.ok) {
          setStatsError(r.status === 401
            ? "sign of life needed — this dashboard reads your own identity, and none was issued"
            : `stats unavailable (${r.status})`);
          return null;
        }
        return r.json();
      })
      .then((d) => { if (d) setStats(d); })
      .catch(() => setStatsError("stats unavailable — the request did not complete"));
    authorizedFetch("/api/profile?user=" + encodeURIComponent(getUid() || "guest"))
      .then((r) => r.json())
      .then((d) => { setViz(vizState(d.profile)); setMix(d.bridgeMix || null); })
      .catch(() => {});
  }, []);

  return (
    <div className="wrap">
      <div className="locline"><a href="/board">← PASSPORT</a><span>/ BRAIN DASHBOARD</span></div>
      <h1 className="headline"><span className="red">*</span>STATS</h1>
      <p className="deck">what the brain has learned so far.</p>
      {mix ? <p className="areadnote"><b className="red">*</b> {mix.line}</p> : null}
      <hr className="rule" />

      {viz && (
        <>
          <h3 className="statshead">your brain — drag to rotate</h3>
          <div style={{ marginBottom: 10 }}>
            <AsteriskDock size={220} className="os-dock statsdock" />
          </div>
        </>
      )}

      {statsError ? (
        <div className="empty">{statsError}</div>
      ) : !stats ? (
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
