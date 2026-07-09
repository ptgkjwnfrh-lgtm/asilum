// lib/fashion-taxonomy/index.js
// The shared fashion vocabulary for the Alpha Learning Brain.
// AESTHETIC_TAGS re-exports the LIVE tag space the Alpha Learning Bridge
// already scores against (lib/brain/tags.js) — one vocabulary, no forks.
// The other axes are curated starter taxonomies for the Product Brain and
// vision contracts; extend them as real data arrives.

export { TAGS as AESTHETIC_TAGS } from "../brain/tags.js";

export const CATEGORIES = [
  "outerwear", "tops", "bottoms", "dresses", "knitwear", "denim",
  "footwear", "bags", "jewelry", "accessories", "tailoring", "underlayers",
];

export const MATERIALS = [
  "cotton", "wool", "leather", "denim", "silk", "linen", "nylon",
  "polyester", "cashmere", "suede", "velvet", "mesh", "metal", "canvas",
];

export const SILHOUETTES = [
  "oversized", "boxy", "slim", "draped", "structured", "flared",
  "cropped", "elongated", "asymmetric", "voluminous", "fitted",
];

export const COLORS = [
  "black", "white", "grey", "cream", "brown", "navy", "olive",
  "burgundy", "red", "blue", "green", "pink", "silver", "gold",
];

export const ERAS = [
  "90s", "y2k", "70s", "80s", "60s", "archive", "contemporary", "futurist",
];

export const MOODS = [
  "moody", "romantic", "clinical", "raw", "polished", "playful",
  "severe", "soft", "industrial", "ethereal", "nocturnal",
];

export const CONDITIONS = ["new", "like-new", "used", "vintage", "distressed-by-design"];

export const RESALE_STATUS = ["retail", "resale", "archive", "grail", "deadstock"];
