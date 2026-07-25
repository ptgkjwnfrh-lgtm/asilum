"use client";

// app/components/PassportSecurity.jsx — UV security artwork for the PASSPORT
// document (redesign/passport-uv), color-matched to the OS tokens.
//
// Owner iteration 4: the hologram is the ACTUAL PARIS ROAD MAP around the
// Place de l'Étoile — the twelve real avenues at their true bearings, the
// Tilsitt/Presbourg ring, and the real named streets of the 8th/16th/17th
// (George V, Montaigne, Haussmann, Courcelles, Lauriston, Malakoff…) — and
// it runs ACROSS THE ENTIRE PASSPORT: low-opacity with a slight glow behind
// the data page, full-opacity with heavy glow in the open lower window.
// RED ASTERISKS mark only the squares where five or more streets truly
// meet: l'Étoile, Ternes, Victor Hugo, Alma, Rond-Point des Champs-Élysées.
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

// ---- Paris, Place de l'Étoile district — real topology ------------------
const DEG = Math.PI / 180;
const E = [430, 290]; // Place Charles-de-Gaulle (l'Étoile)
const P = (r, deg) => [
  +(E[0] + Math.cos(deg * DEG) * r).toFixed(1),
  +(E[1] + Math.sin(deg * DEG) * r).toFixed(1),
];

// The twelve avenues, screen bearings matched to the real map (north up):
// Friedland E, Champs-Élysées SE, Marceau SSE, Iéna S, Kléber SSW,
// Victor-Hugo SW, Foch W (the wide one), Grande-Armée WNW, Carnot NW,
// Mac-Mahon NNW, Wagram NNE, Hoche NE.
const AVE = [
  { name: "FRIEDLAND", deg: 5, len: 230 },
  { name: "AV. DES CHAMPS-ÉLYSÉES", deg: 35, len: 620, label: 195 },
  { name: "MARCEAU", deg: 66, len: 262 },
  { name: "IÉNA", deg: 95, len: 340 },
  { name: "AV. KLÉBER", deg: 122, len: 360, label: 175 },
  { name: "AV. VICTOR-HUGO", deg: 150, len: 420, label: 130 },
  { name: "AV. FOCH", deg: 178, len: 380, label: 170, wide: true },
  { name: "AV. DE LA GRANDE-ARMÉE", deg: 197, len: 384, label: 220 },
  { name: "CARNOT", deg: 225, len: 250 },
  { name: "MAC-MAHON", deg: 252, len: 240 },
  { name: "AV. DE WAGRAM", deg: 282, len: 300, label: 150 },
  { name: "HOCHE", deg: 312, len: 330 },
];

// Real squares that are genuine 5+-way intersections — the only points
// that earn a red asterisk (l'Étoile itself is a 12-way).
const ETOILE = E;
const RP = P(250, 35);     // Rond-Point des Champs-Élysées (6 ways)
const ALMA = P(262, 66);   // Place de l'Alma (5 ways + bridge)
const PVH = P(190, 150);   // Place Victor-Hugo (6 ways)
const TERNES = P(205, 282); // Place des Ternes (6 ways)
const PM = P(384, 197);    // Porte Maillot (avenue terminal — no star)

// Named secondary streets (polylines), real connections:
const STREETS = [
  [[553, 376], ALMA],                      // Av. George V: Champs → Alma
  [RP, ALMA],                              // Av. Montaigne: Rond-Point → Alma
  [[700, 330], RP, [575, 540]],            // Av. Franklin-D.-Roosevelt through RP
  [RP, [720, 370]],                        // Av. Matignon
  [[360, 562], ALMA, [800, 480]],          // Cours Albert-1er / quays through Alma
  [ALMA, [545, 600]],                      // Pont de l'Alma
  [PVH, [330, 590]],                       // Av. Raymond-Poincaré → Trocadéro
  [PVH, [140, 352]],                       // Av. Bugeaud
  [PVH, [340, 434]],                       // Rue Copernic → Kléber
  [[75, 195], [160, 540]],                 // Av. Malakoff
  [[383, 345], [305, 580]],                // Rue Lauriston
  [[285, 105], TERNES, [660, 72]],         // Av. des Ternes through the place
  [[350, 140], TERNES, [640, 28]],         // Bd de Courcelles through the place
  [TERNES, [600, 190], [700, 260]],        // Rue du Faubourg-Saint-Honoré
  [[659, 310], [1000, 255]],               // Bd Haussmann off Friedland
  [[40, 110], [230, 85]],                  // Bd Pereire
  [[25, 255], PM, [120, 90]],              // Bd Gouvion-Saint-Cyr through Maillot
];

