// lib/passport/badges.js — THE SHAPES of the Passport's stamps (owner, 3 Nov 2026: "make the stamps
// different shapes in relation to what they mean … semi resemble the apple fitness badges"). Each meaning has
// its own silhouette, every one drawn in a 120 × 120 box centred on (60, 60) and returned as one SVG path,
// so the visa page, the space zone's extrusion and the tests all read the same geometry:
//   a purchase       a luggage tag          international   a globe (the meridians are the emblem)
//   followers        a polygon that gains sides with the tier — 100 a triangle … 1M a sixteen-point star
//   a steal          a cut gem              a wardrobe buy  a hanger
//   an archive piece an arch                a Japanese house a crest's rosette
//   an LVMH house    a quatrefoil           a concert       a ticket stub
//   first collection the house's asterisk   taste defined   a lens
//   first transmission a signal's pennant
// Pure geometry — no DOM.

const C = 60;
const f = (n) => +n.toFixed(2);
const pt = (r, a) => `${f(C + Math.cos(a) * r)},${f(C + Math.sin(a) * r)}`;

export function polygon(n, r = 54, rot = -Math.PI / 2) {
  const p = [];
  for (let i = 0; i < n; i++) p.push(pt(r, rot + (i / n) * Math.PI * 2));
  return "M" + p.join(" L") + " Z";
}
export function star(n, r = 56, ri = 44, rot = -Math.PI / 2) {
  const p = [];
  for (let i = 0; i < n * 2; i++) p.push(pt(i % 2 ? ri : r, rot + (i / (n * 2)) * Math.PI * 2));
  return "M" + p.join(" L") + " Z";
}
export function circle(r = 54) {
  return `M${C - r},${C} A${r},${r} 0 1 0 ${C + r},${C} A${r},${r} 0 1 0 ${C - r},${C} Z`;
}
function scallop(n, r = 50, bump = 8) { // a rosette: n round lobes on a circle
  const p = [], step = (Math.PI * 2) / n;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step, a1 = a0 + step;
    const s = pt(r, a0), e = pt(r, a1);
    if (!i) d += "M" + s;
    d += ` A${f(bump + (r * step) / 2.2)},${f(bump + (r * step) / 2.2)} 0 0 1 ${e}`;
    p.push(e);
  }
  return d + " Z";
}

export const SHAPES = Object.freeze({
  tag: "M30,10 H90 L106,26 V104 Q106,110 100,110 H20 Q14,110 14,104 V26 Z",
  globe: circle(54),
  gem: "M34,16 H86 L108,42 L60,108 L12,42 Z",
  hanger: "M60,10 Q72,10 72,20 Q72,28 64,31 V36 L112,78 Q116,82 112,86 V92 Q112,98 106,98 H14 Q8,98 8,92 V86 Q4,82 8,78 L56,36 V28 Q66,26 66,20 Q66,16 60,16 Q54,16 54,20 H48 Q48,10 60,10 Z",
  arch: "M14,110 V54 A46,46 0 0 1 106,54 V110 Z",
  rosette: scallop(8, 46, 6),
  quatrefoil: "M60,8 A24,24 0 0 1 84,32 A24,24 0 0 1 112,60 A24,24 0 0 1 84,88 A24,24 0 0 1 60,112 A24,24 0 0 1 36,88 A24,24 0 0 1 8,60 A24,24 0 0 1 36,32 A24,24 0 0 1 60,8 Z",
  ticket: "M10,26 H110 V48 A12,12 0 0 0 110,72 V94 H10 V72 A12,12 0 0 0 10,48 Z",
  asterisk: star(8, 57, 38),
  lens: "M6,60 Q60,4 114,60 Q60,116 6,60 Z",
  pennant: "M14,14 H76 L108,60 L76,106 H14 L34,60 Z",
  tri: "M60,8 L113,100 L7,100 Z", // a triangle set on its base, its centre of area a little under the box's
  diamond: polygon(4, 56),
  pent: polygon(5, 56),
  hex: polygon(6, 55),
  oct: polygon(8, 55),
  dec: polygon(10, 55),
  star12: star(12, 57, 47),
  star16: star(16, 58, 49),
});

export function shapePath(shape) { return SHAPES[shape] || SHAPES.hex; }

// the port's code: the initials of three words or more; otherwise the first letter, the consonants after it,
// then its vowels if it is short, then X (BERGHAIN → BRG, PARIS FASHION WEEK → PFW)
export function stampCode(title) {
  const words = String(title || "").toUpperCase().normalize("NFD").replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "ASL";
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]).join("");
  const run = words.join("");
  const consonants = run.slice(1).replace(/[AEIOU]/g, ""), vowels = run.slice(1).replace(/[^AEIOU]/g, "");
  return (run[0] + consonants + vowels).slice(0, 3).padEnd(3, "X");
}
