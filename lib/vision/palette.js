// lib/vision/palette.js
// Palette v0 — the moodboard's first REAL sight. Pure color statistics over
// image pixels: dominant swatches, brightness/saturation, and a curated
// color→aesthetic-tag mapping in the shared tag space (lib/brain/tags.js).
// HONEST LIMITS (carried in every result's `via`): colors only — no object,
// texture, silhouette, or garment recognition; that arrives with a real
// vision provider (lib/vision/index.js contracts). But color IS taste signal:
// a non-fashion image legitimately influences clothing recommendations
// through palette and mood — exactly the Alpha Brain spec.
// Pure module: no imports beyond the taxonomy; safe on client and server.

// Reference swatches for the COLORS taxonomy (lib/fashion-taxonomy).
const REF_COLORS = {
  black: [18, 18, 22], white: [245, 245, 242], grey: [128, 128, 132],
  cream: [232, 222, 200], brown: [92, 64, 44], navy: [28, 38, 68],
  olive: [88, 94, 58], burgundy: [92, 26, 38], red: [190, 32, 38],
  blue: [60, 90, 170], green: [52, 110, 70], pink: [228, 160, 180],
  silver: [190, 192, 200], gold: [198, 160, 80],
};

// Curated color → tag/mood seeds (same spirit as lib/music-mapping tables).
// Weights deliberately conservative (max ~0.35): color is a REAL taste hint
// but a weak one, and the culturally subjective pairings (pink→SEDUCTIVE,
// black→AVANT-GARDE) are capped lower still at ~0.25 per Codex review of #13.
const COLOR_TAGS = {
  black:    { tags: { "AVANT-GARDE": 0.25, MINIMAL: 0.3, TAILORED: 0.2 }, moods: ["nocturnal", "severe"] },
  white:    { tags: { MINIMAL: 0.35, TAILORED: 0.2 }, moods: ["clinical", "soft"] },
  grey:     { tags: { MINIMAL: 0.3, TAILORED: 0.25, UTILITARIAN: 0.15 }, moods: ["industrial"] },
  cream:    { tags: { ARCHIVAL: 0.3, MINIMAL: 0.25, TAILORED: 0.15 }, moods: ["romantic", "soft"] },
  brown:    { tags: { ARCHIVAL: 0.3, GORP: 0.25, UTILITARIAN: 0.15 }, moods: ["raw"] },
  navy:     { tags: { TAILORED: 0.35, ARCHIVAL: 0.15, MINIMAL: 0.15 }, moods: ["polished"] },
  olive:    { tags: { GORP: 0.35, UTILITARIAN: 0.3 }, moods: ["raw"] },
  burgundy: { tags: { SEDUCTIVE: 0.3, ARCHIVAL: 0.25 }, moods: ["moody", "romantic"] },
  red:      { tags: { STATEMENT: 0.35, SEDUCTIVE: 0.2 }, moods: ["playful"] },
  blue:     { tags: { STREETWEAR: 0.25, UTILITARIAN: 0.2, MINIMAL: 0.15 }, moods: [] },
  green:    { tags: { GORP: 0.3, UTILITARIAN: 0.15, INDEPENDENT: 0.15 }, moods: [] },
  pink:     { tags: { SEDUCTIVE: 0.25, STATEMENT: 0.25 }, moods: ["playful", "romantic"] },
  silver:   { tags: { "AVANT-GARDE": 0.3, STATEMENT: 0.2, MINIMAL: 0.15 }, moods: ["industrial", "ethereal"] },
  gold:     { tags: { STATEMENT: 0.3, SEDUCTIVE: 0.2, ARCHIVAL: 0.15 }, moods: ["polished"] },
};

const hex = (rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");

function nearestColor(rgb) {
  let best = "grey", bestD = Infinity;
  for (const [name, ref] of Object.entries(REF_COLORS)) {
    const d = (rgb[0] - ref[0]) ** 2 + (rgb[1] - ref[1]) ** 2 + (rgb[2] - ref[2]) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

// Dominant swatches from a flat RGBA pixel array (canvas getImageData.data).
// 4-bit-per-channel quantization → top-k bins by coverage, averaged back to
// true colors. Transparent pixels are skipped.
export function dominantPalette(rgba, k = 5) {
  const bins = new Map(); // key -> { n, r, g, b }
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += rgba[i]; b.g += rgba[i + 1]; b.b += rgba[i + 2];
    bins.set(key, b);
  }
  const total = [...bins.values()].reduce((s, b) => s + b.n, 0);
  if (!total) return [];
  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, k)
    .map((b) => {
      const rgb = [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)];
      return { rgb, hex: hex(rgb), name: nearestColor(rgb), weight: +(b.n / total).toFixed(4) };
    });
}

