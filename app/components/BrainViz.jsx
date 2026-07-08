"use client";

// app/components/BrainViz.jsx
// The brain, visible. A slowly rotating 3D word-sphere on canvas:
//   * nodes = the 10 canonical tags (word size/brightness = |weight|)
//   * edges = tag affinity (the sphere's "skill tree" wiring)
//   * WHITE pulse + lit edges = thinking (recent activity from _meta.activity)
//   * RED flare + snapping/falling edges = forgetting (_meta.forgotten)
// Drag to rotate. Pass it vizState(profile) from lib/brain/memory.js:
//   <BrainViz weights={s.weights} recent={s.recent} forgotten={s.forgotten}/>

import { useEffect, useRef } from "react";
import { TAGS, tagSim } from "../../lib/brain/tags.js";

export default function BrainViz({ weights = {}, recent = [], forgotten = [], height = 380 }) {
  const canvasRef = useRef(null);
  const state = useRef({ rot: { x: -0.35, y: 0 }, drag: null, nodes: [], edges: [] });

  // Build sphere geometry once (fibonacci lattice over the 10 tags).
  useEffect(() => {
    const N = TAGS.length;
    state.current.nodes = TAGS.map((tag, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      return { tag, x: Math.sin(phi) * Math.cos(theta), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(theta), pulse: 0, red: 0 };
    });
    const edges = [];
    TAGS.forEach((a, i) => TAGS.forEach((b, j) => {
      if (j <= i) return;
      const aff = tagSim(a, b);
      if (aff > 0) edges.push({ a: i, b: j, aff, life: 1, dying: false });
    }));
    state.current.edges = edges;
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let raf, alive = true;

    const size = () => { cv.width = cv.clientWidth * dpr; cv.height = height * dpr; };
    size();

    const down = (e) => { state.current.drag = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      const s = state.current; if (!s.drag) return;
      s.rot.y += (e.clientX - s.drag.x) * 0.008;
      s.rot.x = Math.max(-1.4, Math.min(1.4, s.rot.x + (e.clientY - s.drag.y) * 0.008));
      s.drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (state.current.drag = null);
    cv.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    const draw = () => {
      if (!alive) return;
      const s = state.current;
      const now = Date.now();
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      if (!s.drag) s.rot.y += 0.004;

      // feed activity into pulses
      recent.slice(0, 10).forEach((ev) => {
        if (now - ev.t > 2600 || !ev.tag) return;
        const n = s.nodes.find((x) => x.tag === ev.tag);
        if (!n) return;
        if (ev.kind === "skip" || ev.kind === "hide") n.red = Math.max(n.red, 0.85);
        else n.pulse = Math.max(n.pulse, 0.9);
      });
      forgotten.slice(0, 6).forEach((f) => {
        if (now - f.t > 4000) return;
        const n = s.nodes.find((x) => x.tag === f.tag);
        if (n) n.red = Math.max(n.red, 1);
        s.edges.forEach((e) => { if (s.nodes[e.a].tag === f.tag || s.nodes[e.b].tag === f.tag) e.dying = true; });
      });

      const R = Math.min(W, H) * 0.36, cx = W / 2, cy = H / 2;
      const cy1 = Math.cos(s.rot.y), sy1 = Math.sin(s.rot.y), cx1 = Math.cos(s.rot.x), sx1 = Math.sin(s.rot.x);
      const proj = (n) => {
        let x = n.x * cy1 + n.z * sy1, z = -n.x * sy1 + n.z * cy1, y = n.y * cx1 - z * sx1;
        z = n.y * sx1 + z * cx1;
        const sc = 1.6 / (2.4 - z);
        return { sx: cx + x * R * sc, sy: cy + y * R * sc, sc, z };
      };
      const P = s.nodes.map(proj);

      // edges
      s.edges = s.edges.filter((e) => e.life > 0.02);
      s.edges.forEach((e) => {
        const a = P[e.a], b = P[e.b];
        const na = s.nodes[e.a], nb = s.nodes[e.b];
        if (e.dying) e.life *= 0.9;
        const hot = Math.max(na.pulse, nb.pulse), red = Math.max(na.red, nb.red);
        const depth = (a.z + b.z) / 2;
        const alpha = (0.05 + 0.22 * Math.max(0, depth)) * e.aff * e.life;
        ctx.beginPath();
        if (e.dying) {
          const mx = (a.sx + b.sx) / 2 + (1 - e.life) * 26 * (Math.random() - 0.5);
          const my = (a.sy + b.sy) / 2 + (1 - e.life) * 44;
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(mx, my);
          ctx.strokeStyle = `rgba(229,52,43,${alpha * 2.2})`;
        } else {
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.strokeStyle = red > 0.2 ? `rgba(229,52,43,${alpha + red * 0.25})`
            : hot > 0.2 ? `rgba(255,255,255,${alpha + hot * 0.4})`
            : `rgba(190,190,205,${alpha})`;
        }
        ctx.lineWidth = (hot > 0.2 ? 1.4 : 0.7) * dpr * 0.8;
        ctx.stroke();
      });

      // nodes back→front
      P.map((p, i) => ({ p, i })).sort((q, r) => q.p.z - r.p.z).forEach(({ p, i }) => {
        const n = s.nodes[i];
        n.pulse *= 0.94; n.red *= 0.955;
        const w = Math.abs(weights[n.tag] || 0.06);
        const depth = Math.max(0.15, (p.z + 1) / 2);
        const fs = (9 + w * 15 + n.pulse * 4) * p.sc * dpr * 0.75;
        ctx.font = `${n.pulse > 0.3 ? "700" : "400"} ${fs}px Menlo, monospace`;
        ctx.fillStyle = n.red > 0.15 ? `rgba(229,52,43,${0.35 + n.red * 0.65})`
          : n.pulse > 0.15 ? `rgba(255,255,255,${0.55 + n.pulse * 0.45})`
          : `rgba(226,223,215,${0.18 + depth * 0.5 + w * 0.3})`;
        ctx.textAlign = "center";
        ctx.fillText(n.tag, p.sx, p.sy);
        if (n.pulse > 0.4) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy + 4, (12 + n.pulse * 24) * p.sc * dpr * 0.5, 0, 7);
          ctx.strokeStyle = `rgba(255,255,255,${n.pulse * 0.25})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [weights, recent, forgotten, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height, display: "block", cursor: "grab",
               background: "radial-gradient(ellipse at 50% 40%, #141418 0%, #0a0a0b 70%)" }}
    />
  );
}
