// scripts/store-assets.mjs — THE STORE'S PICTURES, drawn from the wordmark (the store shell, 30 Oct 2026): the
// app icons and splashes of the iOS and Android projects, the web manifest's icons and the home-screen icon in
// public/icons. One composition everywhere — the brick with *ASILUM cut from it and its line running on, as the
// Masthead wears it (lib/wordmark.js; the word's set is Wordmark.jsx's WM) — on the dark ground (lib/grounds.js),
// the word sized to each canvas's safe zone: Apple's squircle, Android's circle, a phone's crop of the square
// splash. Rendered by sharp from SVG with the site's own fonts (public/fonts, fontconfig pointed at them), so a
// run draws the same on any machine; the outputs are committed, so the native projects build without it.
//
//   node scripts/store-assets.mjs
//
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { brickGeometry, brickPath, rimPath, WORD, BOLD, RUN } from "../lib/wordmark.js";
import { GROUND, WARN } from "../lib/grounds.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// fontconfig reads FONTCONFIG_FILE at its first use, so it is set before sharp loads
const FC = join(tmpdir(), "asilum-store-assets");
mkdirSync(FC, { recursive: true });
writeFileSync(join(FC, "fonts.conf"), [
  '<?xml version="1.0"?>', '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
  `<fontconfig><dir>${join(ROOT, "public/fonts")}</dir><cachedir>${join(FC, "cache")}</cachedir></fontconfig>`, "",
].join("\n"));
process.env.FONTCONFIG_FILE = join(FC, "fonts.conf");
const { default: sharp } = await import("sharp");

/** The wordmark as app/components/Wordmark.jsx sets it (WM there): the word's size and each letter's origin, the
 *  baseline, the asterisk's size and baseline, and the set (0.96 of the artwork, 40 to the right). */
const WM = { word: 161, star: 131, base: 121, x: [0, 155.2, 307.7, 337.7, 453, 604.3], starY: 94.2, set: { s: 0.96, dx: 40 } };
const SET = `translate(${WM.set.dx} ${+(60.625 * (1 - WM.set.s)).toFixed(4)}) scale(${WM.set.s})`;
const G = brickGeometry();
const INK = { l: WORD.aInk, r: WORD.mInk }; // the word's ink, left and right, in the logo's units
const INK_W = INK.r - INK.l, INK_MID = (INK.l + INK.r) / 2, BRICK_MID = (G.top + G.foot) / 2;

/** The logo on a w x h canvas: the word `frac` of the width, centred; the brick off the left edge and its line
 *  off the right. `ground` null leaves the canvas clear (Android's adaptive foreground; the letters stay the dark
 *  ground's colour, which the adaptive background supplies). */
function logoSvg({ w, h, frac, ground = GROUND.dark }) {
  const s = (w * frac) / INK_W;
  const tx = w / 2 - s * INK_MID, ty = h / 2 - s * BRICK_MID;
  const tail = (w - tx) / s - (G.toe + G.bend) + 200;
  const brick = brickPath(G, { left: -RUN, tail }), rim = rimPath(G, { left: -RUN, tail });
  const span = RUN + G.toe + tail + 400;
  const letters = "ASILUM".split("").map((ch, i) =>
    `<text x="${WM.x[i]}" y="${WM.base}" font-family="Michroma" font-size="${WM.word}" fill="${GROUND.dark}" stroke="${GROUND.dark}" stroke-width="${(BOLD / WM.set.s).toFixed(3)}" stroke-linejoin="round">${ch}</text>`).join("");
  const star = (extra = "") => `<text x="0" y="${WM.starY}" font-family="Inter" font-size="${WM.star}" fill="${WARN}"${extra}>*</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="haze" filterUnits="userSpaceOnUse" x="${-RUN}" y="${(G.top - 120).toFixed(1)}" width="${span}" height="${(G.foot - G.top + 240).toFixed(1)}"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="red" filterUnits="userSpaceOnUse" x="-120" y="-120" width="400" height="400"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  ${ground ? `<rect width="${w}" height="${h}" fill="${ground}"/>` : ""}
  <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})">
    <path d="${rim}" fill="#ffffff" fill-rule="evenodd" opacity="0.7" filter="url(#haze)"/>
    <path d="${brick}" fill="#ffffff"/>
    <g transform="${SET}">${letters}</g>
    <g transform="${SET}">${star(' opacity="0.8" filter="url(#red)"')}${star()}</g>
  </g>
</svg>`;
}

const written = [];
/** Renders one PNG; `round` masks it to a circle (the legacy round launcher icon); `opaque` drops the alpha
 *  channel (App Store Connect refuses an app icon that has one). */
async function render(file, spec, { round = false, opaque = true } = {}) {
  const out = join(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  let img = sharp(Buffer.from(logoSvg(spec)));
  if (round) {
    const { w, h } = spec;
    const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}" fill="#fff"/></svg>`;
    img = img.composite([{ input: Buffer.from(mask), blend: "dest-in" }]);
  }
  if (opaque) img = img.removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(out);
  written.push(relative(ROOT, out));
}

const ICON = 0.74;      // the word across an icon, inside Apple's squircle
const SAFE = 0.56;      // inside Android's adaptive safe zone (the central 66 of 108) and a maskable icon's
const SQUARE = 0.36;    // on the 2732 square splash: inside a phone's portrait crop of it
const SPLASH = 0.55;    // of the short side, on a splash of a known shape

// iOS: the one 1024 app icon and the universal splash (the launch storyboard scales it to fill)
await render("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", { w: 1024, h: 1024, frac: ICON });
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await render(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, { w: 2732, h: 2732, frac: SQUARE });
}

// Android: the launcher icons by density (legacy square and round, and the adaptive foreground), the splash drawables
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  const res = `android/app/src/main/res/mipmap-${d}`;
  await render(`${res}/ic_launcher.png`, { w: 48 * k, h: 48 * k, frac: ICON });
  await render(`${res}/ic_launcher_round.png`, { w: 48 * k, h: 48 * k, frac: SAFE }, { round: true, opaque: false });
  await render(`${res}/ic_launcher_foreground.png`, { w: 108 * k, h: 108 * k, frac: SAFE, ground: null }, { opaque: false });
}
const PORT = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const splash = (w, h) => ({ w, h, frac: (SPLASH * Math.min(w, h)) / w });
for (const [d, [w, h]] of Object.entries(PORT)) {
  await render(`android/app/src/main/res/drawable-port-${d}/splash.png`, splash(w, h));
  await render(`android/app/src/main/res/drawable-land-${d}/splash.png`, splash(h, w));
}
await render("android/app/src/main/res/drawable/splash.png", splash(480, 320));

// the web: the manifest's icons, the home-screen icon, the tab's
await render("public/icons/icon-32.png", { w: 32, h: 32, frac: 0.8 });
await render("public/icons/icon-192.png", { w: 192, h: 192, frac: ICON });
await render("public/icons/icon-512.png", { w: 512, h: 512, frac: ICON });
await render("public/icons/icon-maskable-512.png", { w: 512, h: 512, frac: SAFE });
await render("public/icons/apple-touch-icon.png", { w: 180, h: 180, frac: ICON });

console.log(`${written.length} pictures:\n` + written.map((f) => "  " + f).join("\n"));
