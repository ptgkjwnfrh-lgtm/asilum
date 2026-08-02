"use client";

// app/components/AsteriskDock.jsx — ASTERISK's living form (owner decree,
// redesign/asterisk-hologram): an interactive 3D hologram entity built
// from exactly three layers —
//   1. the five-point asterisk core: blocky, dense, thick, strongest
//      glow (red, square-capped triple pass);
//   2. a body of color filling the shell, present but see-through;
//   3. the ASCII hologram shell: transparent character sphere whose
//      glyphs flash bright as it flickers,
// all under a classic sci-fi hologram treatment (scanline banding,
// flutter, a slow roll bar, the odd glitch slice). Drag to spin it; it
// keeps drifting with inertia. Pure canvas, no libraries. Same form in
// both interfaces; colors come from tokens so both themes hold.
// prefers-reduced-motion: one static frame, no ambient loop (drag still
// re-renders, user-initiated). This entity also replaced BrainViz (the
// floating-word taste sphere) on /stats and /upload.
// Optional props: size (canvas px), words (state cycle), className.

import { useEffect, useRef, useState } from "react";

export default function AsteriskDock({
  size = 104,
  words = ["THINKING", "INDEXING", "CORRELATING", "SCANNING", "WEIGHING"],
  className = "os-dock",
}) {
  const canvasRef = useRef(null);
  const [state, setState] = useState(words[0]);
  useEffect(() => {
    const iv = setInterval(() => setState(words[Math.floor(Math.random() * words.length)]), 3400);
    return () => clearInterval(iv);
  }, [words]);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const x = cv.getContext("2d");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    // ---- 3D point field: sphere shell + two tilted orbit rings ----
    const shell = [];
    const LATS = 7;
    for (let i = 1; i <= LATS; i++) {
      const phi = (i / (LATS + 1)) * Math.PI;
      const r = Math.sin(phi);
      const y = Math.cos(phi);
      const n = Math.max(6, Math.round(r * 22));
      for (let j = 0; j < n; j++) {
        const th = (j / n) * Math.PI * 2;
        shell.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, seed: Math.random() });
      }
    }
    // five arms of the inner asterisk (object space, point up)
    const ARMS = [];
    for (let k = 0; k < 5; k++) {
      const a = ((-90 + k * 72) * Math.PI) / 180;
      ARMS.push([Math.cos(a), Math.sin(a)]);
    }

    let yaw = 0.7;
    let pitch = -0.3;
    let vyaw = 0.0055;
    let vpitch = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let hover = 0;
    let raf = 0;
    let t = 0;

    const rot = (p, sy, cy2, sp, cp) => {
      const x1 = p.x * cy2 + p.z * sy;
      const z1 = -p.x * sy + p.z * cy2;
      const y1 = p.y * cp - z1 * sp;
      const z2 = p.y * sp + z1 * cp;
      return [x1, y1, z2];
    };

    const draw = () => {
      const W = cv.width;
      const H = cv.height;
      const cx = W / 2;
      const cyM = H / 2;
      const R = W * 0.3;
      const SIG = css("--sig");
      const RED = css("--red");
      const OSD = css("--osd") || "monospace";
      x.clearRect(0, 0, W, H);

      // hologram flutter: the whole projection breathes in brightness
      const flick = rm ? 1 : 0.78 + 0.22 * Math.abs(Math.sin(t * 9.1) * Math.sin(t * 3.7));
      const sy = Math.sin(yaw);
      const cy2 = Math.cos(yaw);
      const sp = Math.sin(pitch);
      const cp = Math.cos(pitch);
      x.textAlign = "center";
      x.textBaseline = "middle";

      // layer 3 — the ASCII shell: genuinely transparent at rest, with
      // individual glyphs flashing bright as the hologram flickers
      const drawPoint = (px2, py2, z, seed) => {
        const depth = (z + 1.3) / 2.6; // 0 back → 1 front
        const spark = Math.sin(t * 6 + seed * 47) > 0.9;
        const a = spark
          ? (0.55 + depth * 0.45) * flick
          : (0.04 + depth * 0.22) * flick * (0.85 + hover * 0.15);
        const ch = spark ? "*" : depth > 0.6 ? "*" : depth > 0.4 ? "+" : seed > 0.5 ? "·" : ":";
        x.globalAlpha = Math.min(1, a);
        x.fillStyle = SIG;
        x.font = `${Math.max(6, W * 0.07 * (0.75 + depth * 0.45))}px ${OSD}`;
        x.fillText(ch, px2, py2);
      };

      // back hemisphere first, inner asterisk, then front — so the glyph
      // reads as INSIDE the transparent shell
      const projected = [];
      for (const p of shell) {
        const [X1, Y1, Z1] = rot(p, sy, cy2, sp, cp);
        projected.push([cx + X1 * R, cyM - Y1 * R, Z1, p.seed]);
      }
      for (const pr of projected) if (pr[2] < 0) drawPoint(...pr);

      // layer 2 — the body of color: big and present, filling the shell
      // so the core has room to breathe inside it
      const br = R * (0.98 + Math.sin(t * 1.1) * 0.03);
      const body = x.createRadialGradient(cx - br * 0.2, cyM - br * 0.25, br * 0.1, cx, cyM, br);
      body.addColorStop(0, SIG);
      body.addColorStop(0.7, SIG);
      body.addColorStop(1, "rgba(0,0,0,0)");
      x.save();
      x.globalAlpha = (0.32 + hover * 0.08) * flick;
      x.fillStyle = body;
      x.beginPath();
      x.arc(cx, cyM, br, 0, Math.PI * 2);
      x.fill();
      x.restore();

      // layer 1 — the five-point asterisk core: blocky, dense, thick —
      // square-capped triple pass, strongest glow on the entity; red,
      // the only accent voice; slow counter-rotation
      const aspin = -t * 0.35;
      const tips = ARMS.map(([ax, ay]) => {
        const p = { x: ax * Math.cos(aspin), y: -ay, z: ax * Math.sin(aspin) };
        return rot({ x: p.x * 0.62, y: p.y * 0.62, z: p.z * 0.62 }, sy, cy2, sp, cp);
      });
      const strokeArms = (width, alpha, blur) => {
        x.globalAlpha = alpha;
        x.lineWidth = width;
        x.shadowBlur = blur;
        x.beginPath();
        for (const [X1, Y1] of tips) {
          x.moveTo(cx, cyM);
          x.lineTo(cx + X1 * R, cyM - Y1 * R);
        }
        x.stroke();
      };
      x.save();
      x.strokeStyle = RED;
      x.shadowColor = RED;
      x.lineCap = "square";
      strokeArms(Math.max(5, W * 0.15), 0.22 * flick, W * 0.16); // halo pass
      strokeArms(Math.max(4, W * 0.1), 0.6 * flick, W * 0.1); // density pass
      strokeArms(Math.max(3, W * 0.065), (0.98 + hover * 0.02) * flick, W * 0.06); // blocky core
      x.restore();

      for (const pr of projected) if (pr[2] >= 0) drawPoint(...pr);
      x.globalAlpha = 1;

      // ---- classic hologram treatment ----
      // scanline banding: thin every other band regardless of theme
      x.globalCompositeOperation = "destination-out";
      x.fillStyle = "rgba(0,0,0,0.32)";
      for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 1.5);
      // slow roll bar brightening what it crosses
      if (!rm) {
        x.globalCompositeOperation = "source-atop";
        const ry = ((t * 26) % (H + 30)) - 15;
        x.fillStyle = "rgba(255,255,255,0.15)";
        x.fillRect(0, ry, W, H * 0.09);
      }
      x.globalCompositeOperation = "source-over";
      // the odd glitch: a horizontal slice slips sideways for a beat
      if (!rm && Math.sin(t * 1.3) > 0.995) {
        const gy = (t * 173) % (H * 0.8);
        x.drawImage(cv, 0, gy, W, H * 0.06, W * 0.035, gy, W, H * 0.06);
      }
    };

    const frame = () => {
      t += 0.014;
      if (!dragging) {
        yaw += vyaw;
        pitch += vpitch;
        vyaw += (0.0055 - vyaw) * 0.01; // inertia settles back to idle drift
        vpitch *= 0.95;
        pitch = Math.max(-1.2, Math.min(1.2, pitch));
      }
      draw();
      raf = requestAnimationFrame(frame);
    };

    // ---- interaction: drag to spin, inertia on release ----
    const down = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (dragging) {
        const k = 1 / (cv.getBoundingClientRect().width || 1);
        vyaw = (e.clientX - lastX) * k * 4 * 0.06;
        vpitch = (e.clientY - lastY) * k * 4 * 0.06;
        yaw += (e.clientX - lastX) * k * 4;
        pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - lastY) * k * 4));
        lastX = e.clientX;
        lastY = e.clientY;
        if (rm) draw();
      }
    };
    const up = () => { dragging = false; };
    const enter = () => { hover = 1; };
    const leave = () => { hover = 0; };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerenter", enter);
    cv.addEventListener("pointerleave", leave);

    if (rm) draw();
    else frame();
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerenter", enter);
      cv.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        aria-hidden="true"
        className="os-holo"
      />
      <div className="t">*ASTERISK<br /><b>{state}</b></div>
    </div>
  );
}
