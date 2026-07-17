"use client";
// Cultural Discover rails (handoff Feature D). Named, collapsible strips
// whose content derives live from reviewed sources: the culture catalog
// (screen/soundtrack), the trend authority (rising now), and genuinely
// far-from-taste products (exploration — the feed's own far-reach rule).
// Rotation is deterministic by UTC day for everyone; when Asterisk guidance
// is active, Passport taste only ORDERS entities and never filters them.
// Pill clicks route through the SAME pickInterp mechanic as the Asterisk
// read strip, so rail taps and strip taps behave identically.

import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch, postJSON, getUid, thumbFor } from "../../lib/client.js";

export function DiscoverRails({ onPickTags }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const alive = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await authorizedFetch("/api/discover/rails?user=" + encodeURIComponent(getUid() || ""));
      if (!res.ok) return;
      const body = await res.json();
      if (alive.current) setData(body);
    } catch {}
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    window.addEventListener("asilum:identity", load);
    window.addEventListener("asilum:brain", load);
    return () => {
      alive.current = false;
      window.removeEventListener("asilum:identity", load);
      window.removeEventListener("asilum:brain", load);
    };
  }, [load]);

  // Non-optimistic: the stored pref returned by the server is the truth
  // (same contract as the memory drawer) — failures are surfaced, never
  // shown as saved state.
  async function setPref(rail, patch) {
    try {
      const res = await postJSON("/api/discover/rails", { user: getUid(), railId: rail.id, ...patch });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "could not save rail preference");
      if (!alive.current) return;
      setErr("");
      setData((current) => current && {
        ...current,
        rails: current.rails.map((r) => (r.id === rail.id
          ? { ...r, collapsed: !!body.pref.collapsed, hidden: !!body.pref.hidden }
          : r)),
      });
    } catch (error) {
      if (alive.current) setErr(error.message || "could not save rail preference");
    }
  }

  async function restoreHidden(rails) {
    for (const rail of rails) await setPref(rail, { hidden: false });
  }

  if (!data || !data.rails?.length) return null;
  const visible = data.rails.filter((rail) => !rail.hidden);
  const hidden = data.rails.filter((rail) => rail.hidden);

  return (
    <div className="rails">
      {err && <div className="railerr"><b className="red">*</b> {err}</div>}
      {hidden.length > 0 && (
        <button
          className="railact railrestore"
          onClick={() => restoreHidden(hidden)}
        >
          SHOW {hidden.length} HIDDEN RAIL{hidden.length === 1 ? "" : "S"}
        </button>
      )}
      {visible.map((rail) => (
        <section className="rail" key={rail.id}>
          <div className="railhead">
            <b className="red">*</b> {rail.title}
            <span className="railmeta">
              {rail.kind === "exploration"
                ? rail.basis
                : `rotates daily · ${rail.poolSize} in the archive`}
            </span>
            <button className="railact" onClick={() => setPref(rail, { collapsed: !rail.collapsed })}>
              {rail.collapsed ? "OPEN" : "COLLAPSE"}
            </button>
            <button className="railact" onClick={() => setPref(rail, { hidden: true })}>HIDE</button>
          </div>
          {!rail.collapsed && rail.entities && (
            <div className="railrow">
              {rail.entities.map((entity) => (
                <div className="railcard" key={entity.name}>
                  <div className="railname">
                    {entity.name.toUpperCase()}
                    {entity.phase ? <em className="railphase"> {entity.phase}</em> : null}
                  </div>
                  {entity.note && <div className="railnote">{entity.note}</div>}
                  <div className="railpills">
                    {entity.pills.map((pill) => (
                      <button
                        key={pill.id}
                        className="apill"
                        onClick={() => onPickTags({ id: "rail:" + pill.id, tags: pill.tags })}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!rail.collapsed && rail.items && (
            <div className="railrow">
              {rail.items.map((item) => (
                <a className="railitem" key={item.id} href={"/?item=" + encodeURIComponent(item.id)}>
                  <img src={item.img || thumbFor(item)} alt={item.title} />
                  <span>{item.title}</span>
                  <em>{item.brand}</em>
                </a>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
