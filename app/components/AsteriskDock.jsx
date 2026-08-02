"use client";

// app/components/AsteriskDock.jsx — ASTERISK's living form: rotating
// asterisk with colour cores in MODULE RAIL, a breathing orb in ORB HUB.
// Pure canvas, respects prefers-reduced-motion. Extracted from the shell
// (redesign/upload-station) so the engine can also live on /upload.
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
    let raf = 0;
    let t = 0;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const frame = () => {
      t += 0.014;
      const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = W * 0.36;
      const orb = document.documentElement.dataset.model === "02";
      x.clearRect(0, 0, W, H);
      const cols = [css("--sig"), css("--p2"), "#5fd8e8", css("--red")];
      if (orb) {
        const rr = R * (0.9 + Math.sin(t * 1.4) * 0.1);
        const g = x.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, rr);
        g.addColorStop(0, "rgba(255,255,255,.85)");
        g.addColorStop(0.35, css("--sig"));
        g.addColorStop(1, "rgba(0,0,0,.15)");
        x.fillStyle = g; x.shadowColor = css("--sig"); x.shadowBlur = 16;
        x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
        for (let i = 0; i < 6; i++) {
          const a = t * 1.2 + i * 1.05;
          x.fillStyle = "rgba(255,255,255,.8)";
          x.beginPath(); x.arc(cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.5, 1.8, 0, Math.PI * 2); x.fill();
        }
      } else {
        x.save(); x.translate(cx, cy); x.rotate(-t * 0.35);
        x.strokeStyle = css("--grey"); x.setLineDash([4, 7]); x.lineWidth = 1.4;
        x.beginPath(); x.arc(0, 0, R * 1.08, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); x.restore();
        x.save(); x.translate(cx, cy); x.rotate(t * 0.5);
        x.strokeStyle = css("--ink"); x.lineWidth = 3.2; x.lineCap = "round";
        x.shadowColor = css("--sig"); x.shadowBlur = 10;
        for (let i = 0; i < 6; i++) {
          x.rotate(Math.PI / 3);
          const w = R * (0.98 + Math.sin(t * 2 + i) * 0.07);
          x.beginPath(); x.moveTo(0, -R * 0.2); x.lineTo(0, -w); x.stroke();
        }
        x.shadowBlur = 0; x.restore();
        cols.forEach((c, i) => {
          const a = t * (1.1 + i * 0.3) + i * 1.57;
          const r = R * (0.5 + 0.3 * Math.sin(t * 0.7 + i * 2));
          x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 8;
          x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, 2.8, 0, Math.PI * 2); x.fill();
          x.shadowBlur = 0;
        });
      }
      if (!rm) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className={className}>
      <canvas ref={canvasRef} width={size} height={size} aria-hidden="true" />
      <div className="t">*ASTERISK<br /><b>{state}</b></div>
    </div>
  );
}
