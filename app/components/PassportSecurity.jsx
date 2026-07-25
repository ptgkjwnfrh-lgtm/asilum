"use client";

// app/components/PassportSecurity.jsx — UV security artwork for the PASSPORT
// document (redesign/passport-uv). Modeled on a passport photo page under UV
// light, color-matched to the OS tokens.
//
// Owner iteration 2: the holographic layer is now OVERLAPPING THIN-LINE
// PATTERN CUTOUTS — silhouettes (mountain ranges, three asterisks) cut out
// of hairline fills that stack over each other with a stronger glow. The
// three asterisks stay red: the ASTERISK identity hidden in the hologram.
//
// Everything here is decoration EXCEPT the summit marker, which is real
// state: the bearer's strongest conviction labels the highest peak.

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

// A six-armed asterisk silhouette cut from a thin-line pattern fill.
function AsteriskCut({ cx, cy, r, w, rot, fill, cls }) {
  return (
    <g className={cls} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      {[0, 60, 120].map((a) => (
        <rect key={a} x={-r} y={-w / 2} width={r * 2} height={w} rx={w / 2}
          transform={`rotate(${a})`} fill={fill} />
      ))}
    </g>
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

      {/* terrain: overlapping thin-line pattern cutouts under stronger glow */}
      <div className="ppterrain" aria-hidden="true">
        <svg viewBox="0 0 1000 340" preserveAspectRatio="xMidYMid slice">
          <defs>
            {/* hairline fills: horizontal / diagonal / wave */}
            <pattern id="pvhairh" width="8" height="5" patternUnits="userSpaceOnUse">
              <path className="pvhair pv-s" d="M 0 2.5 H 8" />
            </pattern>
            <pattern id="pvhaird" width="7" height="7" patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)">
              <path className="pvhair pv-p" d="M 0 3.5 H 7" />
            </pattern>
            <pattern id="pvwave" width="14" height="7" patternUnits="userSpaceOnUse">
              <path className="pvhair pv-r" d="M 0 3.5 Q 3.5 0 7 3.5 T 14 3.5" />
            </pattern>
          </defs>

          {/* two mountain-range cutouts, offset so they overlap */}
          <polygon className="pvcut pvglow-s" fill="url(#pvhairh)"
            points="0,340 150,150 290,235 460,70 640,205 815,100 1000,195 1000,340" />
          <polygon className="pvcut pvglow-p" fill="url(#pvhaird)"
            points="0,340 110,235 250,305 430,160 620,275 800,165 1000,270 1000,340" />

          {/* three asterisk cutouts stacked over the ranges and each other */}
          <AsteriskCut cx={335} cy={150} r={95} w={17} rot={12} fill="url(#pvwave)" cls="pvcut pvglow-r" />
          <AsteriskCut cx={530} cy={215} r={130} w={20} rot={38} fill="url(#pvwave)" cls="pvcut pvglow-r" />
          <AsteriskCut cx={760} cy={135} r={82} w={15} rot={64} fill="url(#pvwave)" cls="pvcut pvglow-r" />
        </svg>
        <span className="ppsummit">▲ {summit}</span>
      </div>
    </>
  );
}