// Full v0 analysis: swatches, luminance/saturation stats, aggregated tag
// weights in the shared space, mood words, and lexicon-trainable words.
export function analyzePalette(rgba, k = 5) {
  const palette = dominantPalette(rgba, k);
  if (!palette.length) return null;

  let lum = 0, sat = 0;
  for (const s of palette) {
    const [r, g, b] = s.rgb.map((c) => c / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum += s.weight * (0.2126 * r + 0.7152 * g + 0.0722 * b);
    sat += s.weight * (mx === 0 ? 0 : (mx - mn) / mx);
  }
  const wTotal = palette.reduce((s, p) => s + p.weight, 0) || 1;
  const stats = { brightness: +(lum / wTotal).toFixed(3), saturation: +(sat / wTotal).toFixed(3) };

  const tags = {};
  const moods = new Set();
  for (const s of palette) {
    const m = COLOR_TAGS[s.name];
    if (!m) continue;
    for (const [t, w] of Object.entries(m.tags)) tags[t] = +((tags[t] || 0) + w * s.weight).toFixed(3);
    if (s.weight >= 0.12) for (const mood of m.moods) moods.add(mood);
  }
  if (stats.brightness < 0.25) moods.add("nocturnal");
  if (stats.saturation < 0.12) moods.add("muted");

  // Words the live lexicon can train on: tag names + dominant color names.
  const words = [
    ...Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([t]) => t.toLowerCase().replace(/-/g, " ")),
    ...palette.slice(0, 3).map((s) => s.name),
  ];

  return {
    palette: palette.map(({ hex: h, name, weight }) => ({ hex: h, name, weight })),
    stats, tags, moods: [...moods], words,
    via: "palette v0 — color statistics only; no object/texture/silhouette recognition",
  };
}

// SERVER-SIDE derivation from untrusted client swatches ({hex, weight} only —
// names and tag weights are NEVER accepted from the wire). Validation is
// atomic: any malformed entry, non-positive/overweight value, or total > 1.02
// rejects the whole payload (returns null → caller 400s). Canonical color
// names and shared-TAGS weights are recomputed here from the hex values.
export function paletteFromSwatches(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) return null;
  const palette = [];
  let total = 0;
  for (const s of input) {
    if (!s || typeof s !== "object") return null;
    const h = String(s.hex || "");
    if (!/^#[0-9a-f]{6}$/i.test(h)) return null;
    if (typeof s.weight !== "number" || !Number.isFinite(s.weight) || s.weight <= 0 || s.weight > 1) return null;
    const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    total += s.weight;
    palette.push({ hex: h.toLowerCase(), name: nearestColor(rgb), weight: +s.weight.toFixed(4) });
  }
  if (total > 1.02) return null;
  const tags = {};
  for (const s of palette) {
    const m = COLOR_TAGS[s.name];
    if (!m) continue;
    for (const [t, w] of Object.entries(m.tags)) tags[t] = +((tags[t] || 0) + w * s.weight).toFixed(3);
  }
  return { palette, tags };
}

// Merge several analyses (one per uploaded image) into one swatch list and
// one aggregated tag map — weights averaged across images.
export function mergePalettes(analyses = []) {
  const n = analyses.length;
  if (!n) return { palette: [], tags: {} };
  const byName = new Map();
  const tags = {};
  for (const a of analyses) {
    for (const s of a.palette) {
      const cur = byName.get(s.name) || { hex: s.hex, name: s.name, weight: 0 };
      cur.weight += s.weight / n;
      byName.set(s.name, cur);
    }
    for (const [t, w] of Object.entries(a.tags)) tags[t] = +((tags[t] || 0) + w / n).toFixed(3);
  }
  const palette = [...byName.values()]
    .map((s) => ({ ...s, weight: +s.weight.toFixed(4) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
  return { palette, tags };
}
