// tests/vision-palette.test.js — the first tests this module has ever had.
//
// `lib/vision/palette.js` is the moodboard's only real sight: pure colour
// statistics over pixels, feeding tag weights into the shared brain space. It
// has 5 importers in `app/` and, until this file, zero tests.
//
// That gap has already cost a shipped defect. The 14 August audit found
// `/upload` reading its palette as `getImageData(0, 0, 48, 48)` from a ~340px
// canvas — the top-left CORNER, not a downsample. On a 1600×1200 photo that is
// ~2.7% of the image, always the same corner, so a black coat on a white
// backdrop trained on the backdrop and the page told the user "palette v0 saw
// white". `/board` always did it correctly. The fix landed in
// `app/upload/page.js`; the module underneath was never wrong, and was also
// never covered.
//
// So these tests pin two things:
//   1. the module's actual contract — quantization, coverage weighting,
//      transparency, the composition statistics, and the honest-limits `via`
//      string that every caller surfaces to the user;
//   2. the invariant the corner-crop bug violated at the call site — a palette
//      is only ever a description of THE PIXELS IT WAS HANDED, so sampling a
//      corner and sampling the whole frame give different answers, on purpose.
//
// And `paletteFromSwatches` is the server's untrusted-input seam: the browser
// sends `{hex, weight}` and the server recomputes colour names and tag weights
// itself. A client that sends its own `name` or `tags` must not be believed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  analyzePalette, compositionStats, dominantPalette,
  mergePalettes, nearestColor, paletteFromSwatches,
} from "../lib/vision/palette.js";

// A flat run of `n` identical RGBA pixels.
const run = (n, rgba) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...rgba);
  return out;
};

const BLACK = [18, 18, 22, 255];
const WHITE = [245, 245, 242, 255];
// A true neutral: mx === mn, so saturation is exactly 0. `BLACK` above is the
// reference swatch and is very slightly blue ((22-18)/22 ≈ 0.18), which is
// above the "muted" threshold — a real distinction, not a rounding artefact.
const NEUTRAL = [20, 20, 20, 255];

// Source text with comments removed. A guard that reads the prose describing a
// bug will fire on the explanation of the fix — which is exactly what the first
// draft of this file did.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/([^:])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- nearestColor

test("nearestColor snaps a pixel to the canonical COLORS vocabulary", () => {
  assert.equal(nearestColor([18, 18, 22]), "black");
  assert.equal(nearestColor([245, 245, 242]), "white");
  assert.equal(nearestColor([190, 32, 38]), "red");
  assert.equal(nearestColor([28, 38, 68]), "navy");
  // Off-reference pixels still land on the nearest named swatch, which is what
  // makes the name safe to store: it is always one of the known vocabulary.
  assert.equal(nearestColor([4, 2, 9]), "black");
  assert.equal(nearestColor([250, 250, 250]), "white");
});

// ------------------------------------------------------------- dominantPalette

test("dominant swatch weights are the share of pixels that swatch covers", () => {
  const rgba = [...run(90, BLACK), ...run(10, WHITE)];
  const palette = dominantPalette(rgba, 5);

  assert.equal(palette.length, 2);
  assert.equal(palette[0].name, "black");
  assert.equal(palette[0].weight, 0.9);
  assert.equal(palette[0].hex, "#121216");
  assert.equal(palette[1].name, "white");
  assert.equal(palette[1].weight, 0.1);
  // Ordered by coverage, not by hue or luminance.
  assert.ok(palette[0].weight > palette[1].weight, "sorted by coverage descending");
});

test("fully transparent pixels are not colour evidence", () => {
  // 50 opaque black + 50 transparent white. The transparent half must not
  // dilute the weights: black covers 100% of the pixels that carry colour.
  const rgba = [...run(50, BLACK), ...run(50, [245, 245, 242, 0])];
  const palette = dominantPalette(rgba, 5);

  assert.equal(palette.length, 1, "only the opaque colour survives");
  assert.equal(palette[0].name, "black");
  assert.equal(palette[0].weight, 1, "weights renormalize over opaque pixels only");

  // The positive counterpart: make those same pixels opaque and white returns.
  const opaque = [...run(50, BLACK), ...run(50, WHITE)];
  assert.equal(dominantPalette(opaque, 5).length, 2);
});

