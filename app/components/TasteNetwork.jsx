"use client";

// app/components/TasteNetwork.jsx — THE NETWORK, the Passport's page that
// shows everything at once (owner, 3 Nov 2026: "a way to see everything …
// like a 3d neural map type looking thing"). It grew out of FULL READ's flat
// ring of ten tags: the same ten, now on a sphere around YOU, and around them
// everything the passenger kept — every save (pieces, posts, people, places,
// events), every board and the pieces on it, every stamp earned — drawn in
// depth on one canvas, turning slowly, dragged to turn by hand.
//
// Every edge says something true, and the key under the canvas says which:
//   YOU → a tag     the brain's reading of it (width = weight, colour = the
//                   kind of evidence: manual / inferred / curated)
//   tag ↔ tag       the curated editorial affinity (lib/brain/tags.js), faint
//   a save → a tag  the save carries that tag (lib/save.js record `tags`)
//   a save → its kind, a piece → its board, a stamp → YOU   membership
// Nothing is inferred to draw a line. A save that carries no tag hangs off
// its kind alone.
//
// Controls per tag node — KEEP, REDUCE, REMOVE, EXPLORE — go through
// /api/taste, which snapshots first so UNDO is always one press away. When
// guidance is paused the edits are kept and the ranking ignores them; the
// panel says so instead of hiding the controls. The canvas is not focusable
// node by node, so THE INDEX under it lists every node as a button — the
// keyboard's (and a screen reader's) way into the same map.
//
// Colours are the theme's tokens, resolved through a probe element (a canvas
// cannot read var()); the dark palette glows, the light one never does.
// Motion: the turn and the signals stop under prefers-reduced-motion, and the
// loop runs only while the canvas is on screen and the page is visible.

import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedFetch, getUid, postJSON } from "../../lib/client.js";
import { TAGS } from "../../lib/brain/tags.js";
import { buildGraph, hash, jit, tagOf, SAVE_KINDS, PIECES_PER_BOARD } from "../../lib/passport/network.js";

const KIND_LABEL = { manual: "MANUAL", inferred: "INFERRED", curated: "CURATED", none: "UNLIT" };

