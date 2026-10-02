"use client";

// app/components/ConnectionsWheel.jsx — CONNECTIONS (V.2 brief §11): the
// people and houses this passenger follows, as a CD-inspired wheel beside a
// conventional searchable list with alphabetical shortcuts. Rotation is an
// OPTIONAL interaction — arrows, touch buttons and the keyboard all turn it,
// the selected entry is always shown in full, long names stay readable, and
// on a small screen the wheel folds into a drawer under the list instead of
// squeezing beside it. The list is the thing; the wheel is a way to look at it.
//
// Reads the device's own follow model (lib/social.js — dual-written to the
// server's user_follows). No followers: ASILUM does not track followers.

import { useEffect, useMemo, useState } from "react";
import { followedBrands, followedUsers, setFollowBrand, setFollowUser } from "../../lib/social.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
const SLOTS = 7;   // entries drawn on the wheel at once (the selected one in the middle)

function readFollows() {
  const people = followedUsers().map((h) => ({ id: "u:" + h, kind: "passenger", name: h, href: "/u/" + encodeURIComponent(h) }));
  const houses = followedBrands().map((b) => ({ id: "b:" + b, kind: "house", name: b, href: "/discover?q=" + encodeURIComponent(b) }));
  return [...people, ...houses].sort((a, b) => a.name.localeCompare(b.name));
}

export default function ConnectionsWheel() {
  const [all, setAll] = useState([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [sel, setSel] = useState(0);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const read = () => setAll(readFollows());
    read();
    window.addEventListener("asilum:follow", read);
    try { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setReduced(m.matches); const on = () => setReduced(m.matches); m.addEventListener("change", on); return () => { window.removeEventListener("asilum:follow", read); m.removeEventListener("change", on); }; } catch { return () => window.removeEventListener("asilum:follow", read); }
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((e) => (kind === "all" || e.kind === kind) && (!needle || e.name.toLowerCase().includes(needle)));
  }, [all, q, kind]);
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, list.length - 1))); }, [list.length]);

  const letters = useMemo(() => new Set(list.map((e) => (/^[a-z]/i.test(e.name) ? e.name[0].toUpperCase() : "#"))), [list]);
  function jump(letter) {
    const i = list.findIndex((e) => (/^[a-z]/i.test(e.name) ? e.name[0].toUpperCase() : "#") === letter);
    if (i >= 0) { setSel(i); const el = document.getElementById("conn-" + list[i].id); if (el) el.scrollIntoView({ block: "nearest" }); }
  }
  function turn(d) { if (!list.length) return; setSel((s) => (s + d + list.length) % list.length); }
  function unfollow(e) { if (e.kind === "passenger") setFollowUser(e.name, false); else setFollowBrand(e.name, false); }

  const current = list[sel] || null;
  const ring = [];
  for (let k = -Math.floor(SLOTS / 2); k <= Math.floor(SLOTS / 2); k++) {
    if (!list.length) break;
    const i = (sel + k + list.length) % list.length;
    if (ring.some((r) => r.i === i)) break;
    ring.push({ i, e: list[i], k });
  }

  return (
    <section className="connwheel" aria-label="connections">
      <div className="connhead">
        <input type="search" aria-label="search your connections" placeholder="search connections…" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} />
        <div className="seg" role="tablist" aria-label="kind">
          {["all", "passenger", "house"].map((k) => (
            <button key={k} role="tab" type="button" aria-selected={kind === k} className={"tab" + (kind === k ? " cur" : "")} onClick={() => { setKind(k); setSel(0); }}>{k.toUpperCase()}</button>
          ))}
        </div>
        <button type="button" className="wact" aria-pressed={wheelOpen} onClick={() => setWheelOpen((v) => !v)}>{wheelOpen ? "LIST ONLY" : "WHEEL"}</button>
      </div>
      <div className="connaz" role="navigation" aria-label="alphabetical shortcuts">
        {LETTERS.map((l) => <button key={l} type="button" disabled={!letters.has(l)} onClick={() => jump(l)}>{l}</button>)}
      </div>
      <div className={"connbody" + (wheelOpen ? " withwheel" : "")}>
        <ul className="connlist" aria-label="the list">
          {list.length === 0 ? <li className="fine">no connections yet — stamp a passenger or follow a house.</li> : null}
          {list.map((e, i) => (
            <li key={e.id} id={"conn-" + e.id} className={i === sel ? "cur" : ""}>
              <button type="button" className="connpick" aria-current={i === sel ? "true" : undefined} onClick={() => setSel(i)}>
                <b>{e.name}</b><span className="fine">{e.kind}</span>
              </button>
              <a className="amemgo" href={e.href}>OPEN</a>
              <button type="button" className="wact" onClick={() => unfollow(e)}>UNFOLLOW</button>
            </li>
          ))}
        </ul>
        {wheelOpen && list.length ? (
          <div className="connring" role="group" aria-label="the wheel — optional; the list beside it is the same" tabIndex={0}
            onKeyDown={(ev) => { if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") { ev.preventDefault(); turn(-1); } if (ev.key === "ArrowDown" || ev.key === "ArrowRight") { ev.preventDefault(); turn(1); } }}>
            <button type="button" className="wact connturn" aria-label="previous" onClick={() => turn(-1)}>↑</button>
            <ol className={"connslots" + (reduced ? " still" : "")}>
              {ring.map(({ e, k }) => (
                <li key={e.id} className={"connslot" + (k === 0 ? " sel" : "")} style={{ "--k": k }} aria-hidden={k !== 0}>
                  <span>{e.name}</span>
                </li>
              ))}
            </ol>
            <button type="button" className="wact connturn" aria-label="next" onClick={() => turn(1)}>↓</button>
            {current ? <p className="connsel" aria-live="polite"><b>{current.name}</b> · {current.kind} · <a href={current.href}>open</a></p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