test("an image with no opaque pixels yields no palette at all", () => {
  assert.deepEqual(dominantPalette(run(10, [1, 2, 3, 0]), 5), []);
  assert.deepEqual(dominantPalette([], 5), []);
  // Not a vacuous pass: the same pixels at full alpha do produce a swatch.
  assert.equal(dominantPalette(run(10, [1, 2, 3, 255]), 5).length, 1);
});

test("near-identical colours collapse into one swatch by 4-bit quantization", () => {
  // #101010 and #111111 share a quantization bin, so they are one swatch whose
  // rgb is their average — this is what stops a photo returning 5 shades of
  // the same grey as 5 "dominant" colours.
  const palette = dominantPalette([...run(1, [16, 16, 16, 255]), ...run(1, [17, 17, 17, 255])], 5);
  assert.equal(palette.length, 1);
  assert.deepEqual(palette[0].rgb, [17, 17, 17]);
  assert.equal(palette[0].weight, 1);
});

test("k caps how many swatches come back", () => {
  const rgba = [...run(9, BLACK), ...run(1, WHITE)];
  const one = dominantPalette(rgba, 1);
  assert.equal(one.length, 1);
  assert.equal(one[0].name, "black");
  assert.equal(one[0].weight, 0.9, "weight is still the share of the WHOLE image");
  assert.equal(dominantPalette(rgba, 5).length, 2);
});

// ------------------------------------------- the corner-crop lesson, in numbers

test("a palette describes only the pixels it was handed — the corner-crop bug", () => {
  // An 8×8 "black coat on a white backdrop": the top-left 4×4 quadrant is pure
  // backdrop, the rest of the frame is the coat. 48 of 64 pixels are black.
  const W = 8;
  const whole = [];
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) whole.push(...(x < 4 && y < 4 ? WHITE : BLACK));
  }

  // What `/board` always did: sample the WHOLE frame.
  const full = dominantPalette(whole, 5);
  assert.equal(full[0].name, "black", "the coat dominates the real image");
  assert.equal(full[0].weight, 0.75);

  // What `/upload` used to do: read a fixed top-left corner instead.
  const corner = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) corner.push(...WHITE);
  }
  const cropped = dominantPalette(corner, 5);
  assert.equal(cropped[0].name, "white", "the corner sees only backdrop");
  assert.equal(cropped[0].weight, 1);

  // The two disagree completely, and the module is right both times. This is
  // why the caller owes it a representative downsample, not a crop.
  assert.notEqual(full[0].name, cropped[0].name);
});

test("/upload scales the whole image into the sample canvas, never a corner crop", () => {
  // A source guard for the defect above: the fix is a property of the CALLER,
  // so nothing in this module can protect it. `/board` is the reference shape.
  // Comments are stripped first: this file explains the old bug verbatim, and
  // a guard that matches the explanation would pass or fail for the wrong
  // reason. The first draft of this test did exactly that.
  const upload = codeOnly(readFileSync(new URL("../app/upload/page.js", import.meta.url), "utf8"));

  // The sampling canvas is drawn with an explicit destination size, which is
  // what makes drawImage scale the whole bitmap instead of copying 1:1.
  assert.match(upload, /drawImage\(\s*bmp\s*,\s*0\s*,\s*0\s*,\s*S\s*,\s*S\s*\)/,
    "the whole bitmap is scaled into an S×S sampling canvas");
  assert.match(upload, /getImageData\(\s*0\s*,\s*0\s*,\s*S\s*,\s*S\s*\)/,
    "and the pixels are read back at that same sampling size");

  // The exact shape of the shipped bug: reading a hard-coded 48×48 window out
  // of the large display canvas. Guarded as a literal so it cannot return.
  assert.doesNotMatch(upload, /getImageData\(\s*0\s*,\s*0\s*,\s*48\s*,\s*48\s*\)/,
    "no fixed 48×48 window read from the display canvas");

  // Prove the stripper did not simply delete everything it was asked about.
  assert.ok(upload.includes("analyzePalette"), "code survived comment-stripping");
});

// ----------------------------------------------------------- compositionStats

test("composition statistics need a 2D grid and say so by returning null", () => {
  assert.equal(compositionStats(run(16, [10, 10, 10, 255]), 1), null, "width < 2");
  assert.equal(compositionStats(run(2, [10, 10, 10, 255]), 2), null, "height < 2");
  // Positive counterpart: the smallest legal grid does return statistics.
  const smallest = compositionStats(run(4, [10, 10, 10, 255]), 2);
  assert.equal(typeof smallest, "object");
  assert.equal(smallest.contrast, 0);
});

