"use client";

// app/components/PassportSecurity.jsx — UV security artwork for the PASSPORT
// document (redesign/passport-uv). Modeled on a passport photo page under UV
// light: registration crosses, a plus-pattern mountain ridge, glowing
// topographic contours, microprint bands — color-matched to the OS tokens.
//
// The constellation layer is the owner's spec: a geometric array of thin
// lines with plus marks scattered through it; the drawn connecting lines
// trace THREE ASTERISKS (red — the ASTERISK identity) hidden in the field,
// the way a hologram hides the issuer's mark.
//
// Everything here is decoration EXCEPT the summit marker, which is real
// state: the bearer's strongest conviction (top brain weight) labels the
// highest peak. No invented data anywhere.

// ---- deterministic geometry (no randomness — stable across renders/SSR) ----

// Registration crosses over the header area: [x, y, size, tone]
const CROSSES = [
  [30, 16, 7, "r"], [96, 34, 5, "s"], [168, 10, 9, "r"], [235, 40, 6, "p"],
  [310, 18, 5, "s"], [382, 46, 8, "r"], [448, 12, 6, "p"], [520, 36, 10, "r"],
  [585, 20, 5, "s"], [648, 44, 7, "r"], [716, 14, 6, "p"], [788, 38, 9, "r"],
  [850, 22, 5, "s"], [912, 44, 6, "r"], [962, 12, 7, "p"],
];

// One wobbly topographic ring as an SVG path (sin-perturbed ellipse).
function ring(cx, cy, r, seed) {
  const pts = [];
  const N = 56;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wob =
      Math.sin(a * 3 + seed) * 0.16 +
      Math.sin(a * 5 + seed * 2.7) * 0.09 +
      Math.sin(a * 8 + seed * 1.3) * 0.05;
    const rr = r * (1 + wob);
    pts.push(`${(cx + Math.cos(a) * rr * 1.7).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return "M" + pts.join(" L") + " Z";
}

// Two contour nuclei — a main summit and a secondary rise, like the inspo map.
const CONTOURS = [];
for (let i = 0; i < 7; i++) CONTOURS.push({ d: ring(640, 168, 22 + i * 26, 1.7 + i), tone: i % 3 === 2 ? "p" : "s" });
for (let i = 0; i < 5; i++) CONTOURS.push({ d: ring(210, 226, 18 + i * 24, 4.1 + i), tone: i % 3 === 1 ? "p" : "s" });

// Three hidden asterisks: 6 spokes each; plus marks sit at every spoke tip
// and centre, and the drawn diameter lines connect them into the figure.
function asterisk(cx, cy, r, rot) {
  const tips = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + rot;
    tips.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const lines = [0, 1, 2].map((i) => [tips[i], tips[i + 3]]);
  return { cx, cy, tips, lines };
}
const ASTERISKS = [
  asterisk(330, 120, 46, 0.26),
  asterisk(560, 240, 54, 0.62),
  asterisk(810, 110, 40, 0.05),
];

// Decoy plus marks scattered through the line array — part of the field,
// connected to nothing.
const DECOYS = [
  [60, 60, "s"], [130, 150, "p"], [180, 60, "s"], [260, 250, "s"], [300, 300, "p"],
  [420, 60, "s"], [455, 180, "p"], [500, 90, "s"], [640, 300, "s"], [700, 200, "p"],
  [745, 285, "s"], [880, 220, "s"], [930, 60, "p"], [950, 160, "s"], [90, 290, "s"],
  [370, 210, "p"], [610, 60, "s"], [860, 300, "p"],
];

// The faint geometric web behind the constellation: chords between decoys.
const WEB = [
  [0, 2], [2, 5], [5, 7], [7, 16], [16, 9], [9, 11], [11, 13], [13, 12],
  [1, 3], [3, 15], [15, 6], [6, 8], [8, 10], [10, 17], [4, 14], [14, 3],
];

function Plus({ x, y, s = 5, tone = "s" }) {
  return (
    <path
      className={"pvplus pv-" + tone}
      d={`M ${x - s} ${y} H ${x + s} M ${x} ${y - s} V ${y + s}`}
    />
  );
}

export default function PassportSecurity({ topTag, topWeight }) {
  const summit = topTag
    ? `${Math.round(Math.abs(topWeight) * 100)} ${String(topTag).toUpperCase()}`
    : "UNCHARTED";
  return (
    <>
      {/* overlay: registration crosses + plus-pattern ridge over the header */}
      <div className="ppuv" aria-hidden="true">
        <svg className="ppuvcross" viewBox="0 0 1000 60" preserveAspectRatio="none">
          {CROSSES.map(([x, y, s, tone], i) => <Plus key={i} x={x} y={y} s={s} tone={tone} />)}
        </svg>
        <svg className="ppuvridge" viewBox="0 0 520 150" preserveAspectRatio="xMaxYMax meet">
          <defs>
            <pattern id="pvpat" width="26" height="22" patternUnits="userSpaceOnUse">
              <path className="pvplus pv-s" d="M 8 11 H 18 M 13 6 V 16" />
            </pattern>
            <clipPath id="pvridgeclip">
              <polygon points="60,150 170,64 240,96 330,18 420,70 520,34 520,150" />
            </clipPath>
          </defs>
          <rect width="520" height="150" fill="url(#pvpat)" clipPath="url(#pvridgeclip)" />
          <polyline className="pvridgeline" points="60,150 170,64 240,96 330,18 420,70 520,34" />
        </svg>
        <span className="ppvpage">01</span>
      </div>

      {/* microprint band — the issuer, repeated small, like security print */}
      <div className="ppmicro" aria-hidden="true">
        {("*ASILUM · FASHION INTELLIGENCE OS · ").repeat(24)}
      </div>

      {/* terrain: contour map + the three-asterisk constellation */}
      <div className="ppterrain" aria-hidden="true">
        <svg viewBox="0 0 1000 340" preserveAspectRatio="xMidYMid slice">
          {CONTOURS.map((c, i) => (
            <path key={"c" + i} className={"pvcontour pv-" + c.tone} d={c.d} />
          ))}
          {WEB.map(([a, b], i) => (
            <line
              key={"w" + i} className="pvweb"
              x1={DECOYS[a][0]} y1={DECOYS[a][1]} x2={DECOYS[b][0]} y2={DECOYS[b][1]}
            />
          ))}
          {DECOYS.map(([x, y, tone], i) => <Plus key={"d" + i} x={x} y={y} tone={tone} />)}
          {ASTERISKS.map((a, i) => (
            <g key={"a" + i}>
              {a.lines.map(([[x1, y1], [x2, y2]], j) => (
                <line key={j} className="pvastline" x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
              {a.tips.map(([x, y], j) => <Plus key={"t" + j} x={x} y={y} s={4} tone="r" />)}
              <Plus x={a.cx} y={a.cy} s={4} tone="r" />
            </g>
          ))}
        </svg>
        <span className="ppsummit">▲ {summit}</span>
      </div>
    </>
  );
}
