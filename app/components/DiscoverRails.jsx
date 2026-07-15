"use client";
// Cultural Discover rails (handoff Feature D). Named, collapsible strips
// whose content derives live from reviewed sources: the culture catalog
// (screen/soundtrack), the trend authority (rising now), and genuinely
// far-from-taste products (exploration — the feed's own far-reach rule).
// Rotation is deterministic by UTC day for everyone; taste only ORDERS
// entities, never filters. Collapse/hide are the only writes (per-user).
// Pill clicks route through the SAME pickInterp mechanic as the Asterisk
// read strip, so rail taps and strip taps behave identically.

import { useEffect, useState } from "react";
import { authorizedFetch, postJSON, getUid, thumbFor } from "../../lib/client.js";

export function DiscoverRails({ onPickTags }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let dead = false;
    authorizedFetch("/api/discover/rails?user=" + encodeURIComponent(getUid() || ""))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!dead) setData(d); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  function setPref(rail, patch) {
    setData((current) => current && {
      ...current,
      rails: current.rails.map((r) => (r.id === rail.id ? { ...r, ...patch } : r)),
    });
    postJSON("/api/discover/rails", { user: getUid(), railId: rail.id, ...patch }).catch(() => {});
  }

  if (!data || !data.rails?.length) return null;
  const visible = data.rails.filter((rail) => !rail.hidden);
  const hidden = data.rails.filter((rail) => rail.hidden);

  return (
    <div className="rails">
      {hidden.length > 0 && (
        <button
          className="railact railrestore"
          onClick={() => hidden.forEach((rail) => setPref(rail, { hidden: false }))}
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