test("a flat field has no contrast and no edges; a checkerboard is maximal", () => {
  const flat = compositionStats(run(16, [128, 128, 132, 255]), 4);
  assert.equal(flat.contrast, 0, "one colour has zero luminance spread");
  assert.equal(flat.edges, 0, "and no neighbour ever differs");

  const checker = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) checker.push(...((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  }
  const cb = compositionStats(checker, 4);
  assert.equal(cb.contrast, 0.5, "half the pixels at each extreme");
  assert.equal(cb.edges, 1, "every neighbour is the opposite extreme");
});

test("hue spread separates a tonal image from a scattered one", () => {
  // Greyscale carries no hue at all: nothing passes the chroma gate.
  const grey = compositionStats(run(16, [128, 128, 132, 255]), 4);
  assert.equal(grey.chromatic, 0);
  assert.equal(grey.hueSpread, 0);

  // Sixteen different hues: every pixel is chromatic and the hues are scattered
  // right around the wheel.
  const hues = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
    [255, 0, 255], [0, 255, 255], [255, 128, 0], [128, 0, 255],
    [0, 128, 255], [128, 255, 0], [255, 0, 128], [0, 255, 128],
    [200, 60, 60], [60, 200, 60], [60, 60, 200], [200, 200, 60],
  ];
  const rgba = [];
  for (const c of hues) rgba.push(...c, 255);
  const varied = compositionStats(rgba, 4);
  assert.equal(varied.chromatic, 1, "every pixel cleared the chroma gate");
  assert.ok(varied.hueSpread > 0.9, `scattered hues score high (got ${varied.hueSpread})`);
});

// ------------------------------------------------------------- analyzePalette

test("analyzePalette declines to invent a reading from nothing", () => {
  assert.equal(analyzePalette([], 5, 0), null);
  assert.equal(analyzePalette(run(4, [1, 2, 3, 0]), 5, 0), null);
  // Positive counterpart: opaque pixels do produce a reading.
  assert.equal(typeof analyzePalette(run(4, BLACK), 5, 0), "object");
});

