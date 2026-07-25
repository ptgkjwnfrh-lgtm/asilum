"use client";

// app/components/PassportSecurity.jsx — UV security artwork for the PASSPORT
// document (redesign/passport-uv), color-matched to the OS tokens.
//
// Owner iteration 3: the hologram is the PARIS STREETS FROM SATELLITE —
// Place de l'Étoile: twelve avenues radiating from the Arc, the
// Tilsitt/Presbourg ring, and the Haussmann block fabric between, drawn as
// glowing hairline streets. Red asterisks sit in a few intersections — and
// one at the Arc itself, because Place de l'Étoile means Star Square.
//
// Everything here is decoration EXCEPT the summit marker, which is real
// state: the bearer's strongest conviction annotates the map.

// Registration crosses over the header area: [x, y, size, tone]
const CROSSES = [
  [30, 16, 7, "r"], [96, 34, 5, "s"], [168, 10, 9, "r"], [235, 40, 6, "p"],
  [310, 18, 5, "s"], [382, 46, 8, "r"], [448, 12, 6, "p"], [520, 36, 10, "r"],
  [585, 20, 5, "s"], [648, 44, 7, "r"], [716, 14, 6, "p"], [788, 38, 9, "r"],
  [850, 22, 5, "s"], [912, 44, 6, "r"], [962, 12, 7, "p"],
];

function Plus({ x, y, s = 5, tone = "s" }) {
  return (
    <path
      className={"pvplus pv-" + tone}
      d={`M ${x - s} ${y} H ${x + s} M ${x} ${y - s} V ${y + s}`}
    />
  );
}

// ---- Place de l'Étoile, deterministic geometry ---------------------------
const CX = 500, CY = 170, DEG = Math.PI / 180;
const P = (r, a) => [
  +(CX + Math.cos(a) * r).toFixed(1),
  +(CY + Math.sin(a) * r).toFixed(1),
];
// Twelve avenues every 30°, offset like the photo. Named ones (real layout,
// approximate bearings): 0 Champs-Élysées, 3 Kléber, 6 Grande Armée,
// 7 Foch (the wide one), 10 Wagram.
const AVE = Array.from({ length: 12 }, (_, i) => (15 + i * 30) * DEG);
const R_HUB = 32, R_RING = 82, R_EDGE = 430;

const AVENUES = AVE.map((a, i) => ({ a: P(R_HUB, a), b: P(R_EDGE, a), foch: i === 7 }));

// Haussmann fabric: chords between adjacent avenues at staggered radii,
// plus radial spurs subdividing the outer blocks. All offsets are fixed
// arithmetic — same map every render.
const CHORDS = [];
for (let i = 0; i < 12; i++) {
  const base = [64, 95, 118, 148, 178, 214, 252, 290, 330, 372];
  base.forEach((r, k) => {
    if ((i * 3 + k) % 7 === 0) return; // leave gaps — the fabric is irregular
    const rr = r + ((i * 37 + k * 53) % 24) - 12;
    // alternate full-sector chords with half-sector ones for block variety
    const [a1, a2] = (i + k) % 3 === 0
      ? [AVE[i] + 5 * DEG, AVE[i] + 15 * DEG]
      : [AVE[i] + 5 * DEG, AVE[i] + 25 * DEG];
    CHORDS.push([P(rr, a1), P(rr, a2)]);
  });
}
const SPURS = [];
for (let i = 0; i < 12; i++) {
  const mid = AVE[i] + 15 * DEG;
  SPURS.push([P(i % 2 ? 132 + ((i * 41) % 46) : 200 + ((i * 29) % 60), mid), P(R_EDGE, mid)]);
}

// Street labels — the real avenues, machine-annotated.
const LABELS = [
  { text: "AV. DES CHAMPS-ÉLYSÉES", i: 0, r: 258 },
  { text: "AV. KLÉBER", i: 3, r: 210 },
  { text: "AV. DE LA GRANDE ARMÉE", i: 6, r: 262 },
  { text: "AV. FOCH", i: 7, r: 205 },
  { text: "AV. DE WAGRAM", i: 10, r: 225 },
];

// Red asterisks seated in intersections: the ring × four avenues — and the
// Arc itself at the centre of the star.
const STARS = [1, 4, 7, 10].map((i) => ({ at: P(R_RING, AVE[i]), r: 7 }));

function Star({ x, y, r }) {
  const arms = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 30 * DEG;
    arms.push(`M ${(x - Math.cos(a) * r).toFixed(1)} ${(y - Math.sin(a) * r).toFixed(1)} L ${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`);
  }
  return <path d={arms.join(" ")} />;
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

      {/* hologram: Place de l'Étoile from above, streets as phosphor lines */}
      <div className="ppterrain" aria-hidden="true">
        <svg viewBox="0 0 1000 340" preserveAspectRatio="xMidYMid slice">
          {/* block fabric first — dimmer, under the avenues */}
          <g className="pvparis-minor">
            {CHORDS.map(([[x1, y1], [x2, y2]], i) => (
              <line key={"c" + i} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
            {SPURS.map(([[x1, y1], [x2, y2]], i) => (
              <line key={"s" + i} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
          {/* the étoile: avenues, ring, roundabout */}
          <g className="pvparis-major">
            {AVENUES.map(({ a: [x1, y1], b: [x2, y2], foch }, i) => (
              <line key={"a" + i} x1={x1} y1={y1} x2={x2} y2={y2}
                strokeWidth={foch ? 4 : 2.2} />
            ))}
            <circle cx={CX} cy={CY} r={R_HUB} fill="none" />
            <circle cx={CX} cy={CY} r={R_RING} fill="none" strokeWidth="1.5" />
          </g>
          {/* real avenue names, machine-annotated */}
          {LABELS.map(({ text, i, r }) => {
            const deg = 15 + i * 30;
            const flip = deg > 90 && deg < 270;
            const [x, y] = P(r, AVE[i]);
            return (
              <text key={text} className="pvparislbl" x={x} y={y - 4}
                textAnchor="middle"
                transform={`rotate(${flip ? deg + 180 : deg} ${x} ${y})`}>
                {text}
              </text>
            );
          })}
          {/* red asterisks in the intersections — and the Arc: the star itself */}
          <g className="pvistar">
            {STARS.map(({ at: [x, y], r }, i) => <Star key={i} x={x} y={y} r={r} />)}
            <Star x={CX} y={CY} r={13} />
          </g>
        </svg>
        <span className="ppsummit">▲ {summit}</span>
      </div>
    </>
  );
}