// Block fabric: short connecting streets between neighbouring avenues at
// staggered, unequal radii — irregular Haussmann blocks, fixed arithmetic.
const FABRIC = [];
for (let i = 0; i < 12; i++) {
  const a1 = AVE[i].deg + 7;
  const a2 = AVE[(i + 1) % 12].deg - 7 + (i === 11 ? 360 : 0);
  for (let k = 0; k < 5; k++) {
    if ((i * 5 + k) % 7 === 0) continue;
    const r1 = 78 + k * 68 + ((i * 37 + k * 19) % 34);
    const r2 = r1 + ((i * 13 + k * 29) % 44) - 22;
    FABRIC.push([P(r1, a1), P(r2, a2)]);
    // subdividing half-block streets deepen the outer fabric
    if ((i + k) % 2 === 0) {
      const mid = (AVE[i].deg + (AVE[(i + 1) % 12].deg + (i === 11 ? 360 : 0))) / 2;
      FABRIC.push([P(r1 + 12, a1 + 3), P(r2 + 26, mid)]);
    }
  }
}

const STARS = [
  { at: ETOILE, r: 13 },
  { at: RP, r: 7 }, { at: ALMA, r: 7 }, { at: PVH, r: 7 }, { at: TERNES, r: 7 },
];

function Star({ x, y, r }) {
  const arms = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 30 * DEG;
    arms.push(`M ${(x - Math.cos(a) * r).toFixed(1)} ${(y - Math.sin(a) * r).toFixed(1)} L ${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`);
  }
  return <path d={arms.join(" ")} />;
}

function ParisMap() {
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
      <g className="pvroad-minor">
        {FABRIC.map(([[x1, y1], [x2, y2]], i) => (
          <line key={"f" + i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
        {STREETS.map((pts, i) => (
          <polyline key={"s" + i} points={pts.map((p) => p.join(",")).join(" ")} strokeWidth="1.1" />
        ))}
      </g>
      <g className="pvroad-major">
        {AVE.map((av) => {
          const [x1, y1] = P(28, av.deg);
          const [x2, y2] = P(av.len, av.deg);
          return <line key={av.deg} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={av.wide ? 4.5 : 2} />;
        })}
        <circle cx={E[0]} cy={E[1]} r="26" fill="none" />
        <circle cx={E[0]} cy={E[1]} r="60" fill="none" strokeWidth="1.3" />
      </g>
      {AVE.filter((av) => av.label).map((av) => {
        const flip = av.deg > 90 && av.deg < 270;
        const [x, y] = P(av.label, av.deg);
        return (
          <text key={av.name} className="pvparislbl" x={x} y={y - 5} textAnchor="middle"
            transform={`rotate(${flip ? av.deg + 180 : av.deg} ${x} ${y})`}>
            {av.name}
          </text>
        );
      })}
      <g className="pvistar">
        {STARS.map(({ at: [x, y], r }, i) => <Star key={i} x={x} y={y} r={r} />)}
      </g>
    </svg>
  );
}

export default function PassportSecurity({ topTag, topWeight }) {
  const summit = topTag
    ? `${Math.round(Math.abs(topWeight) * 100)} ${String(topTag).toUpperCase()}`
    : "UNCHARTED";
  return (
    <>
      {/* the hologram spans the whole document: dim layer everywhere,
          hot layer masked to the lower window */}
      <div className="ppholo" aria-hidden="true">
        <div className="ppholo-a"><ParisMap /></div>
        <div className="ppholo-b"><ParisMap /></div>
      </div>

      {/* overlay: registration crosses + page numeral over the header */}
      <div className="ppuv" aria-hidden="true">
        <svg className="ppuvcross" viewBox="0 0 1000 60" preserveAspectRatio="none">
          {CROSSES.map(([x, y, s, tone], i) => <Plus key={i} x={x} y={y} s={s} tone={tone} />)}
        </svg>
        <span className="ppvpage">01</span>
      </div>

      {/* microprint band — the issuer, repeated small, like security print */}
      <div className="ppmicro" aria-hidden="true">
        {("*ASILUM · FASHION INTELLIGENCE OS · ").repeat(24)}
      </div>

      {/* open window where the hologram burns at full strength */}
      <div className="ppterrain" aria-hidden="true">
        <span className="ppsummit">▲ {summit}</span>
      </div>
    </>
  );
}
