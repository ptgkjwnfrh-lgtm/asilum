# Tagging & palette

- Lexicon (lib/brain + fashion-taxonomy): curated axes + garment tokens;
  free text trains only through lexicon words.
- product_tags are TYPED rows (garment / aesthetic / palette / ...).
- Palette v0 (lib/vision/palette.js): REAL client-side color statistics —
  48px downsample, 4-bit quantization → weighted swatches; server derives
  names+tags via paletteFromSwatches (atomic validation: reject >8
  swatches, total>1.02, any bad entry). COLOR_TAGS capped ~0.35 (pink→
  SEDUCTIVE, black→AVANT-GARDE capped 0.25) so color never overwhelms
  garment signal. Moodboard uploads train from pixels even when filenames
  are meaningless (verified: IMG_4402).
- True vision (garment recognition) is a gated contract (lib/vision),
  not implemented — do not fake it.