// ---- the theme's colours, read off a probe (a canvas cannot read var()) ----
function readPalette(el) {
  const probe = document.createElement("span");
  probe.style.display = "none";
  el.appendChild(probe);
  const out = {};
  for (const k of ["sig", "red", "ink", "grey", "p2", "bg"]) {
    probe.style.color = `var(--${k})`;
    const c = getComputedStyle(probe).color;
    const m = c.match(/[\d.]+/g) || ["0", "0", "0"];
    const srgb = c.startsWith("color(");
    out[k] = m.slice(0, 3).map((x) => Math.round(srgb ? +x * 255 : +x));
  }
  probe.remove();
  out.glow = getComputedStyle(document.documentElement).getPropertyValue("--glow").trim() !== "none";
  out.font = getComputedStyle(el).fontFamily;
  return out;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export default function TasteNetwork({ onExplore, saves = [], boards = [], stamps = [] }) {
  const [net, setNet] = useState(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null); // a node id
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null); // { op, tag } — the act UNDO refers to
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const live = useRef({ yaw: 0.6, pitch: -0.32, hover: null, sel: null, dragging: false, idleUntil: 0, dirty: true });

  function load() {
    authorizedFetch("/api/taste?user=" + encodeURIComponent(getUid() || ""))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { setNet(d); setErr(""); })
      .catch(() => setErr("the network could not be read — sign in or answer the first-visit question and try again"));
  }
  useEffect(() => { load(); }, []);

  async function act(op, tag) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await postJSON("/api/taste", { user: getUid(), op, tag });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setErr((d && d.error) || "the change was refused"); return; }
      if (d && d.observed === false) { setErr(d.reason || "not observed"); return; }
      setNet((prev) => ({ ...(prev || {}), ...d }));
      setLast(op === "undo" ? null : { op, tag });
      setErr("");
      if (op === "explore" && onExplore) onExplore(tag);
    } finally { setBusy(false); }
  }

  const graph = useMemo(() => buildGraph(net, saves, boards, stamps), [net, saves, boards, stamps]);
  const graphRef = useRef(graph);
  useEffect(() => { graphRef.current = graph; live.current.dirty = true; }, [graph]);
  useEffect(() => { live.current.sel = sel; live.current.dirty = true; }, [sel]);

  // ---- the canvas: projection, drawing, the turn, the hand ----
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    const L = live.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pal = readPalette(wrap);
    let W = 0, H = 0, dpr = 1, raf = 0, onScreen = true, prev = performance.now(), clock = 0;
    let projected = [];

    function size() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      L.dirty = true;
    }
    function project(p) {
      const cy = Math.cos(L.yaw), sy = Math.sin(L.yaw), cp = Math.cos(L.pitch), sp = Math.sin(L.pitch);
      const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
      const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
      const D = 4.6, persp = D / (D - z2), S = Math.min(W, H) * 0.205;
      return { x: W / 2 + x1 * S * persp, y: H / 2 + y2 * S * persp, z: z2, s: persp };
    }
    const depthA = (z) => 0.16 + 0.84 * Math.min(1, Math.max(0, (z + 2.2) / 4.4));
    function nodeColour(n) {
      if (n.type === "you" || n.type === "stamp") return pal.red;
      if (n.type === "tag") return n.kind === "manual" ? pal.red : n.kind === "inferred" ? pal.sig : n.kind === "curated" ? pal.p2 : pal.sig; // an unlit tag is the same ink, faint
      if (n.type === "hub" || n.type === "board") return pal.ink;
      if (n.type === "piece") return pal.p2;
      return pal.sig;
    }
    function edgeColour(e) {
      if (e.k === "weight") return e.neg ? pal.grey : e.kind === "manual" ? pal.red : e.kind === "curated" ? pal.p2 : pal.sig;
      if (e.k === "curated") return pal.p2;
      if (e.k === "carries") return pal.sig;
      if (e.k === "earned") return pal.red;
      return pal.grey;
    }

    // a glow sprite per colour (dark only): a soft disc drawn once and stamped, cheaper than shadowBlur
    const sprites = new Map();
    function sprite(c) {
      const key = c.join(",");
      if (sprites.has(key)) return sprites.get(key);
      const cv = document.createElement("canvas"); cv.width = cv.height = 64;
      const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(c, 0.9)); gr.addColorStop(0.25, rgba(c, 0.35)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      sprites.set(key, cv);
      return cv;
    }
    // every link bows outward from the centre and a little aside (seeded), so it reads as an axon, not a stick
    function curve(e, a, b) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ox = mx - W / 2, oy = my - H / 2, ol = Math.hypot(ox, oy) || 1;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const bow = (e.k === "curated" ? 0.16 : 0.1) * len, side = jit(e.a + e.b, 7) * 0.12 * len;
      return { cx: mx + (ox / ol) * bow + (-(b.y - a.y) / (len || 1)) * side, cy: my + (oy / ol) * bow + ((b.x - a.x) / (len || 1)) * side };
    }
    const bez = (a, c, b, t) => { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.cx + t * t * b.x, y: u * u * a.y + 2 * u * t * c.cy + t * t * b.y }; };

    function draw() {
      const g = graphRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      const glow = pal.glow;
      const P = new Map();
      for (const n of g.nodes) P.set(n.id, project(n.p));
      const focus = L.sel || L.hover;
      const touching = new Set();
      if (focus) for (const e of g.edges) if (e.a === focus || e.b === focus) { touching.add(e.a); touching.add(e.b); }

      // the nucleus: a bloom round YOU
      const you = P.get("you");
      const R0 = Math.min(W, H) * 0.32 * you.s;
      const bloom = ctx.createRadialGradient(you.x, you.y, 0, you.x, you.y, R0);
      bloom.addColorStop(0, rgba(pal.red, glow ? 0.26 : 0.12)); bloom.addColorStop(0.4, rgba(pal.sig, glow ? 0.08 : 0.04)); bloom.addColorStop(1, rgba(pal.sig, 0));
      ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);

      // two faint orbits, the tags' shell and the saves', so the depth reads (rings, not a grid)
      for (const [rad, al] of [[1.2, 0.14], [1.8, 0.07]]) {
        ctx.strokeStyle = rgba(pal.sig, al); ctx.lineWidth = 0.8; ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
          const t = (i / 90) * Math.PI * 2, q = project([Math.cos(t) * rad, 0, Math.sin(t) * rad]);
          if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        }
        ctx.stroke();
      }

      // the links, in light added together in the dark (they brighten where they cross, as a nerve does)
      if (glow) ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const curves = new Map();
      for (const e of g.edges) {
        const a = P.get(e.a), b = P.get(e.b), c = curve(e, a, b);
        curves.set(e, c);
        const hot = focus && (e.a === focus || e.b === focus);
        const dz = depthA((a.z + b.z) / 2);
        let alpha = dz * (e.k === "weight" ? 0.7 : e.k === "curated" ? 0.12 + e.w * 0.28 : e.k === "carries" ? 0.42 : e.k === "earned" ? 0.55 : 0.26);
        if (focus) alpha = hot ? 0.95 : alpha * 0.22;
        const ca = hot ? pal.sig : edgeColour(e), cb = e.k === "weight" ? pal.red : hot ? pal.sig : edgeColour(e);
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, rgba(cb, alpha)); grad.addColorStop(1, rgba(ca, alpha * (e.k === "member" ? 0.5 : 1)));
        ctx.strokeStyle = grad;
        ctx.lineWidth = (e.k === "weight" ? 0.7 + e.w * 2.4 : e.k === "curated" ? 0.5 + e.w * 1.1 : hot ? 1.5 : 0.75) * ((a.s + b.s) / 2);
        ctx.setLineDash(e.neg ? [3, 4] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.cx, c.cy, b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]);

      // the signals: sparks with a short tail running along the links — every reading and every affinity, faster
      // and brighter where the link is stronger; along the focus's links only, once one is chosen
      if (!reduced) {
        for (const e of g.edges) {
          const hot = focus && (e.a === focus || e.b === focus);
          if (focus ? !hot : (e.k === "member" || e.neg)) continue;
          const a = P.get(e.a), b = P.get(e.b), c = curves.get(e);
          const w = e.w || 0.5, period = 3400 - w * 1600;
          const t0 = ((clock / period) + (hash(e.a + e.b) % 1000) / 1000) % 1;
          const forward = e.k === "weight" || e.k === "earned" ? 1 : hash(e.b + e.a) % 2 ? 1 : -1; // a reading runs out from YOU
          const col = hot ? pal.sig : e.k === "weight" && e.kind === "manual" ? pal.red : edgeColour(e);
          for (let k = 0; k < 4; k++) {
            const t = t0 - k * 0.022;
            if (t < 0) continue;
            const pt = bez(a, c, b, forward > 0 ? t : 1 - t);
            const fade = (1 - k / 4) * Math.sin(Math.PI * t) * depthA(a.z + (b.z - a.z) * t);
            const rr = (1.9 - k * 0.35) * a.s;
            if (glow && k === 0) { const sp = sprite(col), d = rr * 7; ctx.globalAlpha = fade * 0.8; ctx.drawImage(sp, pt.x - d / 2, pt.y - d / 2, d, d); ctx.globalAlpha = 1; }
            ctx.fillStyle = rgba(k === 0 && glow ? pal.ink : col, fade * (hot ? 1 : 0.85));
            ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(0.5, rr), 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // the neurons, back to front: a halo in the dark, a body, a ring for the tags, the kinds and the boards
      projected = g.nodes.map((n) => ({ n, q: P.get(n.id) })).sort((u, v) => u.q.z - v.q.z);
      const fontFamily = pal.font || "sans-serif";
      for (const { n, q } of projected) {
        const c = nodeColour(n);
        const lit = !focus || touching.has(n.id) || n.id === focus;
        const a = depthA(q.z) * (lit ? 1 : 0.3);
        const breathe = !reduced && n.type === "tag" && n.kind !== "none" ? 1 + Math.sin(clock / 900 + hash(n.id) % 7) * 0.08 : 1;
        const r = n.r * q.s * (n.id === focus ? 1.4 : 1) * breathe;
        if (glow) {
          ctx.globalCompositeOperation = "lighter";
          const strong = n.type === "you" ? 4.5 : n.type === "tag" ? (n.kind === "none" ? 3.2 : 6) : n.type === "stamp" ? 5 : 3.4;
          const d = r * strong * 2; ctx.globalAlpha = a * (n.type === "tag" && n.kind === "none" ? 0.45 : 0.85);
          ctx.drawImage(sprite(c), q.x - d / 2, q.y - d / 2, d, d); ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = "source-over";
        const body = n.type === "hub" || n.type === "board" ? 0.22 : n.type === "tag" && n.kind === "none" ? 0.38 : 0.92;
        ctx.fillStyle = rgba(c, a * body);
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        if (glow && n.type !== "hub" && n.type !== "board") { // a bright core
          ctx.fillStyle = rgba(pal.ink, a * (n.type === "you" ? 0.35 : n.type === "tag" && n.kind === "none" ? 0.25 : 0.7));
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.6, r * 0.38), 0, Math.PI * 2); ctx.fill();
        }
        if (n.type === "tag" || n.type === "hub" || n.type === "board" || n.type === "you" || n.id === focus) {
          ctx.strokeStyle = rgba(n.id === focus ? pal.ink : c, a * (n.type === "tag" && n.kind === "none" ? 0.6 : 0.95));
          ctx.lineWidth = n.id === focus ? 1.6 : 1;
          ctx.setLineDash(n.type === "tag" && (n.kind === "curated" || n.kind === "none") ? [2, 2.5] : []);
          ctx.beginPath(); ctx.arc(q.x, q.y, r + (n.type === "tag" || n.type === "you" ? 3 * q.s : 2 * q.s), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      // the words, nearest first, each placed only where no nearer word already sits: the tags, the kinds, the
      // boards and YOU when they face the reader; a save or a piece only as the focus or the focus's neighbour
      const placed = [];
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = projected.length - 1; i >= 0; i--) {
        const { n, q } = projected[i];
        const near = n.id === focus || (focus && touching.has(n.id));
        const always = n.type === "you" || ((n.type === "tag" || n.type === "hub" || n.type === "board") && q.z > -0.6);
        if (!(always || near)) continue;
        const a = depthA(q.z) * (!focus || near ? 1 : 0.4);
        const fs = n.id === focus ? 9.5 : Math.max(6.5, Math.min(8.5, 7.4 * q.s));
        ctx.font = `${fs}px ${fontFamily}`;
        const label = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label;
        const r = n.r * q.s * (n.id === focus ? 1.4 : 1) + 3 * q.s;
        const y = q.y + (q.y < you.y ? -(r + 8) : r + 9);
        const w = ctx.measureText(label).width, box = [q.x - w / 2 - 3, y - fs / 2 - 2, q.x + w / 2 + 3, y + fs / 2 + 2];
        if (n.id !== focus && placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
        placed.push(box);
        ctx.fillStyle = rgba(n.id === focus ? pal.sig : n.type === "you" ? pal.red : n.type === "hub" || n.type === "board" ? pal.grey : pal.ink, Math.min(1, a + 0.12));
        ctx.fillText(label, q.x, y);
      }
      L.dirty = false;
    }

    function frame(t) {
      const dt = Math.min(64, t - prev); prev = t; clock += dt;
      if (!reduced && !L.dragging && t > L.idleUntil) { L.yaw += dt * 0.00011; L.dirty = true; }
      if (!reduced || L.dirty) draw();
      raf = onScreen && !document.hidden ? requestAnimationFrame(frame) : 0;
    }
    const kick = () => { if (!raf && onScreen && !document.hidden) { prev = performance.now(); raf = requestAnimationFrame(frame); } };

    function hit(x, y) {
      for (let i = projected.length - 1; i >= 0; i--) {
        const { n, q } = projected[i];
        if (Math.hypot(q.x - x, q.y - y) <= Math.max(10, n.r * q.s + 5)) return n.id;
      }
      return null;
    }
    let down = null;
    function onDown(e) {
      down = { x: e.clientX, y: e.clientY, yaw: L.yaw, pitch: L.pitch, moved: false };
      canvas.setPointerCapture?.(e.pointerId);
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 5) { down.moved = true; L.dragging = true; }
        if (down.moved) {
          L.yaw = down.yaw + dx * 0.008;
          L.pitch = Math.max(-1.1, Math.min(1.1, down.pitch + dy * 0.006));
          L.dirty = true; kick();
        }
        return;
      }
      if (e.pointerType === "mouse") {
        const h = hit(e.clientX - r.left, e.clientY - r.top);
        if (h !== L.hover) { L.hover = h; L.dirty = true; canvas.style.cursor = h ? "pointer" : "grab"; kick(); }
      }
    }
    function onUp(e) {
      if (!down) return;
      const r = canvas.getBoundingClientRect();
      if (!down.moved) { const h = hit(e.clientX - r.left, e.clientY - r.top); setSel((cur) => (h && h !== cur ? h : null)); }
      down = null; L.dragging = false; L.idleUntil = performance.now() + 2600;
    }
    function onCancel() { down = null; L.dragging = false; L.idleUntil = performance.now() + 2600; }
    function onLeave() { if (L.hover) { L.hover = null; L.dirty = true; kick(); } }
    function onKey(e) {
      const step = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
      if (!step) return;
      e.preventDefault();
      L.yaw += step[0]; L.pitch = Math.max(-1.1, Math.min(1.1, L.pitch + step[1]));
      L.idleUntil = performance.now() + 4000; L.dirty = true; kick();
    }

    size();
    const ro = new ResizeObserver(() => { size(); kick(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; kick(); });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    const repaint = () => { pal = readPalette(wrap); L.dirty = true; kick(); };
    const mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", repaint);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("keydown", onKey);
    // a state change (selection, data) asks for one frame even when the loop is idle
    L.kick = kick;
    kick();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener?.("change", repaint);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => { live.current.kick && live.current.kick(); }, [graph, sel]);

  const selected = sel ? graph.byId.get(sel) : null;
  const tagNodes = graph.nodes.filter((n) => n.type === "tag");
  const lit = tagNodes.filter((n) => n.kind !== "none").length;
  const counts = { saves: graph.nodes.filter((n) => n.type === "save").length, boards: graph.nodes.filter((n) => n.type === "board").length, stamps: graph.nodes.filter((n) => n.type === "stamp").length };
  const groups = [
    ["TASTE", tagNodes],
    ...SAVE_KINDS.map(([k, label]) => [label, graph.nodes.filter((n) => n.type === "save" && n.data.kind === k)]),
    ["BOARDS", graph.nodes.filter((n) => n.type === "board")],
    ["STAMPS", graph.nodes.filter((n) => n.type === "stamp")],
  ].filter(([, list]) => list.length);
  const tag = selected && selected.type === "tag" ? selected.data : null;

  return (
    <div className="tnet">
      <div className="tnetgrid">
        <div className="tnetstage" ref={wrapRef}>
          <canvas ref={canvasRef} className="tnetcanvas" tabIndex={0} role="img"
            aria-label={`the network of everything you have kept — ${lit} of ten tags lit, ${counts.saves} saves, ${counts.boards} boards, ${counts.stamps} stamps. drag or use the arrow keys to turn it; the index below lists every node.`} />
          <div className="tnetread" aria-hidden="true"><b>YOU</b> · {lit} LIT · {counts.saves} SAVED · {counts.boards} BOARDS · {counts.stamps} STAMPS</div>
          <div className="tnethint" aria-hidden="true">DRAG TO TURN · TAP A NODE</div>
        </div>
        <aside className="tnetpanel" aria-live="polite">
          {!selected || selected.type === "you" ? (
            <>
              <div className="cclbl">THE NETWORK</div>
              <p className="tnetp">Everything you kept, around you. The ten tags are the brain&apos;s reading; your saves, boards and stamps hang off what they really carry. Choose a node to see why it is there.</p>
              <ul className="tnetkey">
                <li><i className="k manual" /> MANUAL — you chose it</li>
                <li><i className="k inferred" /> INFERRED — from what you saved, opened and passed</li>
                <li><i className="k curated" /> CURATED — an editorial neighbour, not a claim about you</li>
                <li><i className="k save" /> A SAVE — joined to the tags it carries and to its kind</li>
                <li><i className="k piece" /> A PIECE ON A BOARD — joined to its board</li>
                <li><i className="k stamp" /> A STAMP — a thing you made and kept</li>
              </ul>
              {net && net.guidanceEnabled === false && <p className="tnetp warn">guidance is paused — edits are kept; the ranking ignores them until you resume it in SETTINGS.</p>}
              <p className="tnetp faint">A preference in film, food or movement can share a trait with clothing — restraint, texture, pace — but it never rewrites this network on its own. Cross-medium links are yours to confirm in the Feed.</p>
            </>
          ) : tag ? (
            <>
              <div className="cclbl">{KIND_LABEL[tag.kind]}</div>
              <h3 className="tnetsel">{tag.tag}</h3>
              <div className="tnetreading">{tag.weight ? `READING ${tag.weight.toFixed(2)}` : "NO READING YET"}{tag.saves ? ` · ${tag.saves} SAVED` : ""}</div>
              <ul className="tnetev">
                {tag.evidence.length === 0 && <li>nothing yet — a save, an open or a KEEP lights it.</li>}
                {tag.evidence.map((e, i) => <li key={i}>{e.what}</li>)}
              </ul>
              <div className="tnetacts">
                <button className="txtbtn" disabled={busy} onClick={() => act("keep", tag.tag)}>KEEP</button>
                <button className="txtbtn" disabled={busy || !tag.weight} onClick={() => act("reduce", tag.tag)}>REDUCE</button>
                <button className="txtbtn warn" disabled={busy || tag.kind === "none"} onClick={() => act("remove", tag.tag)}>REMOVE</button>
                <button className="txtbtn" disabled={busy} onClick={() => act("explore", tag.tag)}>EXPLORE →</button>
              </div>
              {net && net.guidanceEnabled === false && <p className="tnetp warn">guidance is paused — this edit is kept, not ranked with.</p>}
            </>
          ) : (
            <>
              <div className="cclbl">{selected.type === "save" ? selected.data.kind.toUpperCase() : selected.type === "hub" ? "KIND" : selected.type.toUpperCase()}</div>
              <h3 className="tnetsel">{selected.label}</h3>
              {selected.type === "save" && (
                <>
                  {selected.data.meta && <div className="tnetreading">{selected.data.meta}</div>}
                  <ul className="tnetev">
                    {(selected.data.tags || []).filter((t) => TAGS.includes(tagOf(t))).length
                      ? <li>carries {(selected.data.tags || []).map(tagOf).filter((t) => TAGS.includes(t)).join(" · ")}</li>
                      : <li>carries none of the ten tags — it hangs off its kind alone.</li>}
                    {selected.data.at && <li>saved {new Date(selected.data.at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</li>}
                  </ul>
                  {selected.data.href && <div className="tnetacts"><a className="txtbtn" href={selected.data.href}>OPEN →</a></div>}
                </>
              )}
              {selected.type === "hub" && (
                <ul className="tnetev">
                  <li>{selected.data.saves.length} saved</li>
                  {selected.data.saves.slice(0, 6).map((s) => <li key={s.id}>{s.title}</li>)}
                </ul>
              )}
              {selected.type === "board" && (
                <ul className="tnetev">
                  <li>{(selected.data.items || []).length} piece{(selected.data.items || []).length === 1 ? "" : "s"}{(selected.data.items || []).length > PIECES_PER_BOARD ? ` — the first ${PIECES_PER_BOARD} drawn` : ""}</li>
                  {(selected.data.items || []).slice(0, PIECES_PER_BOARD).map((it) => <li key={it.id}>{[it.brand, it.title].filter(Boolean).join(" — ")}</li>)}
                </ul>
              )}
              {selected.type === "piece" && (
                <ul className="tnetev">
                  {selected.data.brand && <li>{selected.data.brand}</li>}
                  <li>on a board{(selected.data.tags || []).map(tagOf).filter((t) => TAGS.includes(t)).length ? ` · carries ${(selected.data.tags || []).map(tagOf).filter((t) => TAGS.includes(t)).slice(0, 3).join(" · ")}` : ""}</li>
                </ul>
              )}
              {selected.type === "stamp" && <ul className="tnetev"><li>earned — stamps mark things you make and keep. no timer, no streak to lose.</li></ul>}
              <div className="tnetacts"><button className="txtbtn" onClick={() => setSel(null)}>CLOSE</button></div>
            </>
          )}
          {(last || (net && net.undo)) && (
            <div className="tnetundo">
              {last ? `${last.op.toUpperCase()} · ${last.tag}` : "one change waiting"} · <button className="txtbtn" disabled={busy} onClick={() => act("undo")}>UNDO</button>
            </div>
          )}
          {err && <p className="tnetp warn">{err}</p>}
        </aside>
      </div>
      <nav className="tnetindex" aria-label="every node in the network">
        {groups.map(([label, list]) => (
          <div key={label} className="tnetgroup">
            <span className="tnetgrouplbl">{label} <i>{String(list.length).padStart(2, "0")}</i></span>
            <span className="tnetchips">
              {list.map((n) => (
                <button key={n.id} className={"tnetchip " + n.type + (n.kind ? " " + n.kind : "") + (sel === n.id ? " cur" : "")} aria-pressed={sel === n.id}
                  onClick={() => setSel(sel === n.id ? null : n.id)}>{n.label.length > 32 ? n.label.slice(0, 31) + "…" : n.label}</button>
              ))}
            </span>
          </div>
        ))}
      </nav>
    </div>
  );
}