test("the `via` string states the honest limit, and changes when composition runs", () => {
  // Every caller surfaces `via` to the user, so it is a user-facing claim about
  // how much the machine actually saw. Both strings are pinned verbatim.
  const colourOnly = analyzePalette([...run(90, BLACK), ...run(10, WHITE)], 5, 0);
  assert.equal(
    colourOnly.via,
    "palette v0 — color statistics only; no object/texture/silhouette recognition",
  );
  assert.equal(colourOnly.stats.composition, undefined, "no composition without a width");

  const checker = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) checker.push(...((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  }
  const withComposition = analyzePalette(checker, 5, 4);
  assert.equal(
    withComposition.via,
    "palette v0.5 — color + composition statistics (contrast/edges/hue spread); no object or garment recognition",
  );
  assert.equal(withComposition.stats.composition.contrast, 0.5);
  // Neither string may ever claim garment, object or silhouette recognition.
  for (const via of [colourOnly.via, withComposition.via]) {
    assert.match(via, /no object|no garment/);
  }
});

test("tag weights are the colour's weight scaled by how much of the frame it covers", () => {
  // black → MINIMAL 0.3, AVANT-GARDE 0.25, TAILORED 0.2 at 90% coverage;
  // white → MINIMAL 0.35, TAILORED 0.2 at 10%.
  const a = analyzePalette([...run(90, BLACK), ...run(10, WHITE)], 5, 0);
  assert.equal(a.tags.MINIMAL, 0.305);   // 0.3*0.9 + 0.35*0.1
  assert.equal(a.tags["AVANT-GARDE"], 0.225); // 0.25*0.9
  assert.equal(a.tags.TAILORED, 0.2);    // 0.2*0.9 + 0.2*0.1

  // The cap that matters: colour is a real but WEAK signal, so no single tag
  // may outrun the curated ceiling.
  for (const [tag, weight] of Object.entries(a.tags)) {
    assert.ok(weight <= 0.35, `${tag} stays within the colour cap (got ${weight})`);
  }
});

test("brightness and saturation drive the mood words", () => {
  // Navy isolates the BRIGHTNESS rule. Its curated moods are ["polished"] and
  // do not contain "nocturnal", so if the frame reads nocturnal it can only be
  // because brightness fell below the threshold. Testing this with black would
  // prove nothing — black carries "nocturnal" in its own colour mapping, so the
  // assertion passes even with the brightness rule switched off. (It did, until
  // a mutation run caught it.)
  const navy = analyzePalette(run(100, [28, 38, 68, 255]), 5, 0);
  assert.equal(navy.stats.brightness, 0.149);
  assert.ok(navy.moods.includes("polished"), "navy's own curated mood");
  assert.ok(navy.moods.includes("nocturnal"), "and darkness adds nocturnal on top");

  const dark = analyzePalette(run(100, BLACK), 5, 0);
  assert.ok(dark.stats.brightness < 0.25, `dark (got ${dark.stats.brightness})`);
  assert.ok(dark.moods.includes("nocturnal"), "a dark frame reads nocturnal");
  // The reference black is very slightly blue, so it clears the muted gate.
  assert.equal(dark.stats.saturation, 0.182);
  assert.equal(dark.moods.includes("muted"), false, "0.182 saturation is not muted");

  // A true neutral is. This is the boundary the two swatches sit either side of.
  const neutral = analyzePalette(run(100, NEUTRAL), 5, 0);
  assert.equal(neutral.stats.saturation, 0);
  assert.ok(neutral.moods.includes("muted"), "zero saturation reads muted");

  const bright = analyzePalette(run(100, WHITE), 5, 0);
  assert.ok(bright.stats.brightness > 0.8, `bright (got ${bright.stats.brightness})`);
  assert.equal(bright.moods.includes("nocturnal"), false, "a white frame is not nocturnal");
  assert.ok(bright.moods.includes("clinical"), "white carries its own curated moods");
});

test("trainable words are lowercase, hyphen-free, and lead with the strongest tags", () => {
  const a = analyzePalette([...run(90, BLACK), ...run(10, WHITE)], 5, 0);
  // MINIMAL is the heaviest tag, so it leads; AVANT-GARDE arrives as two words
  // because the live lexicon is trained on words, not tag identifiers.
  assert.deepEqual(a.words, ["minimal", "avant garde", "tailored", "black", "white"]);
  for (const w of a.words) {
    assert.equal(w, w.toLowerCase(), `${w} is lowercase`);
    assert.equal(w.includes("-"), false, `${w} carries no hyphen`);
  }
});

test("composition adds its own tags, capped below the colour weights", () => {
  const checker = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) checker.push(...((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  }
  const withComp = analyzePalette(checker, 5, 4);
  const withoutComp = analyzePalette(checker, 5, 0);

  // A busy, high-contrast frame reads as STATEMENT/STREETWEAR — tags the same
  // pixels do NOT earn when composition is switched off.
  assert.equal(withComp.tags.STATEMENT, 0.15);
  assert.equal(withComp.tags.STREETWEAR, 0.1);
  assert.equal(withoutComp.tags.STATEMENT, undefined);
  assert.ok(withComp.words.includes("graphic"), "and it is described as graphic");

  // Texture is weaker evidence than colour, so every composition-only weight
  // sits at or below 0.2.
  assert.ok(withComp.tags.STATEMENT <= 0.2);
  assert.ok(withComp.tags.STREETWEAR <= 0.2);
});

// -------------------------------------------------------- paletteFromSwatches

test("the server recomputes colour names from hex and never trusts the client's", () => {
  // The wire seam. A hostile client sends a red swatch labelled "gold" with a
  // fabricated tag map; the server must keep only `hex` and `weight`.
  const out = paletteFromSwatches([
    { hex: "#BE2026", weight: 0.5, name: "gold", tags: { MINIMAL: 9 } },
  ]);

  assert.equal(out.palette[0].name, "red", "the name comes from the hex, not the wire");
  assert.equal(out.palette[0].hex, "#be2026", "and is normalized to lowercase");
  // Tags are recomputed from red's curated row, so the injected 9 is gone.
  assert.deepEqual(out.tags, { STATEMENT: 0.175, SEDUCTIVE: 0.1 });
  assert.equal(out.tags.MINIMAL, undefined, "the client's tag map is discarded");
  assert.equal("tags" in out.palette[0], false, "no per-swatch tags survive the wire");
});

test("one malformed swatch rejects the whole payload, atomically", () => {
  // The good swatch alone is accepted — so the rejections below are real.
  assert.equal(paletteFromSwatches([{ hex: "#000000", weight: 0.5 }]).palette.length, 1);

  assert.equal(paletteFromSwatches([{ hex: "#000000", weight: 0.5 }, { hex: "zzz", weight: 0.5 }]), null,
    "a valid entry does not rescue an invalid sibling");
});

test("every malformed swatch shape is refused", () => {
  const rejected = {
    "not an array": "nope",
    "null": null,
    "empty": [],
    "nine swatches": Array.from({ length: 9 }, () => ({ hex: "#000000", weight: 0.01 })),
    "bad hex": [{ hex: "nope", weight: 0.5 }],
    "short hex": [{ hex: "#fff", weight: 0.5 }],
    "zero weight": [{ hex: "#000000", weight: 0 }],
    "negative weight": [{ hex: "#000000", weight: -0.2 }],
    "weight over 1": [{ hex: "#000000", weight: 1.5 }],
    "NaN weight": [{ hex: "#000000", weight: NaN }],
    "string weight": [{ hex: "#000000", weight: "0.5" }],
    "null entry": [null],
  };
  for (const [why, input] of Object.entries(rejected)) {
    assert.equal(paletteFromSwatches(input), null, why);
  }
});

test("the total-weight ceiling is 1.02, and it is a boundary not a vibe", () => {
  // Slightly over 1.0 is tolerated because client rounding is real.
  const ok = paletteFromSwatches([{ hex: "#000000", weight: 0.51 }, { hex: "#ffffff", weight: 0.51 }]);
  assert.equal(ok.palette.length, 2, "1.02 exactly is accepted");

  assert.equal(
    paletteFromSwatches([{ hex: "#000000", weight: 0.515 }, { hex: "#ffffff", weight: 0.515 }]),
    null, "1.03 is refused",
  );
});

test("eight swatches are allowed and nine are not", () => {
  const eight = Array.from({ length: 8 }, () => ({ hex: "#000000", weight: 0.01 }));
  assert.equal(paletteFromSwatches(eight).palette.length, 8);
  assert.equal(paletteFromSwatches([...eight, { hex: "#000000", weight: 0.01 }]), null);
});

// ------------------------------------------------------------- mergePalettes

test("merging averages each image's contribution rather than concatenating", () => {
  const black = analyzePalette(run(100, BLACK), 5, 0);
  const white = analyzePalette(run(100, WHITE), 5, 0);
  const merged = mergePalettes([black, white]);

  assert.equal(merged.palette.length, 2);
  assert.equal(merged.palette[0].weight, 0.5, "each image contributes half");
  assert.equal(merged.palette[1].weight, 0.5);
  // MINIMAL: black 0.3 and white 0.35, averaged over two images.
  assert.equal(merged.tags.MINIMAL, 0.325);
  // AVANT-GARDE came from one image only, so it is halved.
  assert.equal(merged.tags["AVANT-GARDE"], 0.125);
});

test("the same colour across images merges into one swatch", () => {
  const one = analyzePalette(run(100, BLACK), 5, 0);
  const merged = mergePalettes([one, one, one]);
  assert.equal(merged.palette.length, 1, "black is one swatch, not three");
  assert.equal(merged.palette[0].weight, 1, "and its weight is preserved");
});

test("a merged palette is capped at six swatches", () => {
  const colours = [
    [18, 18, 22], [245, 245, 242], [128, 128, 132], [232, 222, 200],
    [92, 64, 44], [28, 38, 68], [88, 94, 58], [190, 32, 38],
  ];
  const analyses = colours.map((c) => analyzePalette(run(10, [...c, 255]), 5, 0));
  assert.equal(analyses.length, 8);
  assert.equal(mergePalettes(analyses).palette.length, 6);
});

test("merging nothing returns an empty reading, not a crash", () => {
  assert.deepEqual(mergePalettes([]), { palette: [], tags: {} });
  assert.deepEqual(mergePalettes(), { palette: [], tags: {} });
  // Positive counterpart: one analysis in, one palette out.
  assert.equal(mergePalettes([analyzePalette(run(10, BLACK), 5, 0)]).palette.length, 1);
});
