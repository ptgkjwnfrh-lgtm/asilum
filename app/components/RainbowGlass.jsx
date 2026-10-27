"use client";

// app/components/RainbowGlass.jsx — THE V.1 RAINBOW, ON THE WHEEL ALONE
// (owner, 27 Oct 2026: "for the liquid glass rainbow effect, simply add
// whatever liquid glass rainbow effect the earlier version of asilum
// magazine had as shown in the picture, i want the images behind the disc
// to cause liquid glass distortion and refraction to cause a rainbow
// effect"; "the disc is the actual liquid glass wheel").
//
// Restored, not invented: this is the magazine's glass as it stood on 9 Sep
// 2026 (LiquidGlass.jsx at bdd5397 — the strip over the FRONT COVER letters
// in the owner's pictures 8.png and IMG_1534.png). The bezel bends the
// backdrop through the pane's colour map three times — red pulled 80, green
// 86, blue 92 ("glass disperses: red bends least, blue most") — each pass
// keeps its own colour, the three are summed, and the weight picture blends
// that lens into the clear middle. Safari's page-side chain is the same
// three pulls. Only the wheel (ScrollWheel.jsx) passes this to
// useLiquidGlass; every other pane bends every colour alike (LiquidGlass.jsx,
// PULL; the owner's "take away the rainbow", 26 Oct), and
// tests/v2-fixtures-sketch.test.js fails if the split reaches another glass.

export const V1_PULL = Object.freeze([80, 86, 92]);

// the filter, as V.1 drew it (only the refs' names follow the shared hook's)
function V1Defs({ id, mapRef, weightRef, strength = 1 }) {
  const [sr, sg, sb] = V1_PULL.map((v) => (v * strength).toFixed(1));
  return (
    <svg className="glass-defs" aria-hidden="true" focusable="false">
    <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
      <feImage ref={mapRef} preserveAspectRatio="none" result="lgmap" />
      <feImage ref={weightRef} preserveAspectRatio="none" result="lgw" />
      <feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgmap" scale={sr} xChannelSelector="R" yChannelSelector="G" result="bentR" />
      <feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgmap" scale={sg} xChannelSelector="R" yChannelSelector="G" result="bentG" />
      <feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgmap" scale={sb} xChannelSelector="R" yChannelSelector="G" result="bentB" />
      <feColorMatrix data-lens="1" in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR" />
      <feColorMatrix data-lens="1" in="bentG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chG" />
      <feColorMatrix data-lens="1" in="bentB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chB" />
      <feComposite data-lens="1" in="chR" in2="chG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="chRG" />
      <feComposite data-lens="1" in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens" />
      <feColorMatrix in="lgw" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="w" />
      <feColorMatrix in="lgw" type="matrix" values="-1 0 0 0 1  -1 0 0 0 1  -1 0 0 0 1  0 0 0 0 1" result="iw" />
      <feComposite data-lens="1" in="lens" in2="w" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lensW" />
      <feComposite in="SourceGraphic" in2="iw" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="frostW" />
      <feComposite in="lensW" in2="frostW" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    </svg>
  );
}

// Safari's page-side chain, as V.1 drew it — inside the pane's rectangle
// (data-pb, so a card passes through untouched outside the wheel)
function v1Chain(strength = 1) {
  const [sr, sg, sb] = V1_PULL.map((v) => (v * strength).toFixed(1));
  return (imgId, webkit) => `<feFlood flood-color="rgb(128,128,128)" result="flat"/>` +
    (webkit ? `<feImage href="#${imgId}" result="pane"/>` : `<feImage preserveAspectRatio="none" result="pane"/>`) +
    `<feComposite in="pane" in2="flat" operator="over" result="map"/>` +
    `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${sr}" xChannelSelector="R" yChannelSelector="G" result="bR"/>` +
    `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${sg}" xChannelSelector="R" yChannelSelector="G" result="bG"/>` +
    `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${sb}" xChannelSelector="R" yChannelSelector="G" result="bB"/>` +
    `<feColorMatrix data-pb="1" in="bR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR"/>` +
    `<feColorMatrix data-pb="1" in="bG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG"/>` +
    `<feColorMatrix data-pb="1" in="bB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB"/>` +
    `<feComposite in="cR" in2="cG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="cRG"/>` +
    `<feComposite in="cRG" in2="cB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens"/>` +
    `<feComposite in="lens" in2="SourceGraphic" operator="over"/>`;
}

/** What useLiquidGlass takes as `dispersion`: the V.1 filter and Safari chain. */
export const V1_RAINBOW = Object.freeze({ Defs: V1Defs, chain: v1Chain });
